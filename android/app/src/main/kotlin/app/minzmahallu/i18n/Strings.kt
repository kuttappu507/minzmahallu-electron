package app.minzmahallu.i18n

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * The translation table.
 *
 * A deliberate simplification of the desktop's 799-line i18n file rather than
 * a departure from it: Android already ships a resource mechanism with
 * configuration changes, density splits and per-locale fallback, so strings
 * that never change live in `res/values/strings.xml` and `res/values-ml/`.
 *
 * What belongs *here* is the set of labels that are computed at runtime —
 * status names, module titles, enum display names — because those have to
 * switch language without a resource lookup per row.
 */
@Immutable
enum class Language(val code: String, val label: String) {
    English("en", "English"),
    Malayalam("ml", "മലയാളം"),
    ;

    companion object {
        fun fromCode(code: String?): Language =
            entries.firstOrNull { it.code == code?.take(2)?.lowercase() } ?: English
    }
}

/** Runtime-resolved labels. Injected via [LocalStrings]. */
@Immutable
data class Strings(
    val language: Language,
    val modules: Map<String, String>,
    val statuses: Map<String, String>,
    val roles: Map<String, String>,
    val common: Map<String, String>,
    val errors: Map<String, String> = emptyMap(),
) {
    fun module(key: String): String = modules[key] ?: key
    fun status(key: String): String = statuses[key] ?: key
    fun role(key: String): String = roles[key] ?: key
    fun t(key: String): String = common[key] ?: key

    /**
     * Resolves a repository failure to something an operator can read.
     *
     * Repositories throw `DomainException(SimpleError(key))`, whose `message` is
     * the bare key — `error_bad_credentials`. Showing that was the "unusual
     * text" on the login screen. An unmapped key still falls back to English
     * and then to the key itself, so a new rule can never crash the UI.
     */
    fun error(key: String): String =
        errors[key]
            ?: EnglishStrings.errors[key]
            ?: key.replace('_', ' ').removePrefix("error ").replaceFirstChar { it.uppercase() }
}

val LocalStrings = staticCompositionLocalOf { EnglishStrings }

/**
 * English is the fallback table. The Malayalam table is generated from the
 * same keys in `MalayalamStrings`, so a missing key degrades to English
 * instead of crashing — the same behaviour as the desktop's `t()` helper.
 */
val EnglishStrings = Strings(
    language = Language.English,
    modules = mapOf(
        "dashboard" to "Dashboard",
        "families" to "Families",
        "members" to "Members",
        "staff" to "Staff",
        "committee" to "Committee",
        "subscriptions" to "Subscriptions",
        "donations" to "Donations",
        "whatsapp" to "WhatsApp",
        "accounting" to "Accounting",
        "assets" to "Assets",
        "marriages" to "Marriages",
        "deaths" to "Deaths",
        "welfare" to "Welfare",
        "certificates" to "Certificates",
        "tokens" to "Tokens",
        "reports" to "Reports",
        "approvals" to "Approvals",
        "settings" to "Settings",
        "users" to "Users",
        "audit" to "Audit Log",
        "backup" to "Backup",
    ),
    statuses = mapOf(
        "Active" to "Active",
        "Inactive" to "Inactive",
        "Archived" to "Archived",
        "Paid" to "Paid",
        "Partial" to "Partial",
        "Pending" to "Pending",
        "Overdue" to "Overdue",
        "Approved" to "Approved",
        "Rejected" to "Rejected",
        "Collected" to "Collected",
        "Cancelled" to "Cancelled",
        "Generated" to "Generated",
        "Issued" to "Issued",
        "Disbursed" to "Disbursed",
        "Deceased" to "Deceased",
        "Void" to "Void",
    ),
    roles = mapOf(
        "Administrator" to "Administrator",
        "President" to "President",
        "Secretary" to "Secretary",
        "Treasurer" to "Treasurer",
        "Imam" to "Imam",
        "Staff" to "Staff",
        "Auditor" to "Auditor",
        "Member" to "Member",
    ),
    common = mapOf(
        "save" to "Save",
        "cancel" to "Cancel",
        "delete" to "Delete",
        "search" to "Search",
        "noResults" to "Nothing here yet",
        "pendingApproval" to "Pending approval",
    ),
    errors = mapOf(
        "error_not_found" to "That record could not be found.",
        "error_validation" to "Some of the details are not valid.",
        "error_duplicate" to "That entry already exists.",
        "error_receipt_frozen" to "A receipt has already been issued, so this entry can no longer be changed.",
        "error_awaiting_approval" to "This entry is waiting for approval and cannot be edited yet.",
        "error_role_denied" to "Your role does not allow this action.",
        "error_admin_password" to "The administrator password is not correct.",
        "error_single_head" to "Another member of this family is already the head.",
        "error_one_subscription_per_family" to "This family already has a subscription.",
        "error_event_not_over" to "The token event has not ended yet.",
        "error_reason_required" to "A reason is required.",
        "error_voided" to "This entry has been voided.",
        "error_locked" to "Too many failed attempts. This account is temporarily locked.",
        "error_inactive" to "This account is not active.",
        "error_bad_credentials" to "The username or password is not correct.",
        "error_pwd_policy" to "The password needs at least 8 characters with an uppercase letter, a lowercase letter, a digit and a symbol.",
        "error_username_policy" to "Use 3–32 letters, digits, dot, dash or underscore.",
        "error_setup_done" to "Initial setup has already been completed.",
        "error_category_in_use" to "That category is still used by existing records.",
        "error_asset_missing" to "That asset could not be found.",
        "error_duplicate_salary" to "Salary for this period has already been paid.",
        "error_token_not_found" to "That token could not be found.",
        "error_cancelled_token" to "That token has been cancelled.",
    ),
)

