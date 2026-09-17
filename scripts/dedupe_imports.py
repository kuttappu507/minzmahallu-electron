#!/usr/bin/env python3
"""Dedupe identical import lines left by the non-idempotent patch re-run."""
from pathlib import Path

FILES = [
    "src/pages/Donations.tsx", "src/pages/Families.tsx", "src/pages/Settings.tsx",
    "src/pages/Members.tsx", "src/pages/Committee.tsx", "src/pages/Accounting.tsx",
    "src/pages/Welfare.tsx", "src/pages/Subscriptions.tsx", "src/pages/Staff.tsx",
]
ROOT = Path("/home/z/my-project/repo-review")
for rel in FILES:
    p = ROOT / rel
    seen, out, removed = set(), [], 0
    for line in p.read_text(encoding="utf-8").splitlines(keepends=True):
        key = line.strip()
        if key.startswith("import ") and key in seen:
            removed += 1
            continue
        if key.startswith("import "):
            seen.add(key)
        out.append(line)
    if removed:
        p.write_text("".join(out), encoding="utf-8")
        print(f"{rel}: removed {removed} duplicate import(s)")
    else:
        print(f"{rel}: clean")
