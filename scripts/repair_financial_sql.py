from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def edit(rel, fn):
    p = ROOT / rel
    if not p.exists(): return
    s = p.read_text(encoding='utf-8')
    n = fn(s)
    if n != s: p.write_text(n, encoding='utf-8')

# Canonical repair of the malformed subscription helper block.
def data_service(s):
    start = s.find('// ================= SUBSCRIPTIONS =================')
    export = s.find('export const subscriptions = {', start)
    if start >= 0 and export >= 0:
        prefix = s[:start]
        rest = s[export:]
        helper = '''// ================= SUBSCRIPTIONS =================\n\nfunction ensureCurrentMonth() {\n  const first = new Date();\n  first.setDate(1);\n  const periodStart = first.toISOString().slice(0, 10);\n  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);\n  const periodEnd = last.toISOString().slice(0, 10);\n  const configured = scalar<number>("SELECT COALESCE(subscription_monthly_amount, 0) FROM settings WHERE id = 1") || 0;\n  const plan = one<any>("SELECT * FROM subscription_plans WHERE frequency = 'Monthly' AND is_active = 1 ORDER BY id LIMIT 1");\n  if (!plan || configured <= 0) return { created: 0, amount: configured, periodStart, periodEnd };\n  const families = all<any>("SELECT id FROM families WHERE status = 'Active' ORDER BY id");\n  let created = 0;\n  const insert = getDB().prepare(`INSERT INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, status, collected_by, remarks) VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', NULL, '')`);\n  getDB().transaction(() => {\n    for (const f of families) {\n      const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start = ? LIMIT 1", [f.id, periodStart]);\n      if (exists) continue;\n      const head = one<any>("SELECT id FROM members WHERE family_id = ? AND status = 'Active' ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id LIMIT 1", [f.id]);\n      insert.run(f.id, head?.id ?? null, plan.id, periodStart, periodEnd, configured);\n      created++;\n    }\n  })();\n  return { created, amount: configured, periodStart, periodEnd };\n}\n\nfunction memberSubscriptionBalance(familyId: number) {\n  if (!familyId) return 0;\n  return scalar<number>("SELECT COALESCE(SUM(amount - amount_paid),0) FROM subscriptions WHERE family_id = ? AND amount > amount_paid AND status IN ('Pending','Partial','Overdue')", [familyId]) || 0;\n}\n\n'''
        s = prefix + helper + rest
    s = s.replace('    subscriptions.ensureCurrentMonth();', '    ensureCurrentMonth();', 1)
    s = s.replace('export const subscriptions = {\n', 'export const subscriptions = {\n  ensureCurrentMonth: () => ensureCurrentMonth(),\n  memberBalance: (familyId: number, _memberId?: number) => memberSubscriptionBalance(familyId),\n', 1)
    s = s.replace('`SELECT COUNT(*) AS c FROM donations d WHERE ${where.join(" AND ")}`', '`SELECT COUNT(*) AS c FROM donations d LEFT JOIN donation_categories c ON c.id = d.category_id WHERE ${where.join(" AND ")}`')
    return s
edit('electron/services/data.service.ts', data_service)

# Ensure the monthly setting exists in legacy databases.
def connection(s):
    marker = '    applyMigrations(database);'
    helper = '''    const settingsColumns = database.prepare("PRAGMA table_info(settings)").all() as Array<{name:string}>;\n    if (!settingsColumns.some(c => c.name === "subscription_monthly_amount")) {\n      database.exec("ALTER TABLE settings ADD COLUMN subscription_monthly_amount REAL NOT NULL DEFAULT 100");\n    }\n'''
    if 'settingsColumns' not in s and marker in s: s = s.replace(marker, helper + marker, 1)
    return s
edit('electron/db/connection.ts', connection)

