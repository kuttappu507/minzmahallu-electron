/* Shared renderer helpers for record_history rows (Members / Committee / Staff
 * previews). record_history.changes_json is a JSON object of snake_case field
 * keys → {old,new} diffs; showing it raw looked like "codes". These helpers
 * turn the diff into labelled "old → new" rows with bilingual labels. */
export type Lang = "en" | "ml";
export interface HistoryChange { label: string; from: string; to: string; }

const FIELD_LABELS: Record<string, [string, string]> = {
  name: ["Name", "പേര്"],
  arabic_name: ["Arabic name", "അറബി പേര്"],
  father_name: ["Father's name", "പിതാവിന്റെ പേര്"],
  gender: ["Gender", "ലിംഗം"],
  date_of_birth: ["Date of birth", "ജനനത്തീയതി"],
  age: ["Age", "പ്രായം"],
  blood_group: ["Blood group", "രക്തഗ്രൂപ്പ്"],
  occupation: ["Occupation", "തൊഴിൽ"],
  education: ["Education", "വിദ്യാഭ്യാസം"],
  marital_status: ["Marital status", "വൈവാഹിക നില"],
  mobile: ["Mobile", "മൊബൈൽ"],
  email: ["Email", "ഇമെയിൽ"],
  emergency_contact: ["Emergency contact", "അടിയന്തര ബന്ധപ്പെടേണ്ട വ്യക്തി"],
  relationship: ["Relationship", "ബന്ധം"],
  status: ["Status", "സ്ഥിതി"],
  nationality: ["Nationality", "പൗരത്വം"],
  address: ["Address", "വിലാസം"],
  father_id: ["Father (linked member)", "പിതാവ് (ബന്ധിപ്പിച്ച അംഗം)"],
  mother_id: ["Mother (linked member)", "മാതാവ് (ബന്ധിപ്പിച്ച അംഗം)"],
  spouse_id: ["Spouse (linked member)", "ഇണ (ബന്ധിപ്പിച്ച അംഗം)"],
  family_id: ["Family", "കുടുംബം"],
  house_name: ["House name", "വീട്ടുപേര്"],
  house_number: ["House number", "വീട്ടുനമ്പർ"],
  ward: ["Ward", "വാർഡ്"],
  area: ["Area / Locality", "പ്രദേശം"],
  pincode: ["Pincode", "പിൻകോഡ്"],
  phone: ["Phone", "ഫോൺ"],
  alt_phone: ["Alternate phone", "ബദൽ ഫോൺ നമ്പർ"],
  notes: ["Notes", "കുറിപ്പുകൾ"],
  position: ["Position", "പദവി"],
  committee_type: ["Committee type", "കമ്മിറ്റി തരം"],
  designation: ["Designation", "തസ്തിക"],
  term_start: ["Term start", "കാലാവധി തുടക്കം"],
  term_end: ["Term end", "കാലാവധി അവസാനിക്കുന്നത്"],
  salary: ["Salary", "ശമ്പളം"],
  joined_on: ["Joined on", "ചേർന്ന തീയതി"],
  role: ["Role", "റോൾ"],
  full_name: ["Full name", "പൂർണ്ണ പേര്"],
  amount: ["Amount", "തുക"],
  amount_paid: ["Amount paid", "നൽകിയ തുക"],
  payment_date: ["Payment date", "പണമടച്ച തീയതി"],
  payment_method: ["Payment method", "പണമടച്ച രീതി"],
  transaction_ref: ["Transaction ref", "ഇടപാട് റഫറൻസ്"],
  remarks: ["Remarks", "കുറിപ്പുകൾ"],
  category: ["Category", "വിഭാഗം"],
  description: ["Description", "വിവരണം"],
  start_date: ["Start date", "തുടങ്ങിയ തീയതി"],
  end_date: ["End date", "അവസാനിച്ച തീയതി"],
  period: ["Period", "കാലയളവ്"],
  method: ["Method", "പണമടച്ച രീതി"],
};

const ACTION_LABELS: Record<string, [string, string]> = {
  EDIT: ["Edited", "തിരുത്തി"],
  UPDATE: ["Edited", "തിരുത്തി"],
  CREATE: ["Created", "ചേർത്തു"],
  ADD: ["Created", "ചേർത്തു"],
  ARCHIVE: ["Archived", "ആർക്കൈവ് ചെയ്തു"],
  RESTORE: ["Restored", "പുനഃസ്ഥാപിച്ചു"],
  STATUS: ["Status changed", "നില മാറ്റി"],
  PAY: ["Payment recorded", "അടവ് രേഖപ്പെടുത്തി"],
  PAYMENT: ["Payment recorded", "അടവ് രേഖപ്പെടുത്തി"],
  CANCEL: ["Cancelled", "റദ്ദാക്കി"],
  REMOVE: ["Removed", "നീക്കി"],
  FAMILY_MOVE: ["Family moved", "കുടുംബം മാറ്റി"],
  RESIGN: ["Resigned", "രാജി വച്ചു"],
  EXPEL: ["Expelled", "സേവനത്തിൽ നിന്ന് ഒഴിവാക്കി"],
};

const val = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
};

const label = (key: string, lang: Lang): string => {
  const pair = FIELD_LABELS[key];
  if (pair) return lang === "ml" ? pair[1] : pair[0];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Friendly label for an action code ("EDIT" → "Edited" / "തിരുത്തി"). */
export function friendlyAction(action: string, lang: Lang): string {
  const pair = ACTION_LABELS[String(action || "").toUpperCase()];
  if (pair) return lang === "ml" ? pair[1] : pair[0];
  return String(action || "").replace(/_/g, " ").toLowerCase();
}

/** Parse changes_json into labelled {from,to} rows. ID-link fields render as "#id". */
export function formatHistoryChanges(raw: string, lang: Lang): HistoryChange[] {
  if (!raw) return [];
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!parsed || typeof parsed !== "object") return [];
  const linkField = (k: string, v: any) => {
    if (!k.endsWith("_id")) return val(v);
    if (v === null || v === undefined || v === "" || v === 0) return "—";
    return `#${v}`;
  };
  return Object.entries(parsed).map(([k, change]: [string, any]) => {
    const obj = (change && typeof change === "object") ? change : { old: undefined, new: change };
    const from = linkField(k, obj?.old ?? obj?.before ?? obj?.from);
    const to = linkField(k, obj?.new ?? obj?.after ?? obj?.to);
    return { label: label(k, lang), from, to };
  });
}
