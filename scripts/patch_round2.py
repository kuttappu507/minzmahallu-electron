#!/usr/bin/env python3
"""
patch_round2.py — Hostile-user round 2 hardening.

Fixes applied (each anchor must match EXACTLY ONCE or the patch aborts):
  F1  Paste-safe phone clamping (clampPhone10) in 7 pages / 10 handlers —
      "+91 98470 12345" no longer silently becomes "9198470123".
  F2  Amount validation (amountError / nonNegativeAmountError) in Donations,
      Accounting, Welfare, Staff (salary + pay) — negatives/zeros/huge values
      can no longer reach SQLite and corrupt totals.
  F3  friendlySendError on the WhatsApp receipt catch paths (Donations x2,
      Subscriptions x1) — localized "not connected"/"no internet" guidance.
"""
import sys, re
from pathlib import Path

ROOT = Path("/home/z/my-project/repo-review")
applied, failures = [], []

def patch(rel, old, new, label, count=1):
    p = ROOT / rel
    s = p.read_text(encoding="utf-8")
    n = s.count(old)
    if n != count:
        failures.append(f"{label}: anchor found {n}x (expected {count}) in {rel}")
        return
    p.write_text(s.replace(old, new), encoding="utf-8")
    applied.append(label)

# ---------------- imports ----------------
patch("src/pages/Donations.tsx",
      'import { DataTable, type Column } from "@/components/DataTable";',
      'import { DataTable, type Column } from "@/components/DataTable";\nimport { clampPhone10 } from "@/lib/phone";\nimport { amountError } from "@/lib/amount";\nimport { friendlySendError } from "@/lib/ipc-error";',
      "Donations imports")

patch("src/pages/Families.tsx",
      'const normalizeWhatsApp',
      'import { clampPhone10 } from "@/lib/phone";\nconst normalizeWhatsApp',
      "Families import", count=1)

patch("src/pages/Settings.tsx",
      'import { MalayalamInput } from "@/components/MalayalamInput";',
      'import { MalayalamInput } from "@/components/MalayalamInput";\nimport { clampPhone10 } from "@/lib/phone";\nimport { amountError } from "@/lib/amount";',
      "Settings imports")

patch("src/pages/Staff.tsx",
      'import { useAsyncLock } from "../lib/use-async-lock";',
      'import { useAsyncLock } from "../lib/use-async-lock";\nimport { clampPhone10 } from "@/lib/phone";\nimport { amountError, nonNegativeAmountError } from "@/lib/amount";',
      "Staff imports")

patch("src/pages/Members.tsx",
      'const onMobileChange = (val: string) => { const digits = val.replace(/\\D/g, \'\').slice(0, 10); setForm({...form, mobile: digits}); };',
      'const onMobileChange = (val: string) => { const digits = clampPhone10(val); setForm({...form, mobile: digits}); };',
      "Members onMobileChange")
patch("src/pages/Members.tsx",
      'import { useI18n } from "@/i18n";',
      'import { useI18n } from "@/i18n";\nimport { clampPhone10 } from "@/lib/phone";',
      "Members import", count=1)

patch("src/pages/Committee.tsx",
      'import { SecureActionDialog } from "@/components/SecureActionDialog";',
      'import { SecureActionDialog } from "@/components/SecureActionDialog";\nimport { clampPhone10 } from "@/lib/phone";',
      "Committee import", count=1)

patch("src/pages/Accounting.tsx",
      'import { useAsyncLock } from "../lib/use-async-lock";',
      'import { useAsyncLock } from "../lib/use-async-lock";\nimport { amountError } from "@/lib/amount";',
      "Accounting import", count=1)

patch("src/pages/Welfare.tsx",
      'import { useAsyncLock } from "../lib/use-async-lock";',
      'import { useAsyncLock } from "../lib/use-async-lock";\nimport { amountError } from "@/lib/amount";',
      "Welfare import", count=1)

