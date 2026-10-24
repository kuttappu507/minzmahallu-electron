package app.minzmahallu.core.common

/**
 * Role bifurcation — a direct port of `electron/services/roleAccess.ts`.
 *
 * One table maps each role to the modules it may WRITE; everything else is
 * read-only for that role. The desktop app enforces the matrix in its IPC
 * wrapper; here it is enforced in the repository layer *and* used by the UI to
 * hide write affordances, so a member account never sees an edit button it
 * would be refused.
 *
 * Two extra behaviours ride along:
 * * [isFullPower] — Administrator and Secretary have every write, approve other
 *   people's pending entries and pass every admin-password gate.
 * * [createsPending] — Member and Staff entries land as `pending` and are not
 *   counted in any ledger, dashboard or register until approved.
 */
object RoleAccess {

    /** Every module the matrix knows about. */
    enum class Module {
        Members, Families, Marriages, Deaths, Committee, Tokens, Certificates,
        Donations, Subscriptions, Accounting, Assets, Welfare, Staff, Users,
        Settings, Backup, Approvals,
    }

    private val FULL_POWER: Set<Role> = setOf(Role.Administrator, Role.Secretary)

    /** The bifurcation matrix: which modules each role may write. */
    private val WRITE_ACCESS: Map<Role, WriteScope> = mapOf(
        // Oversees everything: reads all, updates the people-side records.
        Role.President to WriteScope.Modules(
            setOf(Module.Members, Module.Families, Module.Committee),
        ),
        // Handles the money.
        Role.Treasurer to WriteScope.Modules(
            setOf(
                Module.Donations, Module.Subscriptions, Module.Accounting,
                Module.Assets, Module.Welfare, Module.Staff,
            ),
        ),
        // Religious registers only.
        Role.Imam to WriteScope.Modules(
            setOf(Module.Marriages, Module.Deaths, Module.Certificates),
        ),
        // Day-to-day data entry + token collection. Money and the people
        // registers they add land as PENDING until an admin approves.
        Role.Staff to WriteScope.Modules(
            setOf(
                Module.Members, Module.Families, Module.Marriages, Module.Deaths,
                Module.Tokens, Module.Donations, Module.Subscriptions,
            ),
        ),
        // A mahallu member may hand in donations / subscriptions only.
        Role.Member to WriteScope.Modules(
            setOf(Module.Donations, Module.Subscriptions),
        ),
        // Views everything, changes nothing.
        Role.Auditor to WriteScope.Modules(emptySet()),
        Role.Administrator to WriteScope.Everything,
        Role.Secretary to WriteScope.Everything,
    )

    fun canWrite(role: Role, module: Module): Boolean = when (val scope = WRITE_ACCESS[role]) {
        null -> false
        WriteScope.Everything -> true
        is WriteScope.Modules -> module in scope.modules
    }

    /** True for Administrator/Secretary: entries take effect immediately. */
    fun isFullPower(role: Role?): Boolean = role in FULL_POWER

    /** True for Member/Staff: their creates wait in the Approvals queue. */
    fun createsPending(role: Role?): Boolean = role == Role.Member || role == Role.Staff

    /** May this role see and act on the Approvals queue? */
    fun canApprove(role: Role?): Boolean = isFullPower(role)

    /** Actions that additionally require re-entering the administrator password. */
    fun requiresAdminPassword(role: Role?): Boolean = role == Role.Administrator

    /** The modules a role can write — drives which module tiles show a "+". */
    fun writableModules(role: Role): Set<Module> = when (val scope = WRITE_ACCESS[role]) {
        null -> emptySet()
        WriteScope.Everything -> Module.entries.toSet()
        is WriteScope.Modules -> scope.modules
    }

    private sealed interface WriteScope {
        data object Everything : WriteScope
        data class Modules(val modules: Set<Module>) : WriteScope
    }
}

/** The eight account types, with the wire text stored in `users.role`. */
enum class Role(override val wire: String) : WireEnum {
    Administrator("Administrator"),
    President("President"),
    Secretary("Secretary"),
    Treasurer("Treasurer"),
    Imam("Imam"),
    Staff("Staff"),
    Auditor("Auditor"),
    Member("Member"),
    ;

    companion object {
        /** Roles an administrator may create from the Users screen. */
        val assignable: List<Role> = listOf(
            Administrator, President, Secretary, Treasurer, Imam, Staff, Auditor, Member,
        )
    }
}
