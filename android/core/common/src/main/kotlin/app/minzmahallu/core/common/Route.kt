package app.minzmahallu.core.common

/**
 * The route table.
 *
 * One entry per screen, mirroring the desktop app's 22 routes one-for-one so a
 * user moving between the two builds sees the same information architecture.
 * Routes with an argument take it as a path segment (`family/{familyId}`) so
 * deep links and process-death restore both work without a bundle dance.
 */
enum class Route(val path: String) {
    /**
     * The desktop app serves the dashboard at `/`. Jetpack Navigation rejects an
     * empty route outright — `NavDestination.setRoute` throws
     * "Cannot have an empty route" — so the root is spelled `home` here. The
     * path is an internal navigation key, never shown to a user, and every
     * consumer reads it through `Route.Dashboard.path`.
     */
    Dashboard("home"),
    Families("families"),
    FamilyDetail("family/{familyId}"),
    Members("members"),
    MemberDetail("member/{memberId}"),
    Staff("staff"),
    Committee("committee"),
    Subscriptions("subscriptions"),
    Donations("donations"),
    WhatsApp("whatsapp"),
    Accounting("accounting"),
    Assets("assets"),
    Marriages("marriages"),
    Deaths("deaths"),
    Welfare("welfare"),
    Certificates("certificates"),
    Tokens("tokens"),
    TokenEvents("tokens/events"),
    Reports("reports"),
    Approvals("approvals"),
    Settings("settings"),
    Users("users"),
    Audit("audit"),
    Backup("backup"),
    ;

    companion object {
        fun familyDetail(familyId: Long) = "family/$familyId"
        fun memberDetail(memberId: Long) = "member/$memberId"
    }
}

/** Login and the first-run administrator setup sit outside the app shell. */
object AuthRoutes {
    const val LOGIN = "login"
    const val SETUP = "setup"
    const val UNINSTALL = "uninstall"
    const val LOCKED = "locked"
}
