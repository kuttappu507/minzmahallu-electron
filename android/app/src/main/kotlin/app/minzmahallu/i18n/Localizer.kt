package app.minzmahallu.i18n

/**
 * Process-wide language holder, so code outside composition can localize.
 *
 * Repositories throw `DomainException(SimpleError(key))`, whose `message` is the
 * bare key — `error_bad_credentials`. ViewModels caught that and stored
 * `error.message` straight into their UI state, so the login screen displayed
 * the key itself. That is the "unusual text" a wrong password produced.
 *
 * The fix belongs at the point the message enters UI state rather than at the
 * 19 places that display it, because a ViewModel has no `LocalStrings`. This
 * object is written whenever the session language changes and read by
 * [localizedError].
 *
 * It is a deliberate, contained piece of global state: the alternative is
 * injecting a language source into all twenty-odd view models to translate one
 * string each.
 */
object Localizer {

    @Volatile
    var language: Language = Language.English
        private set

    fun update(language: Language) {
        this.language = language
    }

    /**
     * Resolves a caught failure to operator-readable text.
     *
     * Unknown keys still degrade to the key itself rather than throwing, so a
     * rule added to a repository without a translation can never crash a screen
     * — it just reads badly until the table catches up.
     */
    fun error(throwable: Throwable): String =
        stringsFor(language).error(throwable.message.orEmpty())
}

/** Convenience for the common `runCatching { ... }.onFailure` shape. */
fun localizedError(throwable: Throwable): String = Localizer.error(throwable)
