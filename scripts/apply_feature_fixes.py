from pathlib import Path
import re


def edit(path, fn):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    n = fn(s)
    if n != s:
        p.write_text(n, encoding="utf-8")

# Token data: include the family head's name for the printed token card.
def token_data(s):
    old = '''SELECT ta.token_code, ta.status, ta.collected_at, ta.created_at,
       f.family_number, f.house_name, f.ward, f.house_number, f.phone,
       te.event_name, te.event_date, te.venue, te.event_time'''
    new = '''SELECT ta.token_code, ta.status, ta.collected_at, ta.created_at,
       f.family_number, f.house_name, f.ward, f.house_number, f.phone,
       (SELECT m.name FROM members m WHERE m.family_id = f.id AND m.is_head = 1 AND m.status = 'Active' ORDER BY m.id LIMIT 1) AS house_head_name,
       te.event_name, te.event_date, te.venue, te.event_time'''
    return s.replace(old, new, 1)
edit("electron/services/data.service.ts", token_data)

# Marriage NOC certificate API.
def cert_data(s):
    if "issueMarriageNoc:" in s:
        return s
    marker = "  issueDeath:"
    idx = s.find(marker)
    if idx < 0:
        return s
    method = '''  issueMarriageNoc: (marriageNum: string, userId: number) => {
    const marriage = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNum]);
    if (!marriage) throw new Error("Marriage record not found");
    const certificateNumber = scalar<string>("SELECT 'NOC-' || printf('%04d', COALESCE(MAX(id),0)+1) FROM certificates");
    const issuedTo = [marriage.bride_name, marriage.groom_name].filter(Boolean).join(" & ");
    const result = run(
      `INSERT INTO certificates (certificate_number, type, marriage_id, issued_to, issued_date, issued_by, notes)
       VALUES (?, 'NOC', ?, ?, date('now'), ?, ?)`,
      [certificateNumber, marriage.id, issuedTo, userId, `No Objection Certificate for marriage ${marriage.marriage_number}`]
    );
    return { id: result.id, certificate_number: certificateNumber };
  },
'''
    return s[:idx] + method + s[idx:]
edit("electron/services/data.service.ts", cert_data)

# Main-process IPC bridge.
edit("electron/main.ts", lambda s: s if "certificates:issueMarriageNoc" in s else s.replace(
    '  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));',
    '  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));\n  ipcMain.handle("certificates:issueMarriageNoc", (_e, marriageNum) => data.certificates.issueMarriageNoc(marriageNum, session.user?.id ?? 1));', 1))

# Renderer bridge.
edit("electron/preload.mts", lambda s: s if "issueMarriageNoc" in s else s.replace(
    'issueMarriage:(m:string)=>ipcRenderer.invoke("certificates:issueMarriage",m),',
    'issueMarriage:(m:string)=>ipcRenderer.invoke("certificates:issueMarriage",m),issueMarriageNoc:(m:string)=>ipcRenderer.invoke("certificates:issueMarriageNoc",m),', 1))

# Certificates screen: add NOC as a marriage-record based certificate.
def cert_page(s):
    s = s.replace('type IssueType = "membership" | "residence" | "marriage" | "death";',
                  'type IssueType = "membership" | "residence" | "marriage" | "marriage_noc" | "death";')
    needle = '''    death: {
      title: `${t("cert_death")} ${t("cert_title")}`,'''
    if "marriage_noc:" not in s and needle in s:
        noc = '''    marriage_noc: {
      title: `Marriage NOC ${t("cert_title")}`,
      codeLabel: t("cert_marriage_number"),
      needsIssuedTo: false,
      loader: async () => {
        const r = await window.mms.marriages.list({ pageSize: 100 });
        return (r?.rows || []).map((m: any) => ({
          id: m.id,
          code: m.marriage_number || "",
          primaryName: m.bride_name || "—",
          secondaryName: m.groom_name,
          sub: m.nikah_date ? formatDate(m.nikah_date) : "",
        }));
      },
    },
'''
        s = s.replace(needle, noc + needle, 1)
    s = s.replace('''        case "marriage":
          result = await window.mms.certificates.issueMarriage(selectedRow.code);
          break;''', '''        case "marriage":
          result = await window.mms.certificates.issueMarriage(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;''', 1)
    if 'label: "Marriage NOC"' not in s:
        s = s.replace('''    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, tint: "t-pink" },''',
                      '''    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, tint: "t-pink" },
    { type: "marriage_noc" as IssueType, label: "Marriage NOC", icon: FileCheck2, tint: "t-vio" },''', 1)
    return s
