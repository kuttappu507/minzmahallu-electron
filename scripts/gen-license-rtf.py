#!/usr/bin/env python3
"""Generate the NSIS installer license page assets (build/license.rtf + build/license.txt).

WHY (user report): the license agreement shown in the installation window
rendered Malayalam as an unformatted blob. Two causes:
  1. build/license.txt had LF-only line endings; NSIS's RichEdit license
     control needs CRLF, so every line break vanished -> one giant paragraph.
  2. A plain .txt license gets NO formatting at all in the RichEdit control
     (no bold headings, hard-wrapped fragments, no Malayalam-capable font).

THE FIX: electron-builder's license discovery (app-builder-lib
out/util/license.js getNotLocalizedLicenseFile) checks "license.rtf" BEFORE
"license.txt", and NSIS renders an RTF license with full rich formatting.
This script is the single source of truth for the disclaimer text and emits:
  - build/license.rtf : professional page — Segoe UI body, Nirmala UI for
    Malayalam runs (Windows' Malayalam UI font, ships with Win8+), teal bold
    section headings (brand color #0d9488), flowing paragraphs with real
    spacing. Single-line, pure-ASCII RTF (raw newlines would be read as
    paragraph breaks by some RichEdit versions, so there are none).
  - build/license.txt : CRLF, flowing-paragraph plain-text reference that
    also renders correctly if it is ever used directly.

Terminology follows the app's i18n authority (src/i18n/index.ts):
നടത്തിപ്പ് (never ഭരണം), no ഫീസ്, വരിസംഖ്യ (never സബ്സ്ക്രിപ്ഷൻ), സംഭാവന.
Pinned by electron/installer-license.test.ts.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

TITLE_EN = "Minz Mahallu Management System \u2014 Installation Disclaimer"
TITLE_ML = "Minz Mahallu Management System \u2014 \u0d07\u0d7b\u0d38\u0d4d\u0d31\u0d4d\u0d31\u0d3e\u0d33\u0d47\u0d37\u0d7b \u0d21\u0d3f\u0d38\u0d4d\u0d15\u0d4d\u0d32\u0d46\u0d2f\u0d4d\u0d2e\u0d7c"

SECTIONS = [
    {
        "en_h": "1. FREE SOFTWARE",
        "en": ("This application (\u201cMinz Mahallu Management System\u201d) is provided "
               "COMPLETELY FREE OF CHARGE for mahallu / masjid office administration. "
               "There is no licence fee, subscription or hidden payment. It may be "
               "installed and used on any number of computers."),
        "ml_h": "1. \u0d2a\u0d42\u0d7c\u0d23\u0d4d\u0d23 \u0d38\u0d57\u0d1c\u0d28\u0d4d\u0d2f\u0d02",
        "ml": ("\u0d2e\u0d39\u0d32\u0d4d\u0d32\u0d4d / \u0d2e\u0d38\u0d4d\u0d1c\u0d3f\u0d26\u0d4d \u0d13\u0d2b\u0d40\u0d38\u0d4d "
               "\u0d28\u0d1f\u0d24\u0d4d\u0d24\u0d3f\u0d2a\u0d4d\u0d2a\u0d3f\u0d28\u0d3e\u0d2f\u0d3f \u0d08 \u0d06\u0d2a\u0d4d\u0d2a\u0d4d "
               "\u0d2a\u0d42\u0d7c\u0d23\u0d4d\u0d23\u0d2e\u0d3e\u0d2f\u0d41\u0d02 \u0d38\u0d57\u0d1c\u0d28\u0d4d\u0d2f\u0d2e\u0d3e\u0d23\u0d4d. "
               "\u0d07\u0d7b\u0d38\u0d4d\u0d31\u0d4d\u0d31\u0d3e\u0d33\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d3e\u0d28\u0d4b "
               "\u0d09\u0d2a\u0d2f\u0d4b\u0d17\u0d3f\u0d15\u0d4d\u0d15\u0d3e\u0d28\u0d4b \u0d12\u0d30\u0d41 \u0d2a\u0d23\u0d35\u0d41\u0d2e\u0d3f\u0d32\u0d4d\u0d32 \u2014 "
               "\u0d2a\u0d4d\u0d30\u0d24\u0d3f\u0d2e\u0d3e\u0d38 \u0d24\u0d41\u0d15\u0d2f\u0d41\u0d02 "
               "\u0d2e\u0d31\u0d1e\u0d4d\u0d1e\u0d3f\u0d30\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28 \u0d1a\u0d46\u0d32\u0d35\u0d41\u0d2e\u0d3f\u0d32\u0d4d\u0d32. "
               "\u0d0e\u0d24\u0d4d\u0d30 \u0d15\u0d2e\u0d4d\u0d2a\u0d4d\u0d2f\u0d42\u0d1f\u0d4d\u0d31\u0d4a\u0d2a\u0d4d\u0d2a\u0d3f\u0d32\u0d41\u0d02 "
               "\u0d07\u0d7b\u0d38\u0d4d\u0d31\u0d4d\u0d31\u0d3e\u0d33\u0d41\u0d02 \u0d09\u0d2a\u0d2f\u0d4b\u0d17\u0d35\u0d41\u0d02 \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d3e\u0d02."),
    },
    {
        "en_h": "2. NO WARRANTY",
        "en": ("The software is provided \u201cAS IS\u201d, WITHOUT WARRANTY OF ANY KIND, "
               "express or implied \u2014 including, but not limited to, fitness for a "
               "particular purpose, accuracy of reports, certificates or accounts, "
               "and uninterrupted operation."),
        "ml_h": "2. \u0d35\u0d3e\u0d31\u0d28\u0d4d\u0d31\u0d3f \u0d07\u0d32\u0d4d\u0d32",
        "ml": ("\u0d38\u0d4b\u0d2b\u0d4d\u0d31\u0d4d\u0d31\u0d4d\u200c\u0d35\u0d46\u0d2f\u0d7c \u201c\u0d09\u0d33\u0d4d\u0d33\u0d24\u0d4d "
               "\u0d2a\u0d4b\u0d32\u0d46\u201d \u0d06\u0d23\u0d4d \u0d28\u0d7d\u0d15\u0d3f\u0d2f\u0d3f\u0d30\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d24\u0d4d. "
               "\u0d31\u0d3f\u0d2a\u0d4d\u0d2a\u0d4b\u0d7c\u0d1f\u0d4d\u0d1f\u0d41\u0d15\u0d33\u0d41\u0d1f\u0d46, "
               "\u0d38\u0d7c\u0d1f\u0d4d\u0d1f\u0d3f\u0d2b\u0d3f\u0d15\u0d4d\u0d15\u0d31\u0d4d\u0d31\u0d41\u0d15\u0d33\u0d41\u0d1f\u0d46, "
               "\u0d15\u0d23\u0d15\u0d4d\u0d15\u0d41\u0d15\u0d33\u0d41\u0d1f\u0d46 \u0d15\u0d43\u0d24\u0d4d\u0d2f\u0d24; "
               "\u0d24\u0d1f\u0d38\u0d4d\u0d38\u0d2e\u0d3f\u0d32\u0d4d\u0d32\u0d3e\u0d24\u0d4d\u0d24 \u0d2a\u0d4d\u0d30\u0d35\u0d7c\u0d24\u0d4d\u0d24\u0d28\u0d02 "
               "\u0d24\u0d41\u0d1f\u0d19\u0d4d\u0d19\u0d3f\u0d2f \u0d12\u0d28\u0d4d\u0d28\u0d3f\u0d28\u0d41\u0d02 \u0d12\u0d30\u0d41 "
               "\u0d35\u0d3e\u0d31\u0d28\u0d4d\u0d31\u0d3f\u0d2f\u0d41\u0d02 \u0d28\u0d7d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d3f\u0d32\u0d4d\u0d32."),
    },
    {
        "en_h": "3. LIMITATION OF LIABILITY",
        "en": ("To the maximum extent permitted by law, the authors, contributors and "
               "distributors of this software shall NOT be liable for any claim, "
               "damages, financial loss, data loss or legal dispute \u2014 whether in "
               "contract, tort or otherwise \u2014 arising from the use or misuse of "
               "this application."),
        "ml_h": "3. \u0d09\u0d24\u0d4d\u0d24\u0d30\u0d35\u0d3e\u0d26\u0d3f\u0d24\u0d4d\u0d24 \u0d2a\u0d30\u0d3f\u0d27\u0d3f",
        "ml": ("\u0d08 \u0d06\u0d2a\u0d4d\u0d2a\u0d4d \u0d09\u0d2a\u0d2f\u0d4b\u0d17\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d24\u0d3f\u0d7d "
               "\u0d28\u0d3f\u0d28\u0d4d\u0d28\u0d4b \u0d26\u0d41\u0d30\u0d41\u0d2a\u0d2f\u0d4b\u0d17\u0d24\u0d4d\u0d24\u0d3f\u0d7d "
               "\u0d28\u0d3f\u0d28\u0d4d\u0d28\u0d4b \u0d09\u0d23\u0d4d\u0d1f\u0d3e\u0d15\u0d41\u0d28\u0d4d\u0d28 "
               "\u0d21\u0d3e\u0d31\u0d4d\u0d31 \u0d28\u0d37\u0d4d\u0d1f\u0d02, \u0d38\u0d3e\u0d2e\u0d4d\u0d2a\u0d24\u0d4d\u0d24\u0d3f\u0d15 "
               "\u0d28\u0d37\u0d4d\u0d1f\u0d02, \u0d28\u0d3f\u0d2f\u0d2e \u0d24\u0d7c\u0d15\u0d4d\u0d15\u0d02, "
               "\u0d2e\u0d31\u0d4d\u0d31\u0d47\u0d24\u0d46\u0d19\u0d4d\u0d15\u0d3f\u0d32\u0d41\u0d02 \u0d15\u0d4d\u0d32\u0d46\u0d2f\u0d3f\u0d2e\u0d41\u0d15\u0d7e\u0d15\u0d4d\u0d15\u0d4d "
               "\u0d06\u0d2a\u0d4d\u0d2a\u0d4d \u0d28\u0d3f\u0d7c\u0d2e\u0d4d\u0d2e\u0d3e\u0d24\u0d3e\u0d15\u0d4d\u0d15\u0d33\u0d4b "
               "\u0d35\u0d3f\u0d24\u0d30\u0d23\u0d15\u0d4d\u0d15\u0d3e\u0d30\u0d4b \u0d09\u0d24\u0d4d\u0d24\u0d30\u0d35\u0d3e\u0d26\u0d3f "
               "\u0d05\u0d32\u0d4d\u0d32."),
    },
    {
        "en_h": "4. YOUR DATA IS YOUR RESPONSIBILITY",
        "en": ("All records (members, families, donations, subscriptions, "
               "certificates, accounts and WhatsApp sessions) are stored on THIS "
               "computer only. Take regular backups (Settings -> Backup) and verify "
               "every important document before it is used or issued. The creators "
               "cannot recover data lost on your machine and are not responsible "
               "for the accuracy of entries made by its users."),
        "ml_h": "4. \u0d21\u0d3e\u0d31\u0d4d\u0d31\u0d2f\u0d41\u0d1f\u0d46 \u0d09\u0d24\u0d4d\u0d24\u0d30\u0d35\u0d3e\u0d26\u0d3f\u0d24\u0d4d\u0d24\u0d02 \u0d09\u0d2a\u0d2f\u0d4b\u0d15\u0d4d\u0d24\u0d3e\u0d15\u0d4d\u0d15\u0d33\u0d41\u0d1f\u0d47\u0d24\u0d3e\u0d23\u0d4d",
        "ml": ("\u0d0e\u0d32\u0d4d\u0d32\u0d3e \u0d30\u0d47\u0d16\u0d15\u0d33\u0d41\u0d02 (\u0d05\u0d02\u0d17\u0d19\u0d4d\u0d19\u0d7e, "
               "\u0d15\u0d41\u0d1f\u0d41\u0d02\u0d2c\u0d19\u0d4d\u0d19\u0d7e, \u0d38\u0d02\u0d2d\u0d3e\u0d35\u0d28\u0d15\u0d7e, "
               "\u0d35\u0d30\u0d3f\u0d38\u0d02\u0d16\u0d4d\u0d2f\u0d15\u0d7e, \u0d38\u0d7c\u0d1f\u0d4d\u0d1f\u0d3f\u0d2b\u0d3f\u0d15\u0d4d\u0d15\u0d31\u0d4d\u0d31\u0d41\u0d15\u0d7e, "
               "\u0d15\u0d23\u0d15\u0d4d\u0d15\u0d41\u0d15\u0d7e, \u0d35\u0d3e\u0d1f\u0d4d\u0d1f\u0d4d\u0d38\u0d4d\u0d26\u0d2a\u0d4d\u0d2a\u0d4d "
               "\u0d38\u0d46\u0d37\u0d28\u0d41\u0d15\u0d7e) \u0d08 \u0d15\u0d2e\u0d4d\u0d2a\u0d4d\u0d2f\u0d42\u0d1f\u0d4d\u0d31\u0d4a\u0d2a\u0d4d\u0d2a\u0d3f\u0d7d "
               "\u0d2e\u0d3e\u0d24\u0d4d\u0d30\u0d02 \u0d38\u0d42\u0d15\u0d4d\u0d37\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d41. "
               "\u0d2a\u0d24\u0d3f\u0d35\u0d3e\u0d2f\u0d3f \u0d2c\u0d3e\u0d15\u0d4d\u0d15\u0d2a\u0d4d\u0d2a\u0d4d "
               "\u0d0e\u0d1f\u0d41\u0d15\u0d4d\u0d15\u0d41\u0d15 (Settings -> Backup); \u0d2a\u0d4d\u0d30\u0d27\u0d3e\u0d28 "
               "\u0d30\u0d47\u0d16\u0d15\u0d7e \u0d09\u0d2a\u0d2f\u0d4b\u0d17\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d02 \u0d2e\u0d41\u0d2e\u0d4d\u0d2a\u0d4d "
               "\u0d2a\u0d30\u0d3f\u0d36\u0d4b\u0d27\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d15. \u0d28\u0d3f\u0d19\u0d4d\u0d19\u0d33\u0d41\u0d1f\u0d46 "
               "\u0d15\u0d2e\u0d4d\u0d2a\u0d4d\u0d2f\u0d42\u0d1f\u0d4d\u0d31\u0d4a\u0d2a\u0d4d\u0d2a\u0d3f\u0d7d "
               "\u0d28\u0d37\u0d4d\u0d1f\u0d2a\u0d4d\u0d2a\u0d46\u0d1f\u0d41\u0d28\u0d4d\u0d28 \u0d21\u0d3e\u0d31\u0d4d\u0d31 "
               "\u0d24\u0d3f\u0d30\u0d3f\u0d15\u0d46 \u0d15\u0d4a\u0d23\u0d4d\u0d1f\u0d41\u0d35\u0d30\u0d3e\u0d7b "
               "\u0d28\u0d3f\u0d7c\u0d2e\u0d4d\u0d2e\u0d3e\u0d24\u0d3e\u0d15\u0d4d\u0d15\u0d7c\u0d15\u0d4d\u0d15\u0d4d "
               "\u0d15\u0d34\u0d3f\u0d2f\u0d3f\u0d32\u0d4d\u0d32."),
    },
    {
        "en_h": "5. THIRD-PARTY SERVICES",
        "en": ("WhatsApp message delivery uses YOUR OWN WhatsApp account. This "
               "software is not affiliated with, endorsed by, or connected to "
               "WhatsApp LLC or Meta Platforms, Inc."),
        "ml_h": "5. \u0d2e\u0d42\u0d28\u0d4d\u0d28\u0d3e\u0d02 \u0d15\u0d15\u0d4d\u0d37\u0d3f \u0d38\u0d47\u0d35\u0d28\u0d19\u0d4d\u0d19\u0d7e",
        "ml": ("\u0d35\u0d3e\u0d1f\u0d4d\u0d1f\u0d4d\u0d38\u0d4d\u0d26\u0d2a\u0d4d\u0d2a\u0d4d "
               "\u0d38\u0d28\u0d26\u0d47\u0d36\u0d19\u0d4d\u0d19\u0d7e \u0d05\u0d2f\u0d2f\u0d4d\u0d15\u0d4d\u0d15\u0d3e\u0d7b "
               "\u0d28\u0d3f\u0d19\u0d4d\u0d19\u0d33\u0d41\u0d1f\u0d46 \u0d38\u0d4d\u0d35\u0d28\u0d4d\u0d24\u0d02 "
               "\u0d35\u0d3e\u0d1f\u0d4d\u0d1f\u0d4d\u0d38\u0d4d\u0d26\u0d2a\u0d4d\u0d2a\u0d4d "
               "\u0d05\u0d15\u0d4d\u0d15\u0d57\u0d23\u0d4d\u0d1f\u0d4d \u0d09\u0d2a\u0d2f\u0d4b\u0d17\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d41. "
               "\u0d08 \u0d38\u0d4b\u0d2b\u0d4d\u0d31\u0d4d\u0d31\u0d4d\u0d35\u0d46\u0d2f\u0d7c WhatsApp LLC-\u0d2f\u0d41\u0d2e\u0d4b "
               "Meta Platforms-\u0d09\u0d2e\u0d4b \u0d2c\u0d28\u0d4d\u0d27\u0d2a\u0d4d\u0d2a\u0d46\u0d1f\u0d4d\u0d1f\u0d24\u0d32\u0d4d\u0d32."),
    },
    {
        "en_h": "6. ACCEPTANCE",
        "en": ("By clicking \u201cI Agree\u201d you confirm that you have read and "
               "accepted all the terms above on behalf of the mahallu."),
        "ml_h": "6. \u0d38\u0d2e\u0d4d\u0d2e\u0d24\u0d02",
        "ml": ("\u201cI Agree\u201d \u0d05\u0d2e\u0d7c\u0d24\u0d4d\u0d24\u0d41\u0d28\u0d4d\u0d28\u0d24\u0d3f\u0d32\u0d42\u0d1f\u0d46 "
               "\u0d2e\u0d47\u0d7d \u0d2a\u0d31\u0d1e\u0d4d\u0d1e \u0d0e\u0d32\u0d4d\u0d32\u0d3e "
               "\u0d35\u0d4d\u0d2f\u0d35\u0d38\u0d4d\u0d25\u0d15\u0d33\u0d41\u0d02 \u0d35\u0d3e\u0d2f\u0d3f\u0d1a\u0d4d\u0d1a\u0d4d "
               "\u0d2e\u0d39\u0d32\u0d4d\u0d32\u0d3f\u0d28\u0d4d\u0d31\u0d46 \u0d2a\u0d47\u0d30\u0d3f\u0d7d "
               "\u0d38\u0d4d\u0d35\u0d40\u0d15\u0d30\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d41 "
               "\u0d0e\u0d28\u0d4d\u0d28\u0d4d \u0d38\u0d2e\u0d4d\u0d2e\u0d24\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d41."),
    },
]


def rtf_escape(text: str) -> str:
    """Escape text for an RTF \\uc1 document: pure ASCII, non-ASCII -> \\uN?"""
    out = []
    for ch in text:
        code = ord(ch)
        if 0x20 <= code < 0x7F:
            if ch in "\\{}":
                out.append("\\" + ch)
            else:
                out.append(ch)
        else:
            # signed 16-bit decimal, as required by the RTF \u control
            out.append(f"\\u{code - 65536 if code > 32767 else code}?")
    return "".join(out)


def build_rtf() -> str:
    """Single-line, pure-ASCII, professional bilingual license page."""
    p = []
    a = p.append
    a(r"{\rtf1\ansi\ansicpg1252\deff0\deflang1033\uc1")
    a(r"{\fonttbl{\f0\fswiss\fcharset0 Segoe UI;}{\f1\fswiss\fcharset0 Nirmala UI;}}")
    a(r"{\colortbl;\red13\green148\blue142;}")  # brand teal #0d9488
    a(r"\fs18")
    # Title: English bold teal, Malayalam bold teal in Nirmala UI.
    a(r"{\b\cf1\fs22 " + rtf_escape(TITLE_EN) + r"}\par")
    a(r"{\b\cf1\fs22\f1 " + rtf_escape(TITLE_ML) + r"}\par")
    a(r"\par")
    for s in SECTIONS:
        # Section headings: numbered, bold, teal — EN then its Malayalam twin.
        a(r"{\b\cf1 " + rtf_escape(s["en_h"]) + r"}\par")
        a(r"{\b\cf1\f1 " + rtf_escape(s["ml_h"]) + r"}\par")
        a(r"\par")
        # Bodies flow as real paragraphs (the control word-wraps them) —
        # no hard-wrapped fragments, Malayalam shaped by Nirmala UI (\f1).
        a(rtf_escape(s["en"]) + r"\par")
        a(r"\par")
        a(r"{\f1 " + rtf_escape(s["ml"]) + r"}\par")
        a(r"\par\par")
    a("}")
    return "".join(p)


def build_txt() -> str:
    """CRLF plain-text reference (renders correctly even as a fallback)."""
    lines = [TITLE_EN, TITLE_ML, "=" * 60, ""]
    for s in SECTIONS:
        lines += [s["en_h"], s["en"], "", s["ml_h"], s["ml"], "", "-" * 60, ""]
    return "\r\n".join(lines).rstrip() + "\r\n"


def main() -> None:
    rtf = build_rtf()
    txt = build_txt()
    # Guard: RTF must be pure ASCII and brace-balanced before we write it.
    assert all(ord(c) < 128 for c in rtf), "RTF must be pure ASCII"
    assert rtf.count("{") == rtf.count("}"), "RTF braces unbalanced"
    (BUILD / "license.rtf").write_text(rtf, encoding="ascii", newline="\n")
    (BUILD / "license.txt").write_text(txt, encoding="utf-8", newline="")
    data = (BUILD / "license.txt").read_bytes()
    assert data.count(b"\r\n") == data.count(b"\n"), "license.txt must be CRLF-only"
    print(f"license.rtf: {len(rtf)} bytes | license.txt: {len(data)} bytes (CRLF)")


if __name__ == "__main__":
    main()
