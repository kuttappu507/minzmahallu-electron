package app.minzmahallu.core.domain

/** A page of rows plus the total that satisfies the filter, as `useList` expects. */
data class PagedList<T>(
    val rows: List<T>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
) {
    val totalPages: Int get() = maxOf(1, (total + pageSize - 1) / pageSize)
    val isEmpty: Boolean get() = rows.isEmpty()

    companion object {
        fun <T> empty(page: Int = 1, pageSize: Int = 20) = PagedList(emptyList(), 0, page, pageSize)
    }
}

/** The outcome of a domain operation — either a value or a human-readable, localizable failure. */
sealed interface DomainResult<out T> {
    data class Success<T>(val value: T) : DomainResult<T>
    data class Failure(val reason: DomainError) : DomainResult<Nothing>
}

sealed interface DomainError {
    /** A stable key the UI maps onto a localized string. */
    val key: String

    /** Text supplied at throw time (e.g. the name of a conflicting record). */
    val detail: String? get() = null
}

data class SimpleError(override val key: String, override val detail: String? = null) : DomainError

/** Thrown by repositories for rule violations; caught at the ViewModel boundary. */
class DomainException(val error: DomainError) : Exception(error.key)

/** Known, stable failure keys — the UI maps each onto an en/ml string. */
object ErrorKeys {
    const val NOT_FOUND = "error_not_found"
    const val VALIDATION = "error_validation"
    const val DUPLICATE = "error_duplicate"
    const val RECEIPT_FROZEN = "error_receipt_frozen"
    const val AWAITING_APPROVAL = "error_awaiting_approval"
    const val ROLE_DENIED = "error_role_denied"
    const val ADMIN_PASSWORD = "error_admin_password"
    const val SINGLE_HEAD = "error_single_head"
    const val ONE_SUBSCRIPTION_PER_FAMILY = "error_one_subscription_per_family"
    const val EVENT_NOT_OVER = "error_event_not_over"
    const val REASON_REQUIRED = "error_reason_required"
    const val VOIDED = "error_voided"
    const val LOCKED = "error_locked"
    const val INACTIVE = "error_inactive"
    const val BAD_CREDENTIALS = "error_bad_credentials"
    const val PWD_POLICY = "error_pwd_policy"
    const val USERNAME_POLICY = "error_username_policy"
    const val SETUP_DONE = "error_setup_done"
    const val CATEGORY_IN_USE = "error_category_in_use"
    const val ASSET_MISSING = "error_asset_missing"
    const val DUPLICATE_SALARY = "error_duplicate_salary"
    const val TOKEN_NOT_FOUND = "error_token_not_found"
    const val CANCELLED_TOKEN = "error_cancelled_token"
}

inline fun <T> domainResult(block: () -> T): DomainResult<T> = try {
    DomainResult.Success(block())
} catch (e: DomainException) {
    DomainResult.Failure(e.error)
} catch (e: IllegalArgumentException) {
    DomainResult.Failure(SimpleError(ErrorKeys.VALIDATION, e.message))
}

fun fail(key: String, detail: String? = null): Nothing = throw DomainException(SimpleError(key, detail))
