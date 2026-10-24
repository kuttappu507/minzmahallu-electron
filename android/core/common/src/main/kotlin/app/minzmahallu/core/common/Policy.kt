package app.minzmahallu.core.common

import java.security.SecureRandom

/**
 * Password policy — the exact rule the Electron app enforces in
 * `auth.service.ts` / `security-ipc.ts`: 8+ characters with an uppercase
 * letter, a lowercase letter, a digit and a special character. Enforced at
 * account creation and on every password change.
 */
object PasswordPolicy {

    const val MIN_LENGTH = 8

    /** Failed attempts before the account is locked, and for how long. */
    const val MAX_FAILED_ATTEMPTS = 5
    const val LOCK_MINUTES = 15

    fun violation(password: String?): PasswordViolation? {
        val pwd = password.orEmpty()
        if (pwd.length < MIN_LENGTH) return PasswordViolation.TooShort
        val hasUpper = pwd.any { it.isUpperCase() }
        val hasLower = pwd.any { it.isLowerCase() }
        val hasDigit = pwd.any { it.isDigit() }
        val hasSpecial = pwd.any { !it.isLetterOrDigit() }
        return if (hasUpper && hasLower && hasDigit && hasSpecial) {
            null
        } else {
            PasswordViolation.NotComplex(
                needsUpper = !hasUpper,
                needsLower = !hasLower,
                needsDigit = !hasDigit,
                needsSpecial = !hasSpecial,
            )
        }
    }

    fun isValid(password: String?): Boolean = violation(password) == null

    /** Username rule: 3–32 chars, letters/numbers/dot/underscore/hyphen. */
    fun usernameError(username: String?): UsernameViolation? {
        val raw = username?.trim().orEmpty()
        return when {
            raw.length < 3 || raw.length > 32 -> UsernameViolation.Length
            !raw.matches(USERNAME_PATTERN) -> UsernameViolation.Characters
            else -> null
        }
    }

    private val USERNAME_PATTERN = Regex("^[A-Za-z0-9._-]{3,32}$")

    /** 0.0–1.0 strength used to drive the animated strength meter. */
    fun strength(password: String?): Float {
        val pwd = password.orEmpty()
        if (pwd.isEmpty()) return 0f
        var score = 0
        if (pwd.length >= MIN_LENGTH) score++
        if (pwd.length >= 12) score++
        if (pwd.any { it.isUpperCase() } && pwd.any { it.isLowerCase() }) score++
        if (pwd.any { it.isDigit() }) score++
        if (pwd.any { !it.isLetterOrDigit() }) score++
        if (pwd.length >= 16) score++
        return (score / 6f).coerceIn(0f, 1f)
    }
}

sealed interface PasswordViolation {
    data object TooShort : PasswordViolation
    data class NotComplex(
        val needsUpper: Boolean,
        val needsLower: Boolean,
        val needsDigit: Boolean,
        val needsSpecial: Boolean,
    ) : PasswordViolation
}

sealed interface UsernameViolation {
    data object Length : UsernameViolation
    data object Characters : UsernameViolation
}

/**
 * Paste-safe phone clamping for Indian 10-digit mobile numbers — a port of
 * `src/lib/phone.ts`.
 *
 * Stripping non-digits alone silently corrupts a number pasted from contacts
 * ("+91 98470 12345" → "9198470123", the prefix eating the tail), so the
 * recognised prefixes are removed *first*.
 */
object Phone {

    fun clamp10(value: String?): String {
        var digits = value.orEmpty().filter { it.isDigit() }
        if (digits.length > 10) {
            digits = when {
                digits.startsWith("91") && digits.length - 2 >= 10 -> digits.substring(2)
                digits.startsWith("0") -> digits.trimStart('0')
                else -> digits
            }
        }
        return digits.take(10)
    }

