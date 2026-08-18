from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    if old not in s:
        return
    p.write_text(s.replace(old, new, 1), encoding="utf-8")


def ensure_text(path: str, marker: str, content: str) -> None:
    p = Path(path)
    if p.exists() and marker in p.read_text(encoding="utf-8"):
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Database compatibility
# ---------------------------------------------------------------------------
ensure_text(
    "resources/sql/migrations/V011_fix_module_schema_compatibility.sql",
    "V011: align module CRUD fields",
    """-- V011: align module CRUD fields with the production schema
ALTER TABLE marriages ADD COLUMN updated_at TEXT;
ALTER TABLE deaths ADD COLUMN updated_at TEXT;
ALTER TABLE welfare_requests ADD COLUMN request_date TEXT;
ALTER TABLE welfare_requests ADD COLUMN rejection_reason TEXT;
ALTER TABLE welfare_requests ADD COLUMN processed_by INTEGER;
ALTER TABLE welfare_requests ADD COLUMN processed_date TEXT;
UPDATE welfare_requests SET request_date = created_at WHERE request_date IS NULL;
""",
)

# ---------------------------------------------------------------------------
# Tokens: event deletion, including its token assignments through FK cascade.
# ---------------------------------------------------------------------------
replace_once(
    "electron/main.ts",
    'ipcMain.handle("tokens:updateEvent", (_e, id, d) => data.tokens.updateEvent(id, d));',
    'ipcMain.handle("tokens:updateEvent", (_e, id, d) => data.tokens.updateEvent(id, d));\n  ipcMain.handle("tokens:removeEvent", (_e, id: number) => { getDB().prepare("DELETE FROM token_events WHERE id = ?").run(id); return { success: true }; });',
)
replace_once(
    "electron/preload.mts",
    'updateEvent:(id:number,d:any)=>ipcRenderer.invoke("tokens:updateEvent",id,d),',
    'updateEvent:(id:number,d:any)=>ipcRenderer.invoke("tokens:updateEvent",id,d),removeEvent:(id:number)=>ipcRenderer.invoke("tokens:removeEvent",id),',
)
replace_once(
    "src/pages/Tokens.tsx",
    '  const [eventDialogOpen, setEventDialogOpen] = useState(false);',
    '  const [eventDialogOpen, setEventDialogOpen] = useState(false);\n  const [deleteEventBusy, setDeleteEventBusy] = useState(false);',
)
replace_once(
    "src/pages/Tokens.tsx",
    '  const saveEvent = async () => {',
    '''  const deleteEvent = async () => {
    if (!selectedEventId || deleteEventBusy) return;
    const ev = events.find(e => e.id === selectedEventId);
    if (!ev) return;
    const message = ml
      ? `"${ev.event_name}" ഇവന്റും അതിലെ എല്ലാ ടോക്കണുകളും ഇല്ലാതാക്കണോ? ഇത് തിരിച്ചെടുക്കാനാകില്ല.`
      : `Delete event "${ev.event_name}" and all its tokens? This cannot be undone.`;
    if (!window.confirm(message)) return;
    setDeleteEventBusy(true);
    try {
      await window.mms.tokens.removeEvent(selectedEventId);
      toast.success(ml ? "ഇവന്റ് ഇല്ലാതാക്കി" : "Event deleted");
      setSelectedEventId(null);
      setTokens([]);
      setStats({ total: 0, collected: 0, remaining: 0, rate: 0 });
      await loadEvents();
    } catch (e: any) {
      toast.error(e.message || (ml ? "ഇവന്റ് ഇല്ലാതാക്കാനായില്ല" : "Failed to delete event"));
    } finally {
      setDeleteEventBusy(false);
    }
  };

  const saveEvent = async () => {''',
)
replace_once(
    "src/pages/Tokens.tsx",
    '{selectedEventId && <Button variant="secondary" onClick={() => editEvent(selectedEventId)}>{text.editEvent}</Button>}',
    '{selectedEventId && <><Button variant="secondary" onClick={() => editEvent(selectedEventId)}>{text.editEvent}</Button><Button variant="danger" onClick={deleteEvent} disabled={deleteEventBusy}><Trash2 size={14} /> {ml ? "ഇവന്റ് ഇല്ലാതാക്കുക" : "Delete Event"}</Button></>}',
)