patch("src/pages/Subscriptions.tsx",
      'import { SecureActionDialog } from "@/components/SecureActionDialog";',
      'import { SecureActionDialog } from "@/components/SecureActionDialog";\nimport { friendlySendError } from "@/lib/ipc-error";',
      "Subscriptions import", count=1)

# ---------------- F1 phone clamps ----------------
patch("src/pages/Donations.tsx",
      "onChange={e=>{const d=e.target.value.replace(/\\D/g,'').slice(0,10);setForm({...form,donor_phone:d});}}",
      "onChange={e=>{const d=clampPhone10(e.target.value);setForm({...form,donor_phone:d});}}",
      "Donations donor_phone clamp")

patch("src/pages/Families.tsx",
      "onChange={e=>{const d=e.target.value.replace(/\\D/g,'').slice(0,10);setForm({...form,phone:d});}}",
      "onChange={e=>{const d=clampPhone10(e.target.value);setForm({...form,phone:d});}}",
      "Families phone clamp")
patch("src/pages/Families.tsx",
      "onChange={e=>{const d=e.target.value.replace(/\\D/g,'').slice(0,10);setForm({...form,alt_phone:d});}}",
      "onChange={e=>{const d=clampPhone10(e.target.value);setForm({...form,alt_phone:d});}}",
      "Families alt_phone clamp")

patch("src/pages/Settings.tsx",
      "onChange={e=>{const d=e.target.value.replace(/\\D/g,'').slice(0,10);setSettings({...settings,phone:d});}}",
      "onChange={e=>{const d=clampPhone10(e.target.value);setSettings({...settings,phone:d});}}",
      "Settings phone clamp")

patch("src/pages/Staff.tsx",
      'onChange={e => setForm({ ...form, phone: e.target.value.replace(/\\D/g, "").slice(0, 10) })}',
      'onChange={e => setForm({ ...form, phone: clampPhone10(e.target.value) })}',
      "Staff phone clamp")

patch("src/pages/Members.tsx",
      "onChange={e=>setNewFamily({...newFamily,phone:e.target.value.replace(/\\D/g,'').slice(0,10)})}",
      "onChange={e=>setNewFamily({...newFamily,phone:clampPhone10(e.target.value)})}",
      "Members newFamily phone clamp")
patch("src/pages/Members.tsx",
      "onChange={e=>setBulkFamilyData({...bulkFamilyData,phone:e.target.value.replace(/\\D/g,'').slice(0,10)})}",
      "onChange={e=>setBulkFamilyData({...bulkFamilyData,phone:clampPhone10(e.target.value)})}",
      "Members bulk phone clamp")
patch("src/pages/Members.tsx",
      "onChange={e=>{const d=e.target.value.replace(/\\D/g,'').slice(0,10);setForm({...form,emergency_contact:d});}}",
      "onChange={e=>{const d=clampPhone10(e.target.value);setForm({...form,emergency_contact:d});}}",
      "Members emergency_contact clamp")

patch("src/pages/Committee.tsx",
      'onChange={e => setForm({ ...form, phone: e.target.value.replace(/\\D/g, "").slice(0, 10) })}',
      'onChange={e => setForm({ ...form, phone: clampPhone10(e.target.value) })}',
      "Committee phone clamp")

# ---------------- F2 amount guards ----------------
patch("src/pages/Donations.tsx",
      'if(!form.donor_name?.trim()||!form.amount||!categoryId){toast.error(t("ui_donor_cat_amount_required"));return;}',
      'if(!form.donor_name?.trim()||!form.amount||!categoryId){toast.error(t("ui_donor_cat_amount_required"));return;}const amtErr=amountError(form.amount,tx);if(amtErr){toast.error(amtErr);return;}',
      "Donations amount guard")

patch("src/pages/Accounting.tsx",
      '''if (!form.amount || !form.txn_date) {
      toast.error(t("ui_amount_date_required"));
      return;
    }''',
      '''if (!form.amount || !form.txn_date) {
      toast.error(t("ui_amount_date_required"));
      return;
    }
    const amtErr = amountError(form.amount, t);
    if (amtErr) { toast.error(amtErr); return; }''',
      "Accounting amount guard")

