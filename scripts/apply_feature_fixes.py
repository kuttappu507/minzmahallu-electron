from pathlib import Path
import re


def edit(path, fn):
    p = Path(path)
    if not p.exists(): return
    s = p.read_text(encoding="utf-8")
    n = fn(s)
    if n != s: p.write_text(n, encoding="utf-8")

# Keep all earlier feature repairs idempotent.
def token_data(s):
    old='''SELECT ta.token_code, ta.status, ta.collected_at, ta.created_at,
       f.family_number, f.house_name, f.ward, f.house_number, f.phone,
       te.event_name, te.event_date, te.venue, te.event_time'''
    new='''SELECT ta.token_code, ta.status, ta.collected_at, ta.created_at,
       f.family_number, f.house_name, f.ward, f.house_number, f.phone,
       (SELECT m.name FROM members m WHERE m.family_id = f.id AND m.is_head = 1 AND m.status = 'Active' ORDER BY m.id LIMIT 1) AS house_head_name,
       te.event_name, te.event_date, te.venue, te.event_time'''
    return s.replace(old,new,1)
edit("electron/services/data.service.ts",token_data)

def cert_data(s):
    if "issueMarriageNoc:" in s: return s
    marker="  issueDeath:"; idx=s.find(marker)
    if idx<0:return s
    method='''  issueMarriageNoc: (marriageNum: string, userId: number) => {
    const marriage = one<any>("SELECT * FROM marriages WHERE marriage_number = ?", [marriageNum]);
    if (!marriage) throw new Error("Marriage record not found");
    const certificateNumber = scalar<string>("SELECT 'NOC-' || printf('%04d', COALESCE(MAX(id),0)+1) FROM certificates");
    const issuedTo = [marriage.bride_name, marriage.groom_name].filter(Boolean).join(" & ");
    const result = run(`INSERT INTO certificates (certificate_number, type, marriage_id, issued_to, issued_date, issued_by, notes) VALUES (?, 'NOC', ?, ?, date('now'), ?, ?)`, [certificateNumber, marriage.id, issuedTo, userId, `No Objection Certificate for marriage ${marriage.marriage_number}`]);
    return { id: result.id, certificate_number: certificateNumber };
  },
'''
    return s[:idx]+method+s[idx:]
edit("electron/services/data.service.ts",cert_data)

# NOC renderer bridge/template repairs.
edit("electron/main.ts",lambda s:s if "certificates:issueMarriageNoc" in s else s.replace('  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));','  ipcMain.handle("certificates:issueMarriage", (_e, marriageNum) => data.certificates.issueMarriage(marriageNum, session.user?.id ?? 1));\n  ipcMain.handle("certificates:issueMarriageNoc", (_e, marriageNum) => data.certificates.issueMarriageNoc(marriageNum, session.user?.id ?? 1));',1))
edit("electron/preload.mts",lambda s:s if "issueMarriageNoc" in s else s.replace('issueMarriage:(m:string)=>ipcRenderer.invoke("certificates:issueMarriage",m),','issueMarriage:(m:string)=>ipcRenderer.invoke("certificates:issueMarriage",m),issueMarriageNoc:(m:string)=>ipcRenderer.invoke("certificates:issueMarriageNoc",m),',1))

def cert_page(s):
    s=s.replace('type IssueType = "membership" | "residence" | "marriage" | "death";','type IssueType = "membership" | "residence" | "marriage" | "marriage_noc" | "death";')
    needle='''    death: {
      title: `${t("cert_death")} ${t("cert_title")}`,'''
    if "marriage_noc:" not in s and needle in s:
        noc='''    marriage_noc: {
      title: `Marriage NOC ${t("cert_title")}`,
      codeLabel: t("cert_marriage_number"), needsIssuedTo: false,
      loader: async () => { const r=await window.mms.marriages.list({pageSize:100}); return (r?.rows||[]).map((m:any)=>({id:m.id,code:m.marriage_number||"",primaryName:m.bride_name||"—",secondaryName:m.groom_name,sub:m.nikah_date?formatDate(m.nikah_date):""})); },
    },
'''
        s=s.replace(needle,noc+needle,1)
    s=s.replace('''        case "marriage":
          result = await window.mms.certificates.issueMarriage(selectedRow.code);
          break;''','''        case "marriage":
          result = await window.mms.certificates.issueMarriage(selectedRow.code);
          break;
        case "marriage_noc":
          result = await window.mms.certificates.issueMarriageNoc(selectedRow.code);
          break;''',1)
    if 'label: "Marriage NOC"' not in s:
        s=s.replace('''    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, tint: "t-pink" },''','''    { type: "marriage" as IssueType, label: t("cert_marriage"), icon: Heart, tint: "t-pink" },
    { type: "marriage_noc" as IssueType, label: "Marriage NOC", icon: FileCheck2, tint: "t-vio" },''',1)
    return s
edit("src/pages/Certificates.tsx",cert_page)

