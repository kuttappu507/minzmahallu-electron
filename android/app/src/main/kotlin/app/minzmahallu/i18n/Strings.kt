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
) {
    fun module(key: String): String = modules[key] ?: key
    fun status(key: String): String = statuses[key] ?: key
    fun role(key: String): String = roles[key] ?: key
    fun t(key: String): String = common[key] ?: key
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
