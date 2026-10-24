package app.minzmahallu.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PolicyTest {

    // ------------------------------------------------------------- passwords

    @Test
    fun `password needs 8 chars with upper lower digit and special`() {
        assertThat(PasswordPolicy.violation("Ab1!")).isEqualTo(PasswordViolation.TooShort)
        assertThat(PasswordPolicy.violation("abcdefgh1!")).isInstanceOf(PasswordViolation.NotComplex::class.java)
        assertThat(PasswordPolicy.violation("ABCDEFGH1!")).isInstanceOf(PasswordViolation.NotComplex::class.java)
        assertThat(PasswordPolicy.violation("Abcdefghij!")).isInstanceOf(PasswordViolation.NotComplex::class.java)
        assertThat(PasswordPolicy.violation("Abcdefghi1")).isInstanceOf(PasswordViolation.NotComplex::class.java)
        assertThat(PasswordPolicy.violation("Abcdefg1!")).isNull()
        assertThat(PasswordPolicy.isValid(null)).isFalse()
    }

    @Test
    fun `the violation reports exactly what is missing so the meter can show it`() {
        val v = PasswordPolicy.violation("abcdefgh") as PasswordViolation.NotComplex
        assertThat(v.needsUpper).isTrue()
        assertThat(v.needsDigit).isTrue()
        assertThat(v.needsSpecial).isTrue()
        assertThat(v.needsLower).isFalse()
    }

    @Test
    fun `strength climbs as the password gets better`() {
        val weak = PasswordPolicy.strength("ab1!")
        val strong = PasswordPolicy.strength("Sup3r-S3cret-Phrase!")
        assertThat(strong).isGreaterThan(weak)
        assertThat(strong).isAtMost(1f)
        assertThat(PasswordPolicy.strength("")).isEqualTo(0f)
    }

    @Test
    fun `username must be 3-32 chars of letters numbers dot underscore hyphen`() {
        assertThat(PasswordPolicy.usernameError("ab")).isEqualTo(UsernameViolation.Length)
        assertThat(PasswordPolicy.usernameError("a".repeat(33))).isEqualTo(UsernameViolation.Length)
        assertThat(PasswordPolicy.usernameError("bad name!")).isEqualTo(UsernameViolation.Characters)
        assertThat(PasswordPolicy.usernameError("admin.user_1-x")).isNull()
    }

    // ---------------------------------------------------------------- phones

    @Test
    fun `paste-safe phone clamping strips recognised prefixes first`() {
        assertThat(Phone.clamp10("+91 98470 12345")).isEqualTo("9847012345")
        assertThat(Phone.clamp10("098470 12345")).isEqualTo("9847012345")
        assertThat(Phone.clamp10("98470-12345")).isEqualTo("9847012345")
        // A number copied with an extra trailing digit is truncated, not shifted.
        assertThat(Phone.clamp10("98470123456")).isEqualTo("9847012345")
    }

    @Test
    fun `whatsapp numbers are normalised to the 91 form`() {
        assertThat(Phone.toWhatsApp("98470 12345")).isEqualTo("919847012345")
        assertThat(Phone.toWhatsApp("919847012345")).isEqualTo("919847012345")
        assertThat(Phone.toWhatsApp("")).isEmpty()
    }

    @Test
    fun `phone pretty-prints in the Indian 5+5 grouping`() {
        assertThat(Phone.pretty10("9847012345")).isEqualTo("98470 12345")
    }

    // ---------------------------------------------------------------- money

    @Test
    fun `amounts reject negatives zero and absurd magnitudes`() {
        assertThat(Money.error("-500")).isEqualTo(AmountViolation.Invalid)
        assertThat(Money.error("0")).isEqualTo(AmountViolation.Invalid)
        assertThat(Money.error("abc")).isEqualTo(AmountViolation.Invalid)
        assertThat(Money.error("100000000")).isEqualTo(AmountViolation.TooLarge)
        assertThat(Money.error("500")).isNull()
    }

    @Test
    fun `a volunteer salary may be zero but never negative`() {
        assertThat(Money.nonNegativeError("0")).isNull()
        assertThat(Money.nonNegativeError("-1")).isEqualTo(AmountViolation.Negative)
    }

    @Test
    fun `round2 keeps the ledger honest`() {
        assertThat(Money.round2(10.005)).isWithin(1e-9).of(10.01)
        assertThat(Money.round2(2.675)).isWithin(1e-9).of(2.68)
        assertThat(Money.sameAmount(100.0, 100.001)).isTrue()
        assertThat(Money.sameAmount(100.0, 100.5)).isFalse()
    }

    // ------------------------------------------------------- indian grouping

    @Test
    fun `amounts group by lakh and crore not by thousand`() {
        assertThat(IndianGrouping.format(1234567L)).isEqualTo("12,34,567")
        assertThat(IndianGrouping.format(100000L)).isEqualTo("1,00,000")
        assertThat(IndianGrouping.format(99999L)).isEqualTo("99,999")
        assertThat(IndianGrouping.format(1000L)).isEqualTo("1,000")
        assertThat(IndianGrouping.format(999L)).isEqualTo("999")
        assertThat(IndianGrouping.format(-1234567L)).isEqualTo("-12,34,567")
        assertThat(IndianGrouping.formatAmount(1234567.75)).isEqualTo("12,34,568")
    }

    // ----------------------------------------------------------------- codes

    @Test
    fun `verification codes are unambiguous and grouped`() {
        val code = Codes.verificationCode()
        assertThat(code).matches(Regex("^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$"))
        assertThat(code).doesNotContain("0")
        assertThat(code).doesNotContain("1")
        // Random, not constant.
        assertThat(Codes.verificationCode()).isNotEqualTo(Codes.verificationCode())
    }

    @Test
    fun `token codes come from the same ambiguity-free alphabet`() {
        assertThat(Codes.tokenCode()).matches(Regex("^[A-Z2-9]{4}$"))
    }
}