# ---------------------------------------------------------------------------
# Welfare: use the schema-compatible category values and add CRUD columns.
# ---------------------------------------------------------------------------
replace_once(
    "electron/services/data.service.ts",
    'categories: () => all<any>("SELECT * FROM welfare_categories WHERE is_active = 1 ORDER BY name"),',
    'categories: () => ["Medical Aid", "Education Aid", "Marriage Assistance", "Financial Assistance"],',
)
replace_once(
    "src/pages/Welfare.tsx",
    '    window.mms.welfare.categories().then((r) => setCategories(r || [])).catch(() => {});',
    '    window.mms.welfare.categories().then((r) => setCategories((r || []).map((name: any) => typeof name === "string" ? { name } : name))).catch(() => {});',
)

# ---------------------------------------------------------------------------
# Certificates: normalize stored aliases such as cert_marriage to the
# canonical certificate template type.
# ---------------------------------------------------------------------------
replace_once(
    "electron/print/certificate.template.ts",
    "const type = String(cert?.type || 'certificate').toLowerCase();",
    "const rawType = String(cert?.type || 'certificate').toLowerCase(); const type = ({cert_membership:'membership',cert_residence:'residence',cert_marriage:'marriage',cert_death:'death'} as Record<string,string>)[rawType] || rawType;",
)

# Chromium/Electron should respect the report page's CSS @page size.
replace_once("electron/main.ts", "preferCSSPageSize: false", "preferCSSPageSize: true")

# ---------------------------------------------------------------------------
# Reports: automatically use landscape for wide/financial reports, give every
# report a proper heading, and make table cells wrap instead of clipping.
# ---------------------------------------------------------------------------
p = Path("src/pages/Reports.tsx")
s = p.read_text(encoding="utf-8")
start = s.find("function buildPdfHtml(")
end = s.find("\nfunction downloadBlob(", start)
if start >= 0 and end > start:
    fn = '''function buildPdfHtml(title: string, rows: any[], columns: string[]): string {
  const lowerTitle = title.toLowerCase();
  const landscape = columns.length >= 7 || ["donation", "subscription", "financial", "member", "family", "welfare", "audit", "marriage", "death"].some((x) => lowerTitle.includes(x));
  const labels: Record<string, string> = {
    family_number: "Family No.", house_name: "House Name", house_number: "House No.", ward: "Ward", area: "Area", phone: "Phone", alt_phone: "Alt. Phone", member_count: "Members", status: "Status",
    code: "Member Code", name: "Name", gender: "Gender", age: "Age", blood_group: "Blood Group", mobile: "Mobile", email: "Email", occupation: "Occupation", relationship: "Relationship",
    receipt_number: "Receipt No.", plan_name: "Plan", amount: "Amount", amount_paid: "Paid", payment_date: "Payment Date", payment_method: "Payment Method", donor_name: "Donor", donor_phone: "Phone", category_name: "Category", category: "Category", donation_date: "Donation Date", purpose: "Purpose",
    date: "Date", type: "Type", description: "Description", method: "Method", marriage_number: "Marriage No.", nikah_date: "Nikah Date", bride_name: "Bride", bride_father: "Bride Father", groom_name: "Groom", groom_father: "Groom Father", place: "Place", mahar: "Mahar",
    death_number: "Death No.", deceased_name: "Deceased", father_name: "Father", date_of_death: "Date of Death", burial_date: "Burial Date", burial_place: "Burial Place", request_number: "Request No.", applicant_name: "Applicant", amount_requested: "Requested", amount_approved: "Approved",
    certificate_number: "Certificate No.", issued_to: "Issued To", issued_date: "Issued Date", issued_by: "Issued By", created_at: "Created", username: "User", action: "Action", module: "Module", count: "Count", latest: "Latest"
  };
  const pretty = (c: string) => labels[c] || c.replace(/_/g, " ").replace(/\\b\\w/g, (m) => m.toUpperCase());
  const head = columns.map((c) => `<th>${escapeHtml(pretty(c))}</th>`).join("");
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font: 400 10px Poppins, system-ui, sans-serif; color: #1e2b25; margin: 0; }
    h1 { font: 600 18px Poppins, sans-serif; margin: 0 0 4px; }
    .sub { color: #5f7268; font-size: 9px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: ${landscape ? "8.5" : "9.5"}px; table-layout: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #f6f9f6; text-align: left; padding: 5px 6px; border: 1px solid #dfe8e1; text-transform: uppercase; font-size: ${landscape ? "7.5" : "8.5"}px; letter-spacing: .06em; color: #5f7268; font-weight: 600; }
    td { padding: 5px 6px; border: 1px solid #e6ede7; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    tr:nth-child(even) td { background: #f8faf8; }
    .foot { margin-top: 12px; color: #8ba096; font-size: 8px; }
  </style></head><body><h1>${escapeHtml(title)}</h1><div class="sub">Minz Mahallu Management System · Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} records</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="foot">Printed report</div></body></html>`;
}
'''
    p.write_text(s[:start] + fn + s[end:], encoding="utf-8")

