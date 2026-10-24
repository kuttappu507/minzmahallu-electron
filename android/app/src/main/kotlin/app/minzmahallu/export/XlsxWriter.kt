package app.minzmahallu.export

import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** One worksheet: a header row plus data rows, all as strings. */
data class Sheet(
    val name: String,
    val headers: List<String>,
    val rows: List<List<String>>,
)

/**
 * A minimal .xlsx writer.
 *
 * An .xlsx file is a ZIP of XML parts, so the whole format can be produced with
 * `ZipOutputStream` and string building — no Apache POI, whose desktop
 * footprint (several MB of jars, plus `java.awt` assumptions) does not belong
 * on a phone. This writes exactly what the reports need: one or more sheets, a
 * bold header row, inline strings, and numbers stored as numbers so Excel can
 * still sum a column.
 *
 * Shared strings are skipped deliberately; inline strings are valid OOXML and
 * keep the writer small. Excel, LibreOffice and Google Sheets all read them.
 */
object XlsxWriter {

    private const val NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    private const val REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    private const val CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
    private const val REL_PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
    private const val REL_SHEET =
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    private const val REL_STYLES =
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"

    /**
     * Writes the workbook into the app's external cache directory, which the
     * share sheet can hand to any other app and the OS can reclaim later.
     */
    fun write(fileName: String, sheets: List<Sheet>, directory: File? = null): File {
        require(sheets.isNotEmpty()) { "a workbook needs at least one sheet" }
        val target = File(directory ?: File(System.getProperty("java.io.tmpdir")), fileName)
        target.parentFile?.mkdirs()

        ZipOutputStream(FileOutputStream(target)).use { zip ->
            zip.put("[Content_Types].xml", contentTypes(sheets.size))
            zip.put("_rels/.rels", rootRels())
            zip.put("xl/workbook.xml", workbook(sheets))
            zip.put("xl/_rels/workbook.xml.rels", workbookRels(sheets.size))
            zip.put("xl/styles.xml", styles())
            sheets.forEachIndexed { index, sheet ->
                zip.put("xl/worksheets/sheet${index + 1}.xml", sheetXml(sheet))
            }
        }
        return target
    }

    private fun ZipOutputStream.put(name: String, content: String) {
        putNextEntry(ZipEntry(name))
        write(content.toByteArray(Charsets.UTF_8))
        closeEntry()
    }

    private fun contentTypes(sheetCount: Int): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<Types xmlns="$CT_NS">""")
        append("""<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>""")
        append("""<Default Extension="xml" ContentType="application/xml"/>""")
        append(
            """<Override PartName="/xl/workbook.xml" """ +
                """ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>""",
        )
        repeat(sheetCount) { index ->
            append(
                """<Override PartName="/xl/worksheets/sheet${index + 1}.xml" """ +
                    """ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>""",
            )
        }
        append(
            """<Override PartName="/xl/styles.xml" """ +
                """ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>""",
        )
        append("</Types>")
    }

    private fun rootRels(): String = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""" +
        """<Relationships xmlns="$REL_PKG_NS">""" +
        """<Relationship Id="rId1" Type="$REL_NS" Target="xl/workbook.xml"/>""" +
        """</Relationships>"""

    private fun workbook(sheets: List<Sheet>): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<workbook xmlns="$NS" xmlns:r="$REL_NS">""")
        append("<sheets>")
        sheets.forEachIndexed { index, sheet ->
            append(
                """<sheet name="${escape(sheetName(sheet.name))}" """ +
                    """sheetId="${index + 1}" r:id="rId${index + 1}"/>""",
            )
        }
        append("</sheets></workbook>")
    }

    private fun workbookRels(sheetCount: Int): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<Relationships xmlns="$REL_PKG_NS">""")
        repeat(sheetCount) { index ->
            append(
                """<Relationship Id="rId${index + 1}" Type="$REL_SHEET" """ +
                    """Target="worksheets/sheet${index + 1}.xml"/>""",
            )
        }
        append(
            """<Relationship Id="rId${sheetCount + 1}" Type="$REL_STYLES" Target="styles.xml"/>""",
        )
        append("</Relationships>")
    }

    /** Two cell formats: 0 = plain, 1 = bold (the header row). */
    private fun styles(): String = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""" +
        """<styleSheet xmlns="$NS">""" +
        """<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>""" +
        """<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>""" +
        """<fills count="1"><fill><patternFill patternType="none"/></fill></fills>""" +
        """<borders count="1"><border/></borders>""" +
        """<cellStyleXfs count="1"><xf/></cellStyleXfs>""" +
        """<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>""" +
        """</styleSheet>"""

    private fun sheetXml(sheet: Sheet): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<worksheet xmlns="$NS"><sheetData>""")

        // Header row, bold.
        append("""<row r="1">""")
        sheet.headers.forEachIndexed { column, header ->
            append(inlineString(column, 0, 1, header))
        }
        append("</row>")

        // Data rows. A value that parses as a number is written as one, so the
        // exported column stays summable in Excel rather than left-aligned text.
        sheet.rows.forEachIndexed { rowIndex, row ->
            val r = rowIndex + 2
            append("""<row r="$r">""")
            row.forEachIndexed { column, value ->
                val number = value.toDoubleOrNull()
                if (number != null && value.isNotBlank()) {
                    append("""<c r="${cellRef(column, r)}"><v>$number</v></c>""")
                } else {
                    append(inlineString(column, rowIndex + 1, 0, value))
                }
            }
            append("</row>")
        }

        append("</sheetData></worksheet>")
    }

    private fun inlineString(column: Int, row: Int, style: Int, value: String): String =
        """<c r="${cellRef(column, row + 1)}" s="$style" t="inlineStr">""" +
            """<is><t xml:space="preserve">${escape(value)}</t></is></c>"""

    /** Column index 0 → "A", 26 → "AA". */
    private fun cellRef(column: Int, row: Int): String {
        var index = column
        val letters = StringBuilder()
        do {
            letters.insert(0, ('A' + index % 26))
            index = index / 26 - 1
        } while (index >= 0)
        return "$letters$row"
    }

    /** Sheet names are capped at 31 characters and cannot contain []:*?/\. */
    private fun sheetName(name: String): String =
        name.filterNot { it in "[]:*?/\\" }.ifBlank { "Sheet" }.take(31)

    private fun escape(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        // Control characters other than tab/newline are illegal in XML 1.0.
        .filter { it == '\t' || it == '\n' || it == '\r' || it.code >= 0x20 }
}