/** The Malayalam table. Same keys, translated values. */
val MalayalamStrings = Strings(
    language = Language.Malayalam,
    modules = mapOf(
        "dashboard" to "ഡാഷ്ബോർഡ്",
        "families" to "കുടുംബങ്ങൾ",
        "members" to "അംഗങ്ങൾ",
        "staff" to "ജീവനക്കാർ",
        "committee" to "കമ്മിറ്റി",
        "subscriptions" to "വരിസംഖ്യ",
        "donations" to "സംഭാവനകൾ",
        "whatsapp" to "വാട്ട്‌സ്ആപ്പ്",
        "accounting" to "അക്കൗണ്ടിംഗ്",
        "assets" to "ആസ്തികൾ",
        "marriages" to "വിവാഹങ്ങൾ",
        "deaths" to "മരണങ്ങൾ",
        "welfare" to "ക്ഷേമം",
        "certificates" to "സർട്ടിഫിക്കറ്റുകൾ",
        "tokens" to "ടോക്കണുകൾ",
        "reports" to "റിപ്പോർട്ടുകൾ",
        "approvals" to "അംഗീകാരങ്ങൾ",
        "settings" to "ക്രമീകരണങ്ങൾ",
        "users" to "ഉപയോക്താക്കൾ",
        "audit" to "ഓഡിറ്റ് ലോഗ്",
        "backup" to "ബാക്കപ്പ്",
    ),
    statuses = mapOf(
        "Active" to "സജീവം",
        "Inactive" to "നിർജീവം",
        "Archived" to "ആർക്കൈവ് ചെയ്തത്",
        "Paid" to "അടച്ചു",
        "Partial" to "ഭാഗികം",
        "Pending" to "ബാക്കി",
        "Overdue" to "കാലഹരണം",
        "Approved" to "അംഗീകരിച്ചു",
        "Rejected" to "നിരസിച്ചു",
        "Collected" to "ശേഖരിച്ചു",
        "Cancelled" to "റദ്ദാക്കി",
        "Generated" to "തയ്യാറാക്കി",
        "Issued" to "നൽകി",
        "Disbursed" to "വിതരണം ചെയ്തു",
        "Deceased" to "മരിച്ചു",
        "Void" to "അസാധുവാണ്",
    ),
    roles = mapOf(
        "Administrator" to "അഡ്മിനിസ്ട്രേറ്റർ",
        "President" to "പ്രസിഡന്റ്",
        "Secretary" to "സെക്രട്ടറി",
        "Treasurer" to "ട്രഷറർ",
        "Imam" to "ഇമാം",
        "Staff" to "ജീവനക്കാരൻ",
        "Auditor" to "ഓഡിറ്റർ",
        "Member" to "അംഗം",
    ),
    common = mapOf(
        "save" to "സേവ് ചെയ്യുക",
        "cancel" to "റദ്ദാക്കുക",
        "delete" to "ഇല്ലാതാക്കുക",
        "search" to "തിരയുക",
        "noResults" to "ഒന്നുമില്ല",
        "pendingApproval" to "അംഗീകാരത്തിനായി കാത്തിരിക്കുന്നു",
    ),
    errors = mapOf(
        "error_not_found" to "ആ രേഖ കണ്ടെത്താന്‍ കഴിഞ്ഞില്ല.",
        "error_validation" to "നൽകിയ വിവരങ്ങൾ ശരിയല്ല.",
        "error_duplicate" to "ആ എന്‍ട്രി നിന്നുമുപ്പ് ഉണ്ട്.",
        "error_receipt_frozen" to "രസീത് നൽകികഴിഞ്ഞു; ഈ എന്‍ട്രി മാറ്റാന്‍ കഴിയഇ.",
        "error_awaiting_approval" to "ഈ എന്‍ട്രി അനുമതിക്കാനുള്ള കാത്തിരിക്കുന്നു.",
        "error_role_denied" to "നിങ്ങൾക്ക് ഈ പ്രവർത്തി അനുവദിച്ചിട്ടില്ല.",
        "error_admin_password" to "അഡ്മിനിസ്ട്രേറ്റർ പാസ്സ്വേഡ് തെറ്റാണ്.",
        "error_single_head" to "ഈ കുടുംബത്തിലെ മറ്റൊരു അംഗം നിന്നുമുപ്പ് തലവന്‍ ആണ്.",
        "error_one_subscription_per_family" to "ഈ കുടുംബത്തിന് ഇതിനകം വരിസംഖ്യ ഉണ്ട്.",
        "error_event_not_over" to "ടോകൺ ഇവന്റ് ഇത്രവരെ അവസാനിച്ചിട്ടില്ല.",
        "error_reason_required" to "കാരണം ആവശ്യമാണ്.",
        "error_voided" to "ഈ എന്‍ട്രി റദ്ദാക്കി.",
        "error_locked" to "പല തവണ തെറ്റായി ശ്രമിച്ചു. അക്കൗണ്ട് താത്കാലികമായി പൂട്ടിയിരിക്കുന്നു.",
        "error_inactive" to "ഈ അക്കൗണ്ട് സജീവമല്ല.",
        "error_bad_credentials" to "ഉപയോക്തൃനാമം അല്ലെങ്കിൽ പാസ്സ്വേഡ് തെറ്റാണ്.",
        "error_pwd_policy" to "പാസ്സ്വേഡിന് ചുര്ക്കം 8 അക്കങ്ങ൳ വേണം: വലിയ അക്കരം, ചെറിയ അക്കരം, അകം, ചിന്ന്ഹ എന്നിവ.",
        "error_username_policy" to "3–32 അക്കരങ്ങൾ, അകങ്ങൾ, ഡോട്, ഡാഷ് അല്ലെങ്കിൽ അണടസ്കോർ ഉപയോഗിക്കുക.",
        "error_setup_done" to "ആദ്യ സജ്ജീകരണം നിന്നുമുപ്പ് പൂർത്തിയായി.",
        "error_category_in_use" to "ആ വിഭാഗം നിലവിൽ രേഖകളിൽ ഉപയോഗിക്കുന്നു.",
        "error_asset_missing" to "ആ ആസ്ഥി കണ്ടെത്താന്‍ കഴിഞ്ഞില്ല.",
        "error_duplicate_salary" to "ഈ കാലയളവിലെ ശംബളം നൽകികഴിഞ്ഞു.",
        "error_token_not_found" to "ആ ടോകൺ കണ്ടെത്താന്‍ കഴിഞ്ഞില്ല.",
        "error_cancelled_token" to "ആ ടോകൺ റദ്ദാക്കി.",
    ),
)

fun stringsFor(language: Language): Strings =
    if (language == Language.Malayalam) MalayalamStrings else EnglishStrings

/**
 * Malayalam-aware text layout.
 *
 * Malayalam stacks conjuncts vertically and needs noticeably more line height
 * than Latin text, so the type scale cannot simply be reused: a 14sp Poppins
 * body line and a 14sp Anek Malayalam line do not occupy the same box. Every
 * text style is therefore nudged when the language switches, which is what
 * keeps the bilingual UI from looking broken in one of the two languages.
 */
@Composable
fun Strings.lineHeightScale(): Float =
    if (language == Language.Malayalam) 1.22f else 1.0f
