package app.minzmahallu.core.common

import app.minzmahallu.core.common.RoleAccess.Module
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The matrix below is the same table as `ROLE_WRITE_ACCESS` in
 * `electron/services/roleAccess.ts`. If either side changes, this test and the
 * TypeScript role suite must change together.
 */
class RoleAccessTest {

    @Test
    fun `administrator and secretary have full power`() {
        assertThat(RoleAccess.isFullPower(Role.Administrator)).isTrue()
        assertThat(RoleAccess.isFullPower(Role.Secretary)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Administrator, Module.Users)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Secretary, Module.Backup)).isTrue()
        assertThat(Module.entries.all { RoleAccess.canWrite(Role.Secretary, it) }).isTrue()
    }

    @Test
    fun `president updates the people-side records only`() {
        assertThat(RoleAccess.canWrite(Role.President, Module.Members)).isTrue()
        assertThat(RoleAccess.canWrite(Role.President, Module.Families)).isTrue()
        assertThat(RoleAccess.canWrite(Role.President, Module.Committee)).isTrue()
        assertThat(RoleAccess.canWrite(Role.President, Module.Accounting)).isFalse()
        assertThat(RoleAccess.canWrite(Role.President, Module.Donations)).isFalse()
    }

    @Test
    fun `treasurer handles the money and nothing else`() {
        val money = setOf(
            Module.Donations, Module.Subscriptions, Module.Accounting,
            Module.Assets, Module.Welfare, Module.Staff,
        )
        assertThat(money.all { RoleAccess.canWrite(Role.Treasurer, it) }).isTrue()
        assertThat(RoleAccess.canWrite(Role.Treasurer, Module.Marriages)).isFalse()
        assertThat(RoleAccess.canWrite(Role.Treasurer, Module.Users)).isFalse()
    }

    @Test
    fun `imam keeps the religious registers`() {
        assertThat(RoleAccess.canWrite(Role.Imam, Module.Marriages)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Imam, Module.Deaths)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Imam, Module.Certificates)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Imam, Module.Subscriptions)).isFalse()
    }

    @Test
    fun `auditor changes nothing`() {
        assertThat(Module.entries.none { RoleAccess.canWrite(Role.Auditor, it) }).isTrue()
        assertThat(RoleAccess.writableModules(Role.Auditor)).isEmpty()
    }

    @Test
    fun `member and staff entries wait for approval`() {
        assertThat(RoleAccess.createsPending(Role.Member)).isTrue()
        assertThat(RoleAccess.createsPending(Role.Staff)).isTrue()
        assertThat(RoleAccess.createsPending(Role.Administrator)).isFalse()
        assertThat(RoleAccess.createsPending(Role.Secretary)).isFalse()
        assertThat(RoleAccess.createsPending(Role.Treasurer)).isFalse()
    }

    @Test
    fun `a member may hand in money but not registers`() {
        assertThat(RoleAccess.canWrite(Role.Member, Module.Donations)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Member, Module.Subscriptions)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Member, Module.Families)).isFalse()
        assertThat(RoleAccess.canWrite(Role.Member, Module.Tokens)).isFalse()
    }

    @Test
    fun `only full-power roles see the approvals queue`() {
        assertThat(RoleAccess.canApprove(Role.Administrator)).isTrue()
        assertThat(RoleAccess.canApprove(Role.Secretary)).isTrue()
        assertThat(RoleAccess.canApprove(Role.Staff)).isFalse()
        assertThat(RoleAccess.canApprove(Role.Member)).isFalse()
        assertThat(RoleAccess.canApprove(null)).isFalse()
    }

    @Test
    fun `staff may enter people and tokens but their money is parked`() {
        assertThat(RoleAccess.canWrite(Role.Staff, Module.Tokens)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Staff, Module.Deaths)).isTrue()
        assertThat(RoleAccess.canWrite(Role.Staff, Module.Accounting)).isFalse()
        assertThat(RoleAccess.canWrite(Role.Staff, Module.Welfare)).isFalse()
    }
}