patch("src/pages/Welfare.tsx",
      '''if (!form.category) {
      toast.error(t("wel_category_required"));
      return;
    }''',
      '''if (!form.category) {
      toast.error(t("wel_category_required"));
      return;
    }
    const amtErr = amountError(form.amount_requested, t);
    if (amtErr) { toast.error(amtErr); return; }''',
      "Welfare amount guard")

patch("src/pages/Staff.tsx",
      'if (!form.name) { toast.error(t("staff_name_required")); return; }',
      '''if (!form.name) { toast.error(t("staff_name_required")); return; }
    const salaryErr = nonNegativeAmountError(form.salary, t);
    if (salaryErr) { toast.error(salaryErr); return; }''',
      "Staff salary guard")

patch("src/pages/Staff.tsx",
      'if (!payForm.staffId || !payForm.periodMonth || !payForm.periodYear) return;',
      '''if (!payForm.staffId || !payForm.periodMonth || !payForm.periodYear) return;
    const payAmtErr = amountError(payForm.amount, t);
    if (payAmtErr) { toast.error(payAmtErr); return; }''',
      "Staff pay guard")

# ---------------- F3 friendly send errors ----------------
patch("src/pages/Donations.tsx",
      'catch(err:any){toast.error(err.message||tx("Donation saved, but WhatsApp receipt was not sent","സംഭാവന സേവ് ചെയ്തു, പക്ഷേ വാട്ട്സ്ആപ്പ് രസീത് അയച്ചില്ല"));refetch();}})();}}',
      'catch(err:any){toast.error(friendlySendError(err,t)||tx("Donation saved, but WhatsApp receipt was not sent","സംഭാവന സേവ് ചെയ്തു, പക്ഷേ വാട്ട്സ്ആപ്പ് രസീത് അയച്ചില്ല"));refetch();}})();}}',
      "Donations background send catch")

patch("src/pages/Donations.tsx",
      'catch(e:any){toast.error(e.message||tx("Could not send the receipt on WhatsApp","വാട്ട്സ്ആപ്പിൽ രസീത് അയയ്ക്കാനായില്ല"));refetch();}finally{setSendingId(null);}',
      'catch(e:any){toast.error(friendlySendError(e,t)||tx("Could not send the receipt on WhatsApp","വാട്ട്സ്ആപ്പിൽ രസീത് അയയ്ക്കാനായില്ല"));refetch();}finally{setSendingId(null);}',
      "Donations sendDonationReceipt catch")

patch("src/pages/Subscriptions.tsx",
      'catch (e: any) {\n      toast.error(e?.message || tx("Could not send the receipt", "\\u0d30\\u0d38\\u0d40\\u0d1f\\u0d4d\\u0d1f\\u0d4d \\u0d05\\u0d2f\\u0d2f\\u0d4d\\u0d15\\u0d4d\\u0d15\\u0d3e\\u0d28\\u0d3e\\u0d2f\\u0d3f\\u0d32\\u0d4d\\u0d32"));',
      'catch (e: any) {\n      toast.error(friendlySendError(e, t) || tx("Could not send the receipt", "\\u0d30\\u0d38\\u0d40\\u0d1f\\u0d4d\\u0d1f\\u0d4d \\u0d05\\u0d2f\\u0d2f\\u0d4d\\u0d15\\u0d4d\\u0d15\\u0d3e\\u0d28\\u0d3e\\u0d2f\\u0d3f\\u0d32\\u0d4d\\u0d32"));',
      "Subscriptions sendReceipt catch")

# ---------------- report ----------------
print(f"APPLIED {len(applied)}:")
for a in applied: print(f"  ok  {a}")
if failures:
    print(f"\nFAILED {len(failures)}:")
    for f in failures: print(f"  !!  {f}")
    sys.exit(1)
print("\nAll patches applied cleanly.")
