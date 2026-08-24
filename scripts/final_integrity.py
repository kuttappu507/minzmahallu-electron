from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def edit(rel, fn):
    p = ROOT / rel
    if not p.exists():
        return
    s = p.read_text(encoding="utf-8")
    n = fn(s)
    if n != s:
        p.write_text(n, encoding="utf-8")

# ---------- Subscription generation ----------
def subscription_service(s):
    marker = '// ================= SUBSCRIPTIONS ================='
    start = s.find(marker)
    export = s.find('export const subscriptions = {', start)
    if start < 0 or export < 0:
        return s
    helper = '''// ================= SUBSCRIPTIONS =================

function subscriptionPeriod() {
  const configured = one<any>("SELECT subscription_frequency, subscription_monthly_amount FROM settings WHERE id = 1");
  const frequency = configured?.subscription_frequency === "Quarterly" ? "Quarterly" : "Monthly";
  const amount = Number(configured?.subscription_monthly_amount ?? 0) || 0;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (frequency === "Quarterly") {
    const qStartMonth = Math.floor(month / 3) * 3;
    const start = new Date(year, qStartMonth, 1);
    const end = new Date(year, qStartMonth + 3, 0);
    return { frequency, amount, periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10), periodKey: `${year}-Q${Math.floor(month / 3) + 1}` };
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { frequency, amount, periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10), periodKey: `${year}-${String(month + 1).padStart(2, "0")}` };
}

function ensureCurrentPeriod() {
  const period = subscriptionPeriod();
  if (period.amount <= 0) return { created: 0, ...period };
  const plan = one<any>(`SELECT * FROM subscription_plans WHERE frequency = ? AND is_active = 1 ORDER BY id LIMIT 1`, [period.frequency]);
  if (!plan) return { created: 0, ...period };
  const families = all<any>("SELECT id FROM families WHERE status = 'Active' ORDER BY id");
  let created = 0;
  const insert = getDB().prepare(`INSERT INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, status, collected_by, remarks) VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', NULL, '')`);
  getDB().transaction(() => {
    for (const family of families) {
      const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start = ? AND period_end = ? LIMIT 1", [family.id, period.periodStart, period.periodEnd]);
      if (exists) continue;
      const head = one<any>("SELECT id FROM members WHERE family_id = ? AND status = 'Active' ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id LIMIT 1", [family.id]);
      insert.run(family.id, head?.id ?? null, plan.id, period.periodStart, period.periodEnd, period.amount);
      created++;
    }
  })();
  return { created, ...period };
}

function memberSubscriptionBalance(familyId: number) {
  if (!familyId) return 0;
  return scalar<number>("SELECT COALESCE(SUM(amount - amount_paid),0) FROM subscriptions WHERE family_id = ? AND amount > amount_paid AND status IN ('Pending','Partial','Overdue')", [familyId]) || 0;
}

'''
    s = s[:start] + helper + s[export:]
    # Families.list was written by an earlier repair pass with the old helper name.
    # Normalize every generated reference so the build can never leave a stale call.
    s = s.replace('ensureCurrentMonth();', 'ensureCurrentPeriod();')
    # Ensure the public API exists exactly once.
    s = re.sub(r'\n  ensureCurrentMonth:\s*\(\)\s*=>\s*ensureCurrentPeriod\(\),', '', s)
    s = re.sub(r'\n  memberBalance:\s*\(familyId: number, _memberId\?: number\) => memberSubscriptionBalance\(familyId\),', '', s)
    s = s.replace('export const subscriptions = {\n', 'export const subscriptions = {\n  ensureCurrentMonth: () => ensureCurrentPeriod(),\n  memberBalance: (familyId: number, _memberId?: number) => memberSubscriptionBalance(familyId),\n', 1)
    return s
edit('electron/services/data.service.ts', subscription_service)