    /** Normalise to the WhatsApp form used by the desktop app: `91XXXXXXXXXX`. */
    fun toWhatsApp(value: String?): String {
        val digits = value.orEmpty().filter { it.isDigit() }
        if (digits.isEmpty()) return ""
        return if (digits.length == 10) "91$digits" else digits
    }

    fun isComplete10(value: String?): Boolean = clamp10(value).length == 10

    /** `9847012345` → `98470 12345` for display. */
    fun pretty10(value: String?): String {
        val d = clamp10(value)
        return if (d.length == 10) "${d.substring(0, 5)} ${d.substring(5)}" else d
    }
}

/**
 * Amount validation shared by every module that stores money — a port of
 * `src/lib/amount.ts`. No legitimate mahallu transaction exceeds the ceiling,
 * and keeping it bounded keeps Indian-locale grouping and printed layouts sane.
 */
object Money {

    const val MAX_AMOUNT = 99_999_999.0

    /** Returns null when usable, otherwise the failure reason. */
    fun error(raw: String?): AmountViolation? {
        val n = raw?.trim()?.toDoubleOrNull() ?: return AmountViolation.Invalid
        if (!n.isFinite() || n <= 0) return AmountViolation.Invalid
        if (n > MAX_AMOUNT) return AmountViolation.TooLarge
        return null
    }

    /** Variant for fields where 0 is legitimate (e.g. a volunteer's salary). */
    fun nonNegativeError(raw: String?): AmountViolation? {
        val n = raw?.trim()?.toDoubleOrNull() ?: return AmountViolation.Invalid
        if (!n.isFinite() || n < 0) return AmountViolation.Negative
        if (n > MAX_AMOUNT) return AmountViolation.TooLarge
        return null
    }

    /** Round to 2 decimals the way the ledger does (half-up on the magnitude). */
    fun round2(value: Double): Double =
        Math.round(value * 100.0) / 100.0

    /** Two amounts are the same money when they differ by less than a paisa. */
    fun sameAmount(a: Double, b: Double, epsilon: Double = 0.004): Boolean =
        Math.abs(a - b) <= epsilon

    fun parse(raw: String?): Double = raw?.trim()?.toDoubleOrNull() ?: 0.0
}

sealed interface AmountViolation {
    data object Invalid : AmountViolation
    data object Negative : AmountViolation
    data object TooLarge : AmountViolation
}

/**
 * Indian (lakh/crore) grouping — `1234567` → `12,34,567`. Comma-separated
 * thousands are wrong for Indian readers and the desktop app formats with
 * `toLocaleString("en-IN")`, so the grouping is reproduced here rather than
 * leaning on the device locale (which may be anything).
 */
object IndianGrouping {

    fun format(value: Long): String {
        if (value < 0) return "-${format(-value)}"
        val s = value.toString()
        if (s.length <= 3) return s
        val last3 = s.takeLast(3)
        val head = s.dropLast(3)
        val grouped = StringBuilder()
        var i = head.length
        while (i > 0) {
            val start = (i - 2).coerceAtLeast(0)
            if (grouped.isNotEmpty()) grouped.insert(0, ',')
            grouped.insert(0, head.substring(start, i))
            i = start
        }
        return "$grouped,$last3"
    }

    /** Whole-rupee formatting: the paisa is dropped, as on the desktop. */
    fun formatAmount(value: Double): String =
        format(Math.round(value))
}

/**
 * Ambiguity-free random codes — a port of `electron/services/codes.ts`.
 * The alphabet drops 0/O and 1/I/L because these codes are read aloud over the
 * phone and typed back by hand.
 */
object Codes {

    const val ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

    private val random = SecureRandom()

    /** Certificate verification code: `K7QM-4XDP-9RTH`. */
    fun verificationCode(groups: Int = 3, groupLen: Int = 4): String =
        (1..groups).joinToString("-") { randomToken(groupLen) }

    /** Token code presented at event entry: 4 unguessable characters. */
    fun tokenCode(length: Int = 4): String = randomToken(length)

    private fun randomToken(length: Int): String =
        (1..length).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString("")
}