def cert_template(s):
    s=s.replace("membership:'അംഗത്വ സർട്ടിഫിക്കറ്റ്',residence:'വസതി സർട്ടിഫിക്കറ്റ്',marriage:'വിവാഹ സർട്ടിഫിക്കറ്റ്',death:'മരണ സർട്ടിഫിക്കറ്റ്',certificate:'സർട്ടിഫിക്കറ്റ്'","membership:'അംഗത്വ സർട്ടിഫിക്കറ്റ്',residence:'വസതി സർട്ടിഫിക്കറ്റ്',marriage:'വിവാഹ സർട്ടിഫിക്കറ്റ്',noc:'വിവാഹത്തിനുള്ള എതിർപ്പില്ലാ സർട്ടിഫിക്കറ്റ്',death:'മരണ സർട്ടിഫിക്കറ്റ്',certificate:'സർട്ടിഫിക്കറ്റ്'",1)
    s=s.replace("membership:'MEMBERSHIP CERTIFICATE',residence:'RESIDENCE CERTIFICATE',marriage:'MARRIAGE CERTIFICATE',death:'DEATH CERTIFICATE',certificate:'CERTIFICATE'","membership:'MEMBERSHIP CERTIFICATE',residence:'RESIDENCE CERTIFICATE',marriage:'MARRIAGE CERTIFICATE',noc:'NO OBJECTION CERTIFICATE FOR MARRIAGE',death:'DEATH CERTIFICATE',certificate:'CERTIFICATE'",1)
    return s
edit("electron/print/certificate.template.ts",cert_template)

def token_stats_runtime(s):
    old='      setStats(await window.mms.tokens.stats(selectedEventId));'
    new='''      const allResult = await window.mms.tokens.list({ eventId: selectedEventId, pageSize: 100000 });
      const statRows = allResult?.rows || [];
      const total = statRows.filter((r: any) => r.status !== "CANCELLED").length;
      const collected = statRows.filter((r: any) => r.status === "COLLECTED").length;
      const remaining = total - collected;
      setStats({ total, collected, remaining, rate: total ? Math.round((collected / total) * 1000) / 10 : 0 });'''
    return s.replace(old,new,1)
edit("src/pages/Tokens.tsx",token_stats_runtime)

def report_pdf(s):
    reps={'body { font: 400 10px Poppins, system-ui, sans-serif;':'body { font: 400 12px Poppins, system-ui, sans-serif;','.sub { color: #5f7268; font-size: 9px;':'.sub { color: #5f7268; font-size: 12px;','font-size: ${landscape ? "8.5" : "9.5"}px;':'font-size: 12px;','font-size: ${landscape ? "7.5" : "8.5"}px;':'font-size: 12px;','.foot { margin-top: 12px; color: #8ba096; font-size: 8px; }':'.foot { margin-top: 12px; color: #8ba096; font-size: 12px; }'}
    for a,b in reps.items():s=s.replace(a,b)
    return s
edit("src/pages/Reports.tsx",report_pdf)

def pdf_renderer(s):
    old="await pdfWin.webContents.executeJavaScript(`document.documentElement.style.width = '210mm'; document.body.style.width = '210mm'; void document.body.offsetHeight; ({bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight});`);"
    new="await pdfWin.webContents.executeJavaScript(`document.documentElement.style.width = 'auto'; document.body.style.width = 'auto'; void document.body.offsetHeight; ({bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight});`);"
    return s.replace(old,new,1)
edit("electron/main.ts",pdf_renderer)

# Final idempotent cleanup. This runs on every build and converges the source to one canonical form.
main=Path("electron/main.ts")
if main.exists():
    s=main.read_text(encoding="utf-8"); seen=set(); out=[]
    for line in s.splitlines(keepends=True):
        m=re.search(r'ipcMain\.handle\("([^"]+)"',line)
        if m:
            ch=m.group(1)
            if ch in seen: continue
            seen.add(ch)
        out.append(line)
    main.write_text(''.join(out),encoding="utf-8")

preload=Path("electron/preload.mts")
if preload.exists():
    s=preload.read_text(encoding="utf-8")
    # Remove repeated bridge entries, retaining the first occurrence.
    for token in ['issueMarriageNoc:(m:string)=>ipcRenderer.invoke("certificates:issueMarriageNoc",m),','removeEvent:(id:number)=>ipcRenderer.invoke("tokens:removeEvent",id),']:
        first=s.find(token)
        if first>=0:
            s=s[:first+len(token)]+s[first+len(token):].replace(token,'')
    preload.write_text(s,encoding="utf-8")

# Certificates.tsx: retain exactly one marriage_noc switch branch even if older repair passes duplicated it.
certs=Path("src/pages/Certificates.tsx")
if certs.exists():
    s=certs.read_text(encoding="utf-8")
    branch=re.compile(r'\s*case "marriage_noc":\s*result = await window\.mms\.certificates\.issueMarriageNoc\(selectedRow\.code\);\s*break;',re.MULTILINE)
    matches=list(branch.finditer(s))
    if len(matches)>1:
        first_end=matches[0].end()
        tail=s[first_end:]
        tail=branch.sub('',tail)
        s=s[:first_end]+tail
    certs.write_text(s,encoding="utf-8")

tokens=Path("src/pages/Tokens.tsx")
if tokens.exists():
    s=tokens.read_text(encoding="utf-8")
    decl='  const [deleteEventBusy, setDeleteEventBusy] = useState(false);\n'
    first=s.find(decl)
    if first>=0:s=s[:first+len(decl)]+s[first+len(decl):].replace(decl,'')
    pattern=re.compile(r'  const deleteEvent = async \(\) => \{.*?^  \};\n',re.MULTILINE|re.DOTALL)
    matches=list(pattern.finditer(s))
    if len(matches)>1:s=s[:matches[0].end()]+pattern.sub('',s[matches[0].end():],count=0)
    tokens.write_text(s,encoding="utf-8")
