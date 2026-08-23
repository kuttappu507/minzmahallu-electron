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

# ================= SUBSCRIPTION + DONATION SETTINGS =================

def data_service_business_rules(s):
    if 'ensureCurrentMonth:' not in s:
        marker='export const subscriptions = {'
        insert='''  ensureCurrentMonth: () => {
    const first = new Date();
    first.setDate(1);
    const periodStart = first.toISOString().slice(0, 10);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const periodEnd = last.toISOString().slice(0, 10);
    const configured = scalar<number>("SELECT COALESCE(subscription_monthly_amount, 0) FROM settings WHERE id = 1") || 0;
    const plan = one<any>("SELECT * FROM subscription_plans WHERE frequency = 'Monthly' AND is_active = 1 ORDER BY id LIMIT 1");
    if (!plan || configured <= 0) return { created: 0, amount: configured };
    const families = all<any>("SELECT id FROM families WHERE status = 'Active' ORDER BY id");
    let created = 0;
    const insert = getDB().prepare(`INSERT INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, status, collected_by, remarks) VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', NULL, '')`);
    const tx = getDB().transaction(() => {
      for (const f of families) {
        const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start = ? LIMIT 1", [f.id, periodStart]);
        if (exists) continue;
        const head = one<any>("SELECT id FROM members WHERE family_id = ? AND status = 'Active' ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id LIMIT 1", [f.id]);
        insert.run(f.id, head?.id ?? null, plan.id, periodStart, periodEnd, configured);
        created++;
      }
    });
    tx();
    return { created, amount: configured, periodStart, periodEnd };
  },
  memberBalance: (familyId: number, memberId?: number) => {
    if (!familyId) return 0;
    return scalar<number>("SELECT COALESCE(SUM(amount - amount_paid),0) FROM subscriptions WHERE family_id = ? AND amount > amount_paid AND status IN ('Pending','Partial','Overdue')", [familyId]) || 0;
  },
'''
        s=s.replace(marker,marker+'\n'+insert,1)
    old='''  list: (filter: { search?: string; status?: string; page?: number; pageSize?: number } = {}) {
    const where: string[] = ["1=1"];'''
    new='''  list: (filter: { search?: string; status?: string; page?: number; pageSize?: number } = {}) {
    subscriptions.ensureCurrentMonth();
    const where: string[] = ["1=1"];'''
    s=s.replace(old,new,1)
    s=s.replace('''(donor_name, donor_phone, donor_address, family_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, transaction_ref, received_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''','''(donor_name, donor_phone, donor_address, family_id, member_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, transaction_ref, received_by, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',1)
    s=s.replace('''        data.donorName, data.donorPhone ?? "", data.donorAddress ?? "",
        data.familyId ?? null, data.categoryId, data.amount,''','''        data.donorName, data.donorPhone ?? "", data.donorAddress ?? "",
        data.familyId ?? null, data.memberId ?? null, data.categoryId, data.amount,''',1)
    s=s.replace('''UPDATE donations SET donor_name = ?, donor_phone = ?, donor_address = ?, family_id = ?, category_id = ?, amount = ?, donation_date = ?, purpose = ?, payment_method = ?, transaction_ref = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?''','''UPDATE donations SET donor_name = ?, donor_phone = ?, donor_address = ?, family_id = ?, member_id = ?, category_id = ?, amount = ?, donation_date = ?, purpose = ?, payment_method = ?, transaction_ref = ?, remarks = ?, updated_at = datetime('now') WHERE id = ?''',1)
    s=s.replace('''        data.donorName, data.donorPhone, data.donorAddress,
        data.familyId, data.categoryId, data.amount,''','''        data.donorName, data.donorPhone, data.donorAddress,
        data.familyId, data.memberId ?? null, data.categoryId, data.amount,''',1)
    s=s.replace('''  categories: () => all<any>("SELECT * FROM donation_categories WHERE is_active = 1 ORDER BY name"),
  totalThisMonth:''','''  categories: () => all<any>("SELECT * FROM donation_categories WHERE is_active = 1 ORDER BY name"),
  categoriesAll: () => all<any>("SELECT dc.*, (SELECT COUNT(*) FROM donations d WHERE d.category_id = dc.id) AS donation_count FROM donation_categories dc ORDER BY dc.is_active DESC, dc.name"),
  createCategory: (name: string, description = "") => {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Category name is required");
    const existing = one<any>("SELECT id, is_active FROM donation_categories WHERE name = ? COLLATE NOCASE", [clean]);
    if (existing) {
      if (!existing.is_active) run("UPDATE donation_categories SET is_active = 1 WHERE id = ?", [existing.id]);
      return { id: existing.id, existing: true };
    }
    const { id } = run("INSERT INTO donation_categories (name, description, is_active) VALUES (?, ?, 1)", [clean, description]);
    return { id, existing: false };
  },
  updateCategory: (id: number, name: string, description = "") => {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Category name is required");
    return run("UPDATE donation_categories SET name = ?, description = ? WHERE id = ?", [clean, description, id]);
  },
  setCategoryActive: (id: number, active: boolean) => run("UPDATE donation_categories SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]),
  removeCategory: (id: number) => {
    const used = scalar<number>("SELECT COUNT(*) FROM donations WHERE category_id = ?", [id]) || 0;
    if (used > 0) throw new Error("This category cannot be deleted because donations already exist in it. Deactivate it instead.");
    return run("DELETE FROM donation_categories WHERE id = ?", [id]);
  },
  memberBalance: (familyId: number, memberId?: number) => subscriptions.memberBalance(familyId, memberId),
  totalThisMonth:''',1)
    s=s.replace('''        financial_year_start = ?, currency_symbol = ?, theme = ?, language = ?,''','''        financial_year_start = ?, currency_symbol = ?, subscription_monthly_amount = ?, theme = ?, language = ?,''',1)
    s=s.replace('''        data.financialYearStart ?? "", data.currencySymbol ?? "₹",
        data.theme ?? "light",''','''        data.financialYearStart ?? "", data.currencySymbol ?? "₹", Number(data.subscriptionMonthlyAmount ?? 0),
        data.theme ?? "light",''',1)
    return s
edit("electron/services/data.service.ts",data_service_business_rules)

def main_apis(s):
    if 'subscriptions:ensureCurrentMonth' not in s:
        s=s.replace('  ipcMain.handle("subscriptions:plans", () => data.subscriptions.plans());','  ipcMain.handle("subscriptions:plans", () => data.subscriptions.plans());\n  ipcMain.handle("subscriptions:ensureCurrentMonth", () => data.subscriptions.ensureCurrentMonth());',1)
    if 'donations:categoriesAll' not in s:
        s=s.replace('  ipcMain.handle("donations:categories", () => data.donations.categories());','  ipcMain.handle("donations:categories", () => data.donations.categories());\n  ipcMain.handle("donations:categoriesAll", () => data.donations.categoriesAll());\n  ipcMain.handle("donations:createCategory", (_e, name, description) => data.donations.createCategory(name, description));\n  ipcMain.handle("donations:updateCategory", (_e, id, name, description) => data.donations.updateCategory(id, name, description));\n  ipcMain.handle("donations:setCategoryActive", (_e, id, active) => data.donations.setCategoryActive(id, active));\n  ipcMain.handle("donations:removeCategory", (_e, id) => data.donations.removeCategory(id));\n  ipcMain.handle("donations:memberBalance", (_e, familyId, memberId) => data.donations.memberBalance(familyId, memberId));',1)
    # Generate the current month's family dues at application startup too, not only when the page is opened.
    if 'data.subscriptions.ensureCurrentMonth();' not in s:
        s=s.replace('app.whenReady().then(() => {','app.whenReady().then(() => {\n  try { data.subscriptions.ensureCurrentMonth(); } catch (err) { console.warn("[subscriptions] monthly generation deferred:", err); }',1)
    return s
edit("electron/main.ts",main_apis)

def preload_apis(s):
    s=s.replace('plans:()=>ipcRenderer.invoke("subscriptions:plans")','plans:()=>ipcRenderer.invoke("subscriptions:plans"),ensureCurrentMonth:()=>ipcRenderer.invoke("subscriptions:ensureCurrentMonth")',1)
    s=s.replace('categories:()=>ipcRenderer.invoke("donations:categories"),totalThisMonth', 'categories:()=>ipcRenderer.invoke("donations:categories"),categoriesAll:()=>ipcRenderer.invoke("donations:categoriesAll"),createCategory:(n:string,d?:string)=>ipcRenderer.invoke("donations:createCategory",n,d||""),updateCategory:(id:number,n:string,d?:string)=>ipcRenderer.invoke("donations:updateCategory",id,n,d||""),setCategoryActive:(id:number,a:boolean)=>ipcRenderer.invoke("donations:setCategoryActive",id,a),removeCategory:(id:number)=>ipcRenderer.invoke("donations:removeCategory",id),memberBalance:(fid:number,mid?:number)=>ipcRenderer.invoke("donations:memberBalance",fid,mid),totalThisMonth',1)
    return s
edit("electron/preload.mts",preload_apis)

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
    for token in ['issueMarriageNoc:(m:string)=>ipcRenderer.invoke("certificates:issueMarriageNoc",m),','removeEvent:(id:number)=>ipcRenderer.invoke("tokens:removeEvent",id),']:
        first=s.find(token)
        if first>=0:s=s[:first+len(token)]+s[first+len(token):].replace(token,'')
    preload.write_text(s,encoding="utf-8")

certs=Path("src/pages/Certificates.tsx")
if certs.exists():
    s=certs.read_text(encoding="utf-8")
    branch=re.compile(r'\s*case "marriage_noc":\s*result = await window\.mms\.certificates\.issueMarriageNoc\(selectedRow\.code\);\s*break;',re.MULTILINE)
    matches=list(branch.finditer(s))
    if len(matches)>1:
        first_end=matches[0].end(); tail=s[first_end:]; tail=branch.sub('',tail); s=s[:first_end]+tail
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
