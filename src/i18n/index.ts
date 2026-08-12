/*
 * i18n — English + Malayalam translations.
 * Ported from Qt project's I18N.cpp.
 * Uses a custom lightweight store (no external i18n lib needed).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Lang = "en" | "ml";

const translations: Record<string, { en: string; ml: string }> = {
  // App
  app_name: { en: "Minz Mahallu Management", ml: "മിൻസ് മഹല്ല് മാനേജ്മെന്റ്" },
  app_subtitle: { en: "Mosque Community Administration", ml: "മസ്ജിദ് കമ്മ്യൂണിറ്റി ഭരണം" },
  search_placeholder: { en: "Search records...", ml: "രേഖകൾ തിരയുക..." },

  // Auth
  login_title: { en: "Sign In", ml: "സൈൻ ഇൻ" },
  login_username: { en: "Username", ml: "ഉപയോക്തൃനാമം" },
  login_password: { en: "Password", ml: "രഹസ്യവാക്ക്" },
  login_button: { en: "Login", ml: "ലോഗിൻ" },
  login_default_hint: { en: "Default: admin / admin123", ml: "സ്ഥിരസ്ഥിതി: admin / admin123" },

  // Nav
  nav_dashboard: { en: "Dashboard", ml: "ഡാഷ്ബോർഡ്" },
  nav_families: { en: "Families", ml: "കുടുംബങ്ങൾ" },
  nav_members: { en: "Members", ml: "അംഗങ്ങൾ" },
  nav_subscriptions: { en: "Subscriptions", ml: "സബ്സ്ക്രിപ്ഷൻ" },
  nav_donations: { en: "Donations", ml: "സംഭാവനകൾ" },
  nav_accounting: { en: "Accounting", ml: "അക്കൗണ്ടിംഗ്" },
  nav_marriage: { en: "Marriage Register", ml: "വിവാഹ രജിസ്റ്റർ" },
  nav_death: { en: "Death Register", ml: "മരണ രജിസ്റ്റർ" },
  nav_welfare: { en: "Welfare", ml: "ക്ഷേമം" },
  nav_certificates: { en: "Certificates", ml: "സർട്ടിഫിക്കറ്റുകൾ" },
  nav_tokens: { en: "Tokens", ml: "ടോക്കണുകൾ" },
  nav_reports: { en: "Reports", ml: "റിപ്പോർട്ടുകൾ" },
  nav_settings: { en: "Settings", ml: "ക്രമീകരണങ്ങൾ" },
  nav_users: { en: "Users", ml: "ഉപയോക്താക്കൾ" },
  nav_audit: { en: "Audit Log", ml: "ഓഡിറ്റ് ലോഗ്" },
  nav_backup: { en: "Backup & Restore", ml: "ബാക്കപ്പ് & റെസ്റ്റോർ" },
  action_logout: { en: "Logout", ml: "ലോഗ്ഔട്ട്" },

  // Common actions
  action_add: { en: "Add", ml: "ചേർക്കുക" },
  action_edit: { en: "Edit", ml: "തിരുത്തുക" },
  action_delete: { en: "Delete", ml: "ഇല്ലാതാക്കുക" },
  action_save: { en: "Save", ml: "സേവ്" },
  action_cancel: { en: "Cancel", ml: "റദ്ദാക്കുക" },
  action_search: { en: "Search", ml: "തിരയുക" },
  action_print: { en: "Print", ml: "പ്രിന്റ്" },
  action_export: { en: "Export", ml: "കയറ്റുമതി" },
  action_refresh: { en: "Refresh", ml: "പുതുക്കുക" },
  action_approve: { en: "Approve", ml: "അംഗീകരിക്കുക" },
  action_reject: { en: "Reject", ml: "നിരസിക്കുക" },
  action_disburse: { en: "Disburse", ml: "വിതരണം ചെയ്യുക" },
  action_generate: { en: "Generate", ml: "ജനറേറ്റ്" },

  // Dashboard
  dash_greeting: { en: "Assalamu Alaikum,", ml: "അസ്സലാമു അലൈക്കും," },
  dash_subtitle: { en: "Here's what's happening in your mahallu today.", ml: "നിങ്ങളുടെ മഹല്ലിലെ ഇന്നത്തെ അവലോകനം." },
  dash_recent_activity: { en: "Recent Activity", ml: "സമീപകാല പ്രവർത്തനങ്ങൾ" },
  dash_total_families: { en: "Total Families", ml: "മൊത്തം കുടുംബങ്ങൾ" },
  dash_total_members: { en: "Total Members", ml: "മൊത്തം അംഗങ്ങൾ" },
  dash_active_members: { en: "Active Members", ml: "സജീവ അംഗങ്ങൾ" },
  dash_monthly_collection: { en: "Collection", ml: "പിരിവ്" },
  dash_pending_dues: { en: "Pending Dues", ml: "ബാക്കി തുക" },
  dash_donations_month: { en: "Donations (Month)", ml: "സംഭാവനകൾ (മാസം)" },
  dash_welfare_disbursed: { en: "Welfare Disbursed", ml: "ക്ഷേമ വിതരണം" },
  dash_marriages_year: { en: "Marriages (Year)", ml: "വിവാഹങ്ങൾ (വർഷം)" },
  dash_deaths_year: { en: "Deaths (Year)", ml: "മരണങ്ങൾ (വർഷം)" },
  dash_balance_month: { en: "Balance", ml: "ബാലൻസ്" },
  dash_chart_collections: { en: "Monthly Collections", ml: "പ്രതിമാസ പിരിവ്" },
  dash_chart_donations: { en: "Donations by Category", ml: "വിഭാഗം അനുസരിച്ച് സംഭാവനകൾ" },
  dash_chart_income_expense: { en: "Income vs Expense", ml: "വരുമാനം vs ചെലവ്" },

  // Families
  family_title: { en: "Family Management", ml: "കുടുംബ ഭരണം" },
  family_subtitle: { en: "Manage all registered families in the mahallu", ml: "മഹല്ലിലെ എല്ലാ രജിസ്റ്റർ ചെയ്ത കുടുംബങ്ങളെ കൈകാര്യം ചെയ്യുക" },
  family_number: { en: "Family No", ml: "കുടുംബ നമ്പർ" },
  family_house_name: { en: "House Name", ml: "വീടിന്റെ പേര്" },
  family_house_number: { en: "House Number", ml: "വീട്ട് നമ്പർ" },
  family_ward: { en: "Ward", ml: "വാർഡ്" },
  family_area: { en: "Area", ml: "പ്രദേശം" },
  family_address: { en: "Address", ml: "വിലാസം" },
  family_pincode: { en: "Pincode", ml: "പിൻകോഡ്" },
  family_phone: { en: "Phone", ml: "ഫോൺ" },
  family_alt_phone: { en: "Alt. Phone", ml: "ബദൽ ഫോൺ" },
  family_status: { en: "Status", ml: "നില" },
  family_members_count: { en: "Members", ml: "അംഗങ്ങൾ" },
  family_notes: { en: "Notes", ml: "കുറിപ്പുകൾ" },
  add_family: { en: "Add Family", ml: "കുടുംബം ചേർക്കുക" },

  // Members
  member_title: { en: "Member Management", ml: "അംഗ ഭരണം" },
  member_subtitle: { en: "Manage all registered members in the mahallu", ml: "മഹല്ലിലെ എല്ലാ രജിസ്റ്റർ ചെയ്ത അംഗങ്ങളെ കൈകാര്യം ചെയ്യുക" },
  member_code: { en: "Code", ml: "കോഡ്" },
  member_name: { en: "Name", ml: "പേര്" },
  member_gender: { en: "Gender", ml: "ലിംഗം" },
  member_dob: { en: "Date of Birth", ml: "ജനന തീയതി" },
  member_age: { en: "Age", ml: "പ്രായം" },
  member_blood_group: { en: "Blood Group", ml: "രക്തഗ്രൂപ്പ്" },
  member_occupation: { en: "Occupation", ml: "തൊഴിൽ" },
  member_education: { en: "Education", ml: "വിദ്യാഭ്യാസം" },
  member_marital_status: { en: "Marital Status", ml: "വൈവാഹിക നില" },
  member_mobile: { en: "Mobile", ml: "മൊബൈൽ" },
  member_email: { en: "Email", ml: "ഇമെയിൽ" },
  member_nationality: { en: "Nationality", ml: "ദേശീയത" },
  member_emergency_contact: { en: "Emergency Contact", ml: "അടിയന്തര ബന്ധം" },
  member_relationship: { en: "Relationship", ml: "ബന്ധം" },
  member_family: { en: "Family", ml: "കുടുംബം" },
  add_member: { en: "Add Member", ml: "അംഗം ചേർക്കുക" },
  member_male: { en: "Male", ml: "പുരുഷൻ" },
  member_female: { en: "Female", ml: "സ്ത്രീ" },
  member_other: { en: "Other", ml: "മറ്റുള്ളവ" },
  member_active: { en: "Active", ml: "സജീവം" },
  member_inactive: { en: "Inactive", ml: "നിർജീവം" },
  member_deceased: { en: "Deceased", ml: "മരിച്ചു" },

  // Subscriptions
  sub_title: { en: "Subscriptions", ml: "സബ്സ്ക്രിപ്ഷൻ" },
  sub_subtitle: { en: "Manage recurring contributions and collections", ml: "ആവർത്തിക്കുന്ന സംഭാവനകളും പിരിവുകളും കൈകാര്യം ചെയ്യുക" },
  sub_receipt: { en: "Receipt", ml: "രസീത്" },
  sub_plan: { en: "Plan", ml: "പ്ലാൻ" },
  sub_amount: { en: "Amount", ml: "തുക" },
  sub_amount_paid: { en: "Paid", ml: "അടച്ചു" },
  sub_payment_date: { en: "Payment Date", ml: "പേയ്മെന്റ് തീയതി" },
  sub_method: { en: "Method", ml: "രീതി" },
  sub_period_start: { en: "Period Start", ml: "കാലയളവ് ആരംഭം" },
  sub_period_end: { en: "Period End", ml: "കാലയളവ് അവസാനം" },
  sub_mark_overdue: { en: "Mark Overdue", ml: "കാലഹരണപ്പെട്ടതായി അടയാളപ്പെടുത്തുക" },
  sub_paid: { en: "Paid", ml: "അടച്ചു" },
  sub_pending: { en: "Pending", ml: "ബാക്കി" },
  sub_overdue: { en: "Overdue", ml: "കാലഹരണപ്പെട്ടു" },
  sub_partial: { en: "Partial", ml: "ഭാഗികം" },
  add_subscription: { en: "Add Subscription", ml: "സബ്സ്ക്രിപ്ഷൻ ചേർക്കുക" },

  // Donations
  don_title: { en: "Donations", ml: "സംഭാവനകൾ" },
  don_subtitle: { en: "Manage one-off donations and contributions", ml: "ഏകതവണ സംഭാവനകളും സംഭാവനകളും കൈകാര്യം ചെയ്യുക" },
  don_donor_name: { en: "Donor Name", ml: "സംഭാവകന്റെ പേര്" },
  don_donor_phone: { en: "Donor Phone", ml: "സംഭാവകന്റെ ഫോൺ" },
  don_category: { en: "Category", ml: "വിഭാഗം" },
  don_date: { en: "Date", ml: "തീയതി" },
  don_purpose: { en: "Purpose", ml: "ഉദ്ദേശ്യം" },
  add_donation: { en: "Add Donation", ml: "സംഭാവന ചേർക്കുക" },

  // Accounting
  acc_title: { en: "Accounting", ml: "അക്കൗണ്ടിംഗ്" },
  acc_subtitle: { en: "Manage ledger accounts and transactions", ml: "ലെഡ്ജർ അക്കൗണ്ടുകളും ഇടപാടുകളും കൈകാര്യം ചെയ്യുക" },
  acc_type: { en: "Type", ml: "തരം" },
  acc_description: { en: "Description", ml: "വിവരണം" },
  acc_income: { en: "Income", ml: "വരുമാനം" },
  acc_expense: { en: "Expense", ml: "ചെലവ്" },
  acc_balance: { en: "Balance", ml: "ബാലൻസ്" },
  acc_add_income: { en: "Add Income", ml: "വരുമാനം ചേർക്കുക" },
  acc_add_expense: { en: "Add Expense", ml: "ചെലവ് ചേർക്കുക" },
  add_transaction: { en: "Add Transaction", ml: "ഇടപാട് ചേർക്കുക" },

  // Marriage
  mrg_title: { en: "Marriage Register", ml: "വിവാഹ രജിസ്റ്റർ" },
  mrg_number: { en: "Marriage No", ml: "വിവാഹ നമ്പർ" },
  mrg_bride: { en: "Bride", ml: "വധു" },
  mrg_groom: { en: "Groom", ml: "വരൻ" },
  mrg_bride_father: { en: "Bride Father", ml: "വധുവിന്റെ പിതാവ്" },
  mrg_groom_father: { en: "Groom Father", ml: "വരന്റെ പിതാവ്" },
  mrg_nikah_date: { en: "Nikah Date", ml: "നികാഹ് തീയതി" },
  mrg_registration_date: { en: "Registration Date", ml: "രജിസ്ട്രേഷൻ തീയതി" },
  mrg_witness: { en: "Witness", ml: "സാക്ഷി" },
  mrg_mahar: { en: "Mahar", ml: "മഹർ" },
  mrg_place: { en: "Place", ml: "സ്ഥലം" },
  mrg_register: { en: "Register Marriage", ml: "വിവാഹം രജിസ്റ്റർ ചെയ്യുക" },

  // Death
  dth_title: { en: "Death Register", ml: "മരണ രജിസ്റ്റർ" },
  dth_subtitle: { en: "Death and burial records", ml: "മരണ ഖബർ രേഖകൾ" },
  dth_number: { en: "Death No", ml: "മരണ നമ്പർ" },
  dth_deceased: { en: "Deceased", ml: "മൃതൻ" },
  dth_father: { en: "Father Name", ml: "പിതാവിന്റെ പേര്" },
  dth_date_of_death: { en: "Date of Death", ml: "മരണ തീയതി" },
  dth_burial_date: { en: "Burial Date", ml: "ഖബർ സ്ഥാപന തീയതി" },
  dth_cause: { en: "Cause of Death", ml: "മരണ കാരണം" },
  dth_burial_place: { en: "Burial Place", ml: "ഖബർസ്ഥാനം" },

  // Welfare
  wel_title: { en: "Welfare Management", ml: "ക്ഷേമ ഭരണം" },
  wel_subtitle: { en: "Assistance requests and disbursements", ml: "സഹായ അപേക്ഷകളും വിതരണങ്ങളും" },
  wel_request_no: { en: "Request No", ml: "അപേക്ഷ നമ്പർ" },
  wel_applicant: { en: "Applicant", ml: "അപേക്ഷകൻ" },
  wel_amount_requested: { en: "Requested", ml: "ആവശ്യപ്പെട്ടത്" },
  wel_amount_approved: { en: "Approved", ml: "അംഗീകൃതം" },
  wel_reason: { en: "Reason", ml: "കാരണം" },
  wel_new_request: { en: "New Request", ml: "പുതിയ അപേക്ഷ" },
  wel_approve_request: { en: "Approve Request", ml: "അപേക്ഷ അംഗീകരിക്കുക" },
  wel_reject_request: { en: "Reject Request", ml: "അപേക്ഷ നിരസിക്കുക" },
  wel_mark_disbursed: { en: "Mark as Disbursed", ml: "വിതരണം ചെയ്തതായി അടയാളപ്പെടുത്തുക" },

  // Certificates
  cert_title: { en: "Certificates", ml: "സർട്ടിഫിക്കറ്റുകൾ" },
  cert_membership: { en: "Membership", ml: "അംഗത്വം" },
  cert_residence: { en: "Residence", ml: "വസതി" },
  cert_marriage: { en: "Marriage", ml: "വിവാഹം" },
  cert_death: { en: "Death", ml: "മരണം" },
  cert_generate_pdf: { en: "Generate PDF", ml: "PDF ജനറേറ്റ്" },

  // Reports
  rpt_title: { en: "Reports", ml: "റിപ്പോർട്ടുകൾ" },
  rpt_generate: { en: "Generate", ml: "ജനറേറ്റ്" },

  // Settings
  set_title: { en: "Settings", ml: "ക്രമീകരണങ്ങൾ" },
  set_subtitle: { en: "Configure your mahallu organization, appearance, and backup preferences.", ml: "നിങ്ങളുടെ മഹല്ല് ഓർഗനൈസേഷൻ, രൂപം, ബാക്കപ്പ് മുൻഗണനകൾ ക്രമീകരിക്കുക." },
  set_theme: { en: "Theme", ml: "തീം" },
  set_theme_light: { en: "Light", ml: "ലൈറ്റ്" },
  set_theme_dark: { en: "Dark", ml: "ഡാർക്ക്" },
  set_language: { en: "Language", ml: "ഭാഷ" },
  set_lang_english: { en: "English", ml: "ഇംഗ്ലീഷ്" },
  set_lang_malayalam: { en: "Malayalam", ml: "മലയാളം" },
  set_org_section: { en: "Organization", ml: "ഓർഗനൈസേഷൻ" },
  set_financial_section: { en: "Financial", ml: "സാമ്പത്തികം" },
  set_appearance_section: { en: "Appearance", ml: "രൂപം" },
  set_backup_section: { en: "Backup", ml: "ബാക്കപ്പ്" },
  set_mahallu_name: { en: "Mahallu Name", ml: "മഹല്ല് പേര്" },
  set_phone: { en: "Phone", ml: "ഫോൺ" },
  set_email: { en: "Email", ml: "ഇമെയിൽ" },
  set_financial_year_start: { en: "Financial Year Start", ml: "സാമ്പത്തിക വർഷം ആരംഭം" },
  set_currency_symbol: { en: "Currency Symbol", ml: "കറൻസി ചിഹ്നം" },
  set_receipt_prefix: { en: "Receipt Prefix", ml: "രസീത് പ്രിഫിക്സ്" },
  set_auto_backup: { en: "Auto Backup", ml: "ഓട്ടോ ബാക്കപ്പ്" },
  set_backup_interval: { en: "Backup Interval (hours)", ml: "ബാക്കപ്പ് ഇടവേള (മണിക്കൂർ)" },

  // Audit
  audit_title: { en: "Audit Log", ml: "ഓഡിറ്റ് ലോഗ്" },
  audit_time: { en: "Time", ml: "സമയം" },
  audit_user: { en: "User", ml: "ഉപയോക്താവ്" },
  audit_action: { en: "Action", ml: "പ്രവർത്തി" },
  audit_module: { en: "Module", ml: "മോഡ്യൂൾ" },
  audit_description: { en: "Description", ml: "വിവരണം" },

  // Backup
  bak_title: { en: "Backup & Restore", ml: "ബാക്കപ്പ് & റെസ്റ്റോർ" },
  bak_create_now: { en: "Create Backup Now", ml: "ഇപ്പോൾ ബാക്കപ്പ് ഉണ്ടാക്കുക" },
  bak_restore: { en: "Restore", ml: "റെസ്റ്റോർ" },
  bak_verify: { en: "Verify", ml: "പരിശോധിക്കുക" },

  // Users
  usr_title: { en: "User Management", ml: "ഉപയോക്തൃ ഭരണം" },
  usr_username: { en: "Username", ml: "ഉപയോക്തൃനാമം" },
  usr_full_name: { en: "Full Name", ml: "പൂർണ്ണ പേര്" },
  usr_role: { en: "Role", ml: "റോൾ" },
  usr_add: { en: "Add User", ml: "ഉപയോക്താവ് ചേർക്കുക" },

  // Generic UI
  ui_select: { en: "— Select —", ml: "— തിരഞ്ഞെടുക്കുക —" },
  ui_none: { en: "— None —", ml: "— ശൂന്യം —" },
  ui_records: { en: "records", ml: "രേഖകൾ" },
  ui_no_records: { en: "No records found", ml: "രേഖകളൊന്നുമില്ല" },
  ui_showing: { en: "Showing", ml: "കാണിക്കുന്നു" },
  ui_of: { en: "of", ml: "ഉള്ളതിൽ" },
  ui_page: { en: "Page", ml: "പേജ്" },
  ui_close: { en: "Close", ml: "അടയ്ക്കുക" },
  ui_save_changes: { en: "Save Changes", ml: "മാറ്റങ്ങൾ സേവ് ചെയ്യുക" },
  ui_click_add_to_create: { en: "Click 'Add' to create your first record", ml: "ആദ്യത്തെ രേഖ സൃഷ്ടിക്കാൻ 'ചേർക്കുക' ക്ലിക്ക് ചെയ്യുക" },
  ui_success: { en: "Success", ml: "വിജയം" },
  ui_error: { en: "Error", ml: "പിശക്" },
  ui_add_record: { en: "Add Record", ml: "രേഖ ചേർക്കുക" },
  ui_all: { en: "All", ml: "എല്ലാം" },
};

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string) => string;
  isMalayalam: () => boolean;
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      lang: "en",
      setLang: (l) => {
        set({ lang: l });
        // Apply lang-ml class to <html> so Malayalam font kicks in
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("lang-ml", l === "ml");
        }
      },
      toggleLang: () => {
        const next = get().lang === "en" ? "ml" : "en";
        set({ lang: next });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("lang-ml", next === "ml");
        }
      },
      t: (key: string) => {
        const entry = translations[key];
        if (!entry) return key;
        return entry[get().lang] || entry.en;
      },
      isMalayalam: () => get().lang === "ml",
    }),
    {
      name: "mms-i18n",
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          document.documentElement.classList.toggle("lang-ml", state.lang === "ml");
        }
      },
    }
  )
);