edit("src/pages/Certificates.tsx", cert_page)

# Certificate template: NOC title and wording, including Malayalam.
def cert_template(s):
    s = s.replace(
        "membership:'അംഗത്വ സർട്ടിഫിക്കറ്റ്',residence:'വസതി സർട്ടിഫിക്കറ്റ്',marriage:'വിവാഹ സർട്ടിഫിക്കറ്റ്',death:'മരണ സർട്ടിഫിക്കറ്റ്',certificate:'സർട്ടിഫിക്കറ്റ്'",
        "membership:'അംഗത്വ സർട്ടിഫിക്കറ്റ്',residence:'വസതി സർട്ടിഫിക്കറ്റ്',marriage:'വിവാഹ സർട്ടിഫിക്കറ്റ്',noc:'വിവാഹത്തിനുള്ള എതിർപ്പില്ലാ സർട്ടിഫിക്കറ്റ്',death:'മരണ സർട്ടിഫിക്കറ്റ്',certificate:'സർട്ടിഫിക്കറ്റ്'", 1)
    s = s.replace(
        "membership:'MEMBERSHIP CERTIFICATE',residence:'RESIDENCE CERTIFICATE',marriage:'MARRIAGE CERTIFICATE',death:'DEATH CERTIFICATE',certificate:'CERTIFICATE'",
        "membership:'MEMBERSHIP CERTIFICATE',residence:'RESIDENCE CERTIFICATE',marriage:'MARRIAGE CERTIFICATE',noc:'NO OBJECTION CERTIFICATE FOR MARRIAGE',death:'DEATH CERTIFICATE',certificate:'CERTIFICATE'", 1)
    return s
edit("electron/print/certificate.template.ts", cert_template)

# Defensive cleanup: previous automated passes duplicated declarations/blocks.
preload = Path("electron/preload.mts")
if preload.exists():
    s = preload.read_text(encoding="utf-8")
    repeated = ',removeEvent:(id:number)=>ipcRenderer.invoke("tokens:removeEvent",id)'
    while s.count(repeated) > 1:
        s = s.replace(repeated, '', 1)
    preload.write_text(s, encoding="utf-8")

tokens = Path("src/pages/Tokens.tsx")
if tokens.exists():
    s = tokens.read_text(encoding="utf-8")

    # Keep exactly one deleteEventBusy declaration.
    decl = '  const [deleteEventBusy, setDeleteEventBusy] = useState(false);\n'
    first_decl = s.find(decl)
    if first_decl >= 0:
        before = s[:first_decl + len(decl)]
        after = s[first_decl + len(decl):].replace(decl, '')
        s = before + after

    # Keep exactly one complete deleteEvent function. The duplicated functions
    # are contiguous and all occur before saveEvent.
    pattern = re.compile(r'  const deleteEvent = async \(\) => \{.*?^  \};\n', re.MULTILINE | re.DOTALL)
    matches = list(pattern.finditer(s))
    if len(matches) > 1:
        first = matches[0]
        prefix = s[:first.end()]
        suffix = s[matches[-1].end():]
        # Remove every duplicate deleteEvent block between the first and saveEvent.
        suffix = re.sub(r'^(?:\n)?  const deleteEvent = async \(\) => \{.*?^  \};\n', '', suffix, flags=re.MULTILINE | re.DOTALL)
        s = prefix + suffix

    tokens.write_text(s, encoding="utf-8")