# Settings persistence for frequency.
def settings_service(s):
    s = s.replace('financial_year_start = ?, currency_symbol = ?, subscription_monthly_amount = ?, theme = ?, language = ?,', 'financial_year_start = ?, currency_symbol = ?, subscription_monthly_amount = ?, subscription_frequency = ?, theme = ?, language = ?,', 1)
    s = s.replace('data.financialYearStart ?? "", data.currencySymbol ?? "₹", Number(data.subscriptionMonthlyAmount ?? 0),\n        data.theme', 'data.financialYearStart ?? "", data.currencySymbol ?? "₹", Number(data.subscriptionMonthlyAmount ?? 0), data.subscriptionFrequency === "Quarterly" ? "Quarterly" : "Monthly",\n        data.theme', 1)
    return s
edit('electron/services/data.service.ts', settings_service)

# ---------- IPC security: all non-auth renderer calls must come through secureHandle ----------
def ipc_security(s):
    if 'function secureHandle(' not in s:
        anchor = 'const session = { user: null as null | { id: number; username: string; fullName: string; role: string } };'
        helper = '''\n\nfunction secureHandle<T extends (...args: any[]) => any>(channel: string, handler: T) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!session.user) throw new Error("Authentication required");
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Unauthorized IPC sender");
    return handler(event, ...args);
  });
}
'''
        s = s.replace(anchor, anchor + helper, 1)
    public_auth = {"auth:login", "auth:logout", "auth:currentUser", "auth:setupStatus", "auth:createInitialAdministrator", "auth:changePassword"}
    lines=[]
    for line in s.splitlines(keepends=True):
        m=re.search(r'ipcMain\.handle\("([^"]+)"', line)
        if m and m.group(1) not in public_auth:
            line=line.replace('ipcMain.handle(', 'secureHandle(', 1)
        lines.append(line)
    return ''.join(lines)
edit('electron/main.ts', ipc_security)

# ---------- Preload duplicate guard ----------
def preload_guard(s):
    patterns = [
        r'ensureCurrentMonth\s*:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("subscriptions:ensureCurrentMonth"\)',
        r'categoriesAll\s*:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("donations:categoriesAll"\)',
        r'memberBalance\s*:\s*\(fid:number,mid\?:number\)\s*=>\s*ipcRenderer\.invoke\("donations:memberBalance",fid,mid\)',
    ]
    for pattern in patterns:
        matches=list(re.finditer(pattern,s))
        if len(matches)>1:
            tail=s[matches[0].end():]
            tail=re.sub(r',?\s*'+pattern,'',tail)
            s=s[:matches[0].end()]+tail
    return s
edit('electron/preload.mts', preload_guard)

# ---------- Prevent silent loss of a previous database ----------
def connection_recovery(s):
    if 'function findRecoverableBackups(' in s:
        return s
    insert_before='export function getDB(): DB {'
    helper='''function findRecoverableBackups(): string[] {
  const dir = userDataDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^mms\\.db\\.corrupt-/.test(f) && !/-wal$|-shm$/.test(f))
    .map(f => path.join(dir, f))
    .sort()
    .reverse();
}

function databaseHasFamilies(database: DB): boolean {
  try { return Number((database.prepare("SELECT COUNT(*) AS c FROM families").get() as any)?.c ?? 0) > 0; }
  catch { return false; }
}

'''
    s=s.replace(insert_before,helper+insert_before,1)
    old='''    initializeSchema(db);\n  } catch (err) {'''
    new='''    initializeSchema(db);\n    if (!databaseHasFamilies(db)) {\n      const recoverable = findRecoverableBackups();\n      if (recoverable.length) {\n        const choice = dialog.showMessageBoxSync({\n          type: "warning", title: "MMS — Existing Data Found",\n          message: "This database has no family records, but a previous database backup exists.",\n          detail: `Restore the newest preserved database backup?\\n\\n${recoverable[0]}\\n\\nYour current database will be preserved before restoration.`,\n          buttons: ["Restore Previous Data", "Keep Current Database"], defaultId: 0, cancelId: 1\n        });\n        if (choice === 0) {\n          const currentBackup = `${p}.empty-${new Date().toISOString().replace(/[:.]/g, "-")}`;\n          db.close(); db = null;\n          fs.renameSync(p, currentBackup);\n          fs.copyFileSync(recoverable[0], p);\n          db = new Database(p); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON");\n          initializeSchema(db);\n        }\n      }\n    }\n  } catch (err) {'''
    if old in s:s=s.replace(old,new,1)
    return s
edit('electron/db/connection.ts', connection_recovery)
