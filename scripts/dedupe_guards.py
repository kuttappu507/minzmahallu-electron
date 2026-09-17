#!/usr/bin/env python3
"""Remove duplicated guard lines created by the non-idempotent patch re-run.
Only collapses lines that are EXACT duplicates inserted by patch_round2.py."""
from pathlib import Path

ROOT = Path("/home/z/my-project/repo-review")

# (file, duplicated snippet) — snippet appears twice when re-applied
GUARDS = [
    ("src/pages/Donations.tsx",
     "const amtErr=amountError(form.amount,tx);if(amtErr){toast.error(amtErr);return;}"),
    ("src/pages/Accounting.tsx",
     "    const amtErr = amountError(form.amount, t);\n    if (amtErr) { toast.error(amtErr); return; }"),
    ("src/pages/Welfare.tsx",
     "    const amtErr = amountError(form.amount_requested, t);\n    if (amtErr) { toast.error(amtErr); return; }"),
    ("src/pages/Staff.tsx",
     "    const salaryErr = nonNegativeAmountError(form.salary, t);\n    if (salaryErr) { toast.error(salaryErr); return; }"),
    ("src/pages/Staff.tsx",
     "    const payAmtErr = amountError(payForm.amount, t);\n    if (payAmtErr) { toast.error(payAmtErr); return; }"),
]

for rel, snippet in GUARDS:
    p = ROOT / rel
    s = p.read_text(encoding="utf-8")
    n = s.count(snippet)
    if n == 2:
        s = s.replace(snippet + "\n" + snippet, snippet)
        p.write_text(s, encoding="utf-8")
        print(f"{rel}: collapsed duplicate guard")
    elif n == 1:
        print(f"{rel}: single guard — ok")
    else:
        print(f"{rel}: !! snippet found {n}x — inspect manually")