# ---------------------------------------------------------------------------
# Seed data: replace placeholders everywhere, not just the first occurrence.
# This keeps dashboard, family, member, subscription, donation and report
# screens populated with coherent human-readable sample data.
# ---------------------------------------------------------------------------
houses = ["Darul Aman", "Rahmath", "Noor Manzil", "Al Huda", "Mubarak", "Darussalam", "Manzil", "Safiya House", "Hiba", "Fathima Manzil", "Naseema", "Madinah House", "Safa", "Rahma", "Amina House"]
areas = ["Moozhikkal", "Vellimadukunnu", "Nadakkavu", "Kallai", "Puthiyangadi", "West Hill", "Kottooli", "Eranhipalam", "Chevayur", "Malaparamba", "Medical College", "Feroke", "Ramanattukara", "Pantheerankavu", "Kozhikode Beach"]
names = ["Abdul Rahman", "Fathima", "Muhammed Shafi", "Rukiya", "Niyas", "Shahana", "Afsal", "Suhara", "Rashid", "Sameera", "Junaid", "Haseena", "Shameer", "Nazeera", "Basheer", "Ameena", "Shabeer", "Rasiya", "Faisal", "Huda", "Muneer", "Sajida", "Naufal", "Aaliya", "Irfan", "Mariya", "Salman", "Safiya", "Ashraf", "Khadija"]
occupations = ["Civil Contractor", "Teacher", "Business Owner", "Homemaker", "Accountant", "Teacher", "Engineer", "Homemaker", "Electrician", "Nurse", "Shop Owner", "Homemaker", "Driver", "Tailor", "Retired Clerk", "Homemaker", "Technician", "Teacher", "Business Owner", "Homemaker", "Pharmacist", "Homemaker", "Bank Employee", "Teacher", "Designer", "Nurse", "Business Owner", "Homemaker", "Retired Teacher", "Homemaker"]

def replace_all_placeholders(text: str) -> str:
    for i, value in enumerate(houses, 1):
        text = text.replace(f"'House{i}'", f"'{value}'")
    for i, value in enumerate(areas, 1):
        text = text.replace(f"'Area{i}'", f"'{value}'")
        text = text.replace(f"'Address{i}'", f"'{houses[i-1]}, {value}, Kozhikode'" )
    for i, value in enumerate(names, 1):
        text = text.replace(f"'Member{i}'", f"'{value}'")
    for i, value in enumerate(occupations, 1):
        # Each member row has one occupation value; replace by row position.
        text = text.replace(f"'MEM-{i:03d}'", f"'MEM-{i:03d}'", 1)
    # Replace the repeated Worker values in member rows in order.
    pos = 0
    while pos < len(text):
        idx = text.find("'Worker'", pos)
        if idx < 0 or len(occupations) == 0:
            break
        # Only consume occurrences belonging to member INSERTs.
        before = text[max(0, idx - 120):idx]
        if "MEM-" in before:
            member_match = re.search(r"MEM-(\\d{3})", before)
            if member_match:
                n = int(member_match.group(1))
                if 1 <= n <= len(occupations):
                    text = text[:idx] + f"'{occupations[n-1]}'" + text[idx + len("'Worker'"):]
                    pos = idx + len(occupations[n-1]) + 2
                    continue
        pos = idx + len("'Worker'")
    for i in range(1, 16):
        donor = ["Abdul Hameed", "Muneer Koya", "Suhail Ahmed", "Yusuf Ali", "Afsana Rahman", "Shahid P", "Nabeel K", "Rashid PM", "Sameer TK", "Firoz KP", "Latheef M", "Nihala S", "Jabir C", "Ameen V", "Salim P"][i-1]
        text = text.replace(f"'Donor{i}'", f"'{donor}'")
    return text

seed = Path("resources/sql/seed.sql")
if seed.exists():
    seed.write_text(replace_all_placeholders(seed.read_text(encoding="utf-8")), encoding="utf-8")
