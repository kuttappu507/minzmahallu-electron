from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# Last-pass idempotency guard. These edits are deliberately narrow and safe to
# run repeatedly; they prevent build-time feature scripts from generating TS1117.
p = ROOT / "electron/services/data.service.ts"
if p.exists():
    s = p.read_text(encoding="utf-8")
    key = r'\n  memberBalance: \(familyId: number, _memberId\?: number\) => memberSubscriptionBalance\(familyId\),'
    matches = list(re.finditer(key, s))
    if len(matches) > 1:
        tail = s[matches[0].end():]
        tail = re.sub(key, '', tail)
        s = s[:matches[0].end()] + tail
    # Do not create overlapping dues when an operator changes Monthly to
    # Quarterly during an already-open period. The next non-overlapping period
    # will use the new frequency.
    s = s.replace(
        'const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start = ? AND period_end = ? LIMIT 1", [family.id, period.periodStart, period.periodEnd]);',
        'const exists = one<any>("SELECT id FROM subscriptions WHERE family_id = ? AND period_start <= ? AND period_end >= ? LIMIT 1", [family.id, period.periodEnd, period.periodStart]);'
    )
    p.write_text(s, encoding="utf-8")

# Ensure every production IPC registration in main is authenticated and tied
# to the actual application renderer. Auth bootstrap channels are intentionally
# excluded because they must work before a session exists.
p = ROOT / "electron/main.ts"
if p.exists():
    s = p.read_text(encoding="utf-8")
    allowed = {"auth:login", "auth:logout", "auth:currentUser", "auth:setupStatus", "auth:createInitialAdministrator", "auth:changePassword"}
    if 'function secureHandle<' not in s:
        anchor = 'const session = { user: null as null | { id: number; username: string; fullName: string; role: string } };'
        helper = '''\n\nfunction secureHandle<T extends (...args: any[]) => any>(channel: string, handler: T) {\n  ipcMain.handle(channel, async (event, ...args) => {\n    if (!session.user) throw new Error("Authentication required");\n    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Unauthorized IPC sender");\n    return handler(event, ...args);\n  });\n}\n'''
        s = s.replace(anchor, anchor + helper, 1)
    out=[]
    for line in s.splitlines(keepends=True):
        m=re.search(r'ipcMain\.handle\("([^"]+)"', line)
        if m and m.group(1) not in allowed:
            line=line.replace('ipcMain.handle(', 'secureHandle(', 1)
        out.append(line)
    p.write_text(''.join(out), encoding="utf-8")
