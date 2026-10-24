package app.minzmahallu.core.common

/**
 * The closed value sets the database enforces with CHECK constraints.
 *
 * Keeping them as Kotlin enums (rather than free strings) means a typo in a
 * form can never reach the database — the Android equivalent of the desktop
 * app's `CHECK (status IN (...))` guards. `wire` is the exact text stored in
 * SQLite so a database produced by the Electron app opens unchanged.
 */

interface WireEnum {
    val wire: String
}

inline fun <reified T : WireEnum> wireTo(value: String?, default: T): T {
    val wanted = value?.trim()
    // Reflected over `default`'s own class rather than enumValues<T>(), which
    // would require a `T : Enum<T>` bound that a `where` clause cannot add to
    // an inline reified function without breaking inference at every call site.
    @Suppress("UNCHECKED_CAST")
    val constants = default.javaClass.enumConstants as? Array<T> ?: return default
    return constants.firstOrNull { it.wire.equals(wanted, ignoreCase = true) } ?: default
}

fun WireEnum?.orDash(): String = this?.wire ?: "—"

// ------------------------------------------------------------------- people

enum class Gender(override val wire: String) : WireEnum {
    Male("Male"),
    Female("Female"),
    Other("Other"),
}

enum class MaritalStatus(override val wire: String) : WireEnum {
    Single("Single"),
    Married("Married"),
    Divorced("Divorced"),
    Widowed("Widowed"),
}

enum class MemberStatus(override val wire: String) : WireEnum {
    Active("Active"),
    Inactive("Inactive"),
    Deceased("Deceased"),
}

enum class FamilyStatus(override val wire: String) : WireEnum {
    Active("Active"),
    Inactive("Inactive"),
    Archived("Archived"),
}

/** The household relationships offered by the member form. */
val RELATIONSHIPS: List<String> = listOf(
    "Head", "Spouse", "Son", "Daughter", "Father", "Mother",
    "Brother", "Sister", "Grandfather", "Grandmother", "Grandson",
    "Granddaughter", "Nephew", "Niece", "Uncle", "Aunt", "Other",
)

val BLOOD_GROUPS: List<String> = listOf("A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-")

// -------------------------------------------------------------------- money

enum class PaymentMethod(override val wire: String) : WireEnum {
    Cash("Cash"),
    Cheque("Cheque"),
    UPI("UPI"),
    BankTransfer("Bank Transfer"),
    Card("Card"),
    Other("Other"),
}

enum class PaymentStatus(override val wire: String) : WireEnum {
    Paid("Paid"),
    Pending("Pending"),
    Overdue("Overdue"),
    Partial("Partial"),
}

enum class LedgerType(override val wire: String) : WireEnum {
    Income("Income"),
    Expense("Expense"),
}

enum class LedgerEntryStatus(override val wire: String) : WireEnum {
    Posted("Posted"),
    Void("Void"),
}

// ---------------------------------------------------------------- registers

enum class CertificateType(override val wire: String) : WireEnum {
    Membership("Membership"),
    Residence("Residence"),
    Marriage("Marriage"),
    MarriageNoc("Marriage NOC"),
    Death("Death"),
    Character("Character"),
    Income("Income"),
}

enum class WelfareCategory(override val wire: String) : WireEnum {
    MedicalAid("Medical Aid"),
    EducationAid("Education Aid"),
    MarriageAssistance("Marriage Assistance"),
    FinancialAssistance("Financial Assistance"),
}

enum class WelfareStatus(override val wire: String) : WireEnum {
    Pending("Pending"),
    Approved("Approved"),
    Rejected("Rejected"),
    Disbursed("Disbursed"),
    Closed("Closed"),
}

// ------------------------------------------------------------------- tokens

enum class TokenStatus(override val wire: String) : WireEnum {
    Generated("GENERATED"),
    Issued("ISSUED"),
    Collected("COLLECTED"),
    Cancelled("CANCELLED"),
}

enum class TokenEventStatus(override val wire: String) : WireEnum {
    Active("active"),
    Completed("completed"),
    Cancelled("cancelled"),
}

// ------------------------------------------------------------- staff / body

enum class StaffStatus(override val wire: String) : WireEnum {
    Active("Active"),
    Inactive("Inactive"),
    Resigned("Resigned"),
    Expelled("Expelled"),
}

enum class PaymentFrequency(override val wire: String) : WireEnum {
    Monthly("Monthly"),
    Quarterly("Quarterly"),
    Annually("Annually"),
    OnDemand("OnDemand"),
}

enum class CommitteeType(override val wire: String) : WireEnum {
    Executive("Executive"),
    Advisory("Advisory"),
    Working("Working"),
    SubCommittee("Sub-Committee"),
    Trust("Trust"),
}

enum class CommitteeStatus(override val wire: String) : WireEnum {
    Active("Active"),
    Past("Past"),
    Resigned("Resigned"),
}

val COMMITTEE_POSITIONS: List<String> = listOf(
    "President", "Vice President", "Secretary", "Joint Secretary", "Treasurer",
    "Executive Member", "Committee Member", "Advisory Member", "Trustee",
    "Convener", "Madrasa Secretary", "Auditor",
)

val STAFF_ROLES: List<String> = listOf(
    "Imam", "Muazzin", "Khadim", "Secretary", "Treasurer", "Committee Member",
    "Madrasa Teacher", "Cleaner", "Security", "Electrician", "Plumber",
    "Office Staff", "Driver", "Other",
)

// ------------------------------------------------------------------- assets

val ASSET_CATEGORIES: List<String> = listOf(
    "Building", "Land", "Shop", "Hall", "Vehicle", "Furniture",
    "Electronics", "Sound System", "Generator", "Water Supply", "Other",
)

val ASSET_STATUSES: List<String> = listOf("In use", "Rented out", "Under repair", "Idle", "Disposed")

val ASSET_CONDITIONS: List<String> = listOf("Excellent", "Good", "Fair", "Poor", "Scrap")

// --------------------------------------------------------------- approvals

/** The tables that participate in the pending-approval workflow (V037). */
enum class ApprovalKind(override val wire: String) : WireEnum {
    Donations("donations"),
    Subscriptions("subscriptions"),
    Families("families"),
    Members("members"),
    Marriages("marriages"),
    Deaths("deaths"),
}

enum class ApprovalStatus(override val wire: String) : WireEnum {
    Pending("pending"),
    Approved("approved"),
}
