package app.minzmahallu.print

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import java.io.File
import java.io.FileOutputStream

/** A line of text with its own weight, colour and alignment. */
data class PdfLine(
    val text: String,
    val sizeSp: Float = 11f,
    val bold: Boolean = false,
    val align: PdfAlign = PdfAlign.Left,
    val gapBeforePt: Float = 0f,
    val colour: Int = 0xFF182230.toInt(),
)

enum class PdfAlign { Left, Centre, Right }

/** A two-column key/value row, the shape most of a receipt is made of. */
data class PdfRow(
    val label: String,
    val value: String,
    val bold: Boolean = false,
)

/** A horizontal rule, optionally with a gap above it. */
data class PdfRule(val gapBeforePt: Float = 8f, val thicknessPt: Float = 0.7f)

/**
 * Renders receipts, certificates and statements to PDF.
 *
 * The desktop builds an HTML template and lets Chromium's print-to-PDF lay it
 * out. Shipping a WebView just to print would cost more than the whole rest of
 * the app, so the same layouts are drawn onto `PdfDocument` directly: a fixed
 * A4 page, a measured text run, and the same margin and rule geometry the
 * templates use. Output is a real PDF that any reader, printer or WhatsApp can
 * take, and it is byte-for-byte deterministic for the same input.
 */
class PdfRenderer(private val context: Context) {

    /** A4 at 72 dpi, which is the unit `PdfDocument` works in. */
    private val pageWidth = 595
    private val pageHeight = 842
    private val margin = 44f

    /**
     * Writes one document.
     *
     * @return the file, in the app's external files directory so the share sheet
     *   and the printer service can both reach it.
     */
    fun render(
        fileName: String,
        title: String,
        subtitle: String?,
        mahalluName: String,
        mahalluAddress: String?,
        body: List<Any>,
        footer: String? = null,
    ): File {
        val document = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
        val page = document.startPage(pageInfo)
        val canvas = page.canvas

        var y = drawLetterhead(canvas, title, subtitle, mahalluName, mahalluAddress)

        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            colourOrDefault()
            typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL)
        }
        val bold = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            colourOrDefault()
            typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
        }
        val rule = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFC9D2DC.toInt()
            strokeWidth = 0.7f
        }

        body.forEach { element ->
            when (element) {
                is PdfLine -> {
                    y += element.gapBeforePt
                    val paint = if (element.bold) bold else text
                    paint.textSize = element.sizeSp * 1.05f
                    paint.color = element.colour
                    val x = when (element.align) {
                        PdfAlign.Left -> margin
                        PdfAlign.Centre -> (pageWidth - paint.measureText(element.text)) / 2f
                        PdfAlign.Right -> pageWidth - margin - paint.measureText(element.text)
                    }
                    y += paint.fontSpacing
                    canvas.drawText(element.text, x, y, paint)
                }

                is PdfRow -> {
                    y += 15f
                    text.textSize = 11.5f
                    bold.textSize = 11.5f
                    canvas.drawText(element.label, margin, y, text)
                    val valuePaint = if (element.bold) bold else text
                    canvas.drawText(
                        element.value,
                        pageWidth - margin - valuePaint.measureText(element.value),
                        y,
                        valuePaint,
                    )
                }

                is PdfRule -> {
                    y += element.gapBeforePt
                    rule.strokeWidth = element.thicknessPt
                    canvas.drawLine(margin, y, pageWidth - margin, y, rule)
                }
            }
        }

        if (footer != null) {
            text.textSize = 9.5f
            text.color = 0xFF6B7785.toInt()
            canvas.drawText(footer, margin, pageHeight - 34f, text)
        }

        document.finishPage(page)

        val directory = context.getExternalFilesDir("documents") ?: context.filesDir
        directory.mkdirs()
        val target = File(directory, fileName)
        FileOutputStream(target).use { document.writeTo(it) }
        document.close()
        return target
    }

    /** The masthead every MMS document carries. */
    private fun drawLetterhead(
        canvas: Canvas,
        title: String,
        subtitle: String?,
        mahalluName: String,
        mahalluAddress: String?,
    ): Float {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { colourOrDefault() }
        var y = margin

        paint.textSize = 17f
        paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
        canvas.drawText(mahalluName, margin, y + paint.fontSpacing, paint)
        y += paint.fontSpacing

        if (!mahalluAddress.isNullOrBlank()) {
            paint.textSize = 10f
            paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL)
            paint.color = 0xFF5A6675.toInt()
            canvas.drawText(mahalluAddress, margin, y + paint.fontSpacing, paint)
            y += paint.fontSpacing
        }

        y += 14f
        paint.textSize = 14f
        paint.color = 0xFF0E9C8D.toInt()
        paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
        val titleX = (pageWidth - paint.measureText(title)) / 2f
        canvas.drawText(title, titleX, y + paint.fontSpacing, paint)
        y += paint.fontSpacing

        if (subtitle != null) {
            paint.textSize = 10.5f
            paint.color = 0xFF5A6675.toInt()
            paint.typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL)
            val subtitleX = (pageWidth - paint.measureText(subtitle)) / 2f
            canvas.drawText(subtitle, subtitleX, y + paint.fontSpacing, paint)
            y += paint.fontSpacing
        }

        y += 12f
        val rule = Paint().apply {
            color = 0xFF0E9C8D.toInt()
            strokeWidth = 1.4f
        }
        canvas.drawLine(margin, y, pageWidth - margin, y, rule)
        return y + 14f
    }

    private fun Paint.colourOrDefault() {
        color = 0xFF182230.toInt()
    }
}