# Create the monthly records as soon as the application opens.
def main(s):
    marker = 'app.whenReady().then(() => {'
    if 'data.subscriptions.ensureCurrentMonth' not in s and marker in s:
        s = s.replace(marker, marker + '\n  try { data.subscriptions.ensureCurrentMonth(); } catch (err) { console.error("[subscriptions] Monthly generation failed:", err); }', 1)
    anchor = '  ipcMain.handle("donations:categories", () => data.donations.categories());'
    additions = '''\n  ipcMain.handle("donations:categoriesAll", () => data.donations.categoriesAll());\n  ipcMain.handle("donations:createCategory", (_e, name, description) => data.donations.createCategory(name, description || ""));\n  ipcMain.handle("donations:updateCategory", (_e, id, name, description) => data.donations.updateCategory(id, name, description || ""));\n  ipcMain.handle("donations:setCategoryActive", (_e, id, active) => data.donations.setCategoryActive(id, active));\n  ipcMain.handle("donations:removeCategory", (_e, id) => data.donations.removeCategory(id));\n  ipcMain.handle("donations:memberBalance", (_e, familyId, memberId) => data.donations.memberBalance(familyId, memberId));'''
    if 'donations:categoriesAll' not in s and anchor in s: s = s.replace(anchor, anchor + additions, 1)
    return s
edit('electron/main.ts', main)

# Renderer bridge additions.
def preload(s):
    anchor = 'categories:()=>ipcRenderer.invoke("donations:categories"),'
    additions = 'categoriesAll:()=>ipcRenderer.invoke("donations:categoriesAll"),createCategory:(n:string,d?:string)=>ipcRenderer.invoke("donations:createCategory",n,d||""),updateCategory:(id:number,n:string,d?:string)=>ipcRenderer.invoke("donations:updateCategory",id,n,d||""),setCategoryActive:(id:number,a:boolean)=>ipcRenderer.invoke("donations:setCategoryActive",id,a),removeCategory:(id:number)=>ipcRenderer.invoke("donations:removeCategory",id),memberBalance:(fid:number,mid?:number)=>ipcRenderer.invoke("donations:memberBalance",fid,mid),'
    if 'categoriesAll:=>' not in s and anchor in s: s = s.replace(anchor, anchor + additions, 1)
    return s
edit('electron/preload.mts', preload)

# Users UI roles must match SQLite's production CHECK constraint.
def users(s):
    s = s.replace('const emptyForm = { username: "", full_name: "", role: "Viewer", password: "" };', 'const emptyForm = { username: "", full_name: "", role: "Staff", password: "" };')
    s = s.replace('{ Administrator: "അഡ്മിനിസ്ട്രേറ്റർ", Editor: "എഡിറ്റർ", Manager: "മാനേജർ", Operator: "ഓപ്പറേറ്റർ", Viewer: "വ്യൂവർ" }', '{ Administrator: "അഡ്മിനിസ്ട്രേറ്റർ", President: "പ്രസിഡന്റ്", Secretary: "സെക്രട്ടറി", Treasurer: "ട്രഷറർ", Imam: "ഇമാം", Staff: "സ്റ്റാഫ്", Auditor: "ഓഡിറ്റർ" }')
    old = '<option value="Administrator">{roleLabel("Administrator")}</option><option value="Editor">{roleLabel("Editor")}</option><option value="Viewer">{roleLabel("Viewer")}</option>'
    new = '<option value="Administrator">{roleLabel("Administrator")}</option><option value="President">{roleLabel("President")}</option><option value="Secretary">{roleLabel("Secretary")}</option><option value="Treasurer">{roleLabel("Treasurer")}</option><option value="Imam">{roleLabel("Imam")}</option><option value="Staff">{roleLabel("Staff")}</option><option value="Auditor">{roleLabel("Auditor")}</option>'
    return s.replace(old, new)
edit('src/pages/Users.tsx', users)

# Data service must never default to an invalid role.
edit('electron/services/data.service.ts', lambda s: s.replace('data.role || "Viewer"', 'data.role || "Staff"'))
