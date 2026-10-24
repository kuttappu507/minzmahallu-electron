package app.minzmahallu.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Route table invariants.
 *
 * These exist because of a real launch crash: `Dashboard` was given an empty
 * path to mirror the desktop app's `/`, and Jetpack Navigation throws
 * `IllegalArgumentException: Cannot have an empty route` when the graph is
 * built. That is a runtime failure on the very first frame, so nothing short of
 * running the app would have caught it — but it is fully decidable at test time.
 */
class RouteTest {

    @Test
    fun `no route path is blank`() {
        // NavDestination.setRoute rejects an empty route, and a blank one would
        // never match a NavItem or a deep link either.
        val blank = Route.entries.filter { it.path.isBlank() }
        assertThat(blank).isEmpty()
    }

    @Test
    fun `route paths are unique`() {
        // Two entries sharing a path would make the second unreachable and the
        // drawer highlight the wrong module.
        val paths = Route.entries.map { it.path }
        assertThat(paths).containsNoDuplicates()
    }

    @Test
    fun `route paths have no leading or trailing slash`() {
        // Navigation treats a path as a single segment pattern; a stray slash
        // changes how arguments are parsed.
        Route.entries.forEach {
            assertThat(it.path).doesNotContain("//")
            assertThat(it.path.startsWith("/")).isFalse()
            assertThat(it.path.endsWith("/")).isFalse()
        }
    }

    @Test
    fun `parameterised routes expose a builder that fills the argument`() {
        assertThat(Route.familyDetail(42L)).isEqualTo("family/42")
        assertThat(Route.memberDetail(7L)).isEqualTo("member/7")

        // The builders must produce something the declared patterns match,
        // otherwise the detail screens are navigable to but never resolve.
        assertThat(Route.FamilyDetail.path).isEqualTo("family/{familyId}")
        assertThat(Route.MemberDetail.path).isEqualTo("member/{memberId}")
    }

    @Test
    fun `auth routes are distinct from every module route`() {
        val modulePaths = Route.entries.map { it.path }.toSet()
        listOf(AuthRoutes.LOGIN, AuthRoutes.SETUP, AuthRoutes.UNINSTALL, AuthRoutes.LOCKED)
            .forEach { auth ->
                assertThat(auth).isNotEmpty()
                assertThat(modulePaths).doesNotContain(auth)
            }
    }
}
