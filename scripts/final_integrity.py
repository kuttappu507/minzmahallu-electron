from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def edit(rel, fn):
    p = ROOT / rel
    if not p.exists(): return
    s = p.read_text(encoding="utf-8")
    n = fn(s)
    if n != s: p.write_text(n, encoding="utf-8")

def subscription_service(s):
    marker = '// ================= SUBSCRIPTIONS ================='
    start = s.find(marker)
    export = s.find('export const subscriptions = {', start)
    if start < 0 or export < 0: return s
    helper = '''// ================= SUBSCRIPTIONS =================

function subscriptionPeriod() {
  const configured = one<any>("SELECT subscription_frequency, subscription_monthly_amount FROM settings WHERE id = 1");
  const frequency = configured?.subscription_frequency === "Quarterly" ? "Quarterly" : "Monthly";
  const amount = Number(configured?.subscription_monthly_amount ?? 0) || 0;
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
  if (frequency === "Quarterly") {
    const q = Math.floor(month / 3) * 3;
    const start = new Date(year, q, 1); const end = new Date(year, q + 3, 0);
    return { frequency, amount, periodStart: start.toISOString().slice(0,10), periodEnd: end.toISOString().slice(0,10) };
  }
  const start = new Date(year, month, 1); const end = new Date(year, month + 1, 0);
  return { frequency, amount, periodStart: start.toISOString().slice(0,10), periodEnd: end.toISOString().slice(0,10) };
}

function ensureCurrentPeriod() {
  const period = subscriptionPeriod();
  if (period.amount <= 0) return { created: 0, ...period };
  const plan = one<any>("SELECT * FROM subscription_plans WHERE frequency = ? AND is_active = 1 ORDER BY id LIMIT 1", [period.frequency]);
  if (!plan) return { created: 0, ...period };
  const families = all<any>("SELECT id FROM families WHERE status = 'Active' ORDER BY id");
  let created = 0;
  const insert = getDB().prepare("INSERT INTO subscriptions (family_id, member_id, plan_id, period_start, period_end, amount, amount_paid, status, collected_by, remarks) VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', NULL, '')");
  getDB().transaction(() => {
    for (const family of families) {
      const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start = ? AND period_end = ? LIMIT 1", [family.id, period.periodStart, period.periodEnd]);
      if (exists) continue;
      const head = one<any>("SELECT id FROM members WHERE family_id = ? AND status = 'Active' ORDER BY CASE WHEN is_head = 1 THEN 0 WHEN relationship = 'Head' THEN 1 ELSE 2 END, id LIMIT 1", [family.id]);
      insert.run(family.id, head?.id ?? null, plan.id, period.periodStart, period.periodEnd, period.amount); created++;
    }
  })();
  return { created, ...period };
}

function memberSubscriptionBalance(familyId: number) {
  if (!familyId) return 0;
  return scalar<number>("SELECT COALESCE(SUM(amount - amount_paid),0) FROM subscriptions WHERE family_id = ? AND amount > amount_paid AND status IN ('Pending','Partial','Overdue')", [familyId]) || 0;
}

'''
    rest = s[export:]
    # Remove every generated helper property; add the canonical pair exactly once.
    rest = re.sub(r'\n\s*ensureCurrentMonth\s*:\s*\(\)\s*=>\s*ensureCurrent(?:Month|Period)\(\),?', '', rest)
    rest = re.sub(r'\n\s*memberBalance\s*:\s*\(familyId:\s*number,\s*_memberId\?:\s*number\)\s*=>\s*memberSubscriptionBalance\(familyId\),?', '', rest)
    rest = rest.replace('export const subscriptions = {', 'export const subscriptions = {\n  ensureCurrentMonth: () => ensureCurrentPeriod(),\n  memberBalance: (familyId: number, _memberId?: number) => memberSubscriptionBalance(familyId),', 1)
    # Any stale family-list call must use the canonical helper.
    prefix = s[:start].replace('ensureCurrentMonth();', 'ensureCurrentPeriod();')
    return prefix + helper + rest

edit('electron/services/data.service.ts', subscription_service)

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

# Do not mutate database contents during the build. Database recovery is runtime-only.
