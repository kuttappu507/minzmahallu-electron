package app.minzmahallu

import android.content.Context
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Last-resort crash reporting.
 *
 * The app has no analytics and no network error reporting, and a mahallu's
 * office phone is often somewhere with no adb access. Without this, a crash on
 * launch produces exactly one observable symptom — the app vanishes — and there
 * is nothing to diagnose from.
 *
 * So the very first thing the process does is install a handler that writes the
 * full stack trace to app-private storage, and [MainActivity] reads it back and
 * shows it on screen after a crash. The operator can then read out or
 * screenshot the actual exception.
 *
 * The handler re-throws to the previous default handler, so the system still
 * shows its own dialog and the process still dies: swallowing a crash to keep a
 * broken UI alive would be worse than the crash.
 */
object CrashLog {

    private const val FILE = "last-crash.txt"

    /** Installs the handler. Must be called before anything else can throw. */
    fun install(context: Context) {
        val file = file(context)
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                file.parentFile?.mkdirs()
                file.writeText(
                    buildString {
                        append("Process: ").append(context.packageName).append('\n')
                        append("Thread:  ").append(thread.name).append('\n')
                        append("Time:    ").append(java.time.Instant.now()).append('\n')
                        append('\n')
                        append(error.stackTraceToString())
                        // Causes are where the real reason usually is; the top
                        // frame of a wrapped exception often is not.
                        var cause = error.cause
                        var depth = 0
                        while (cause != null && depth < 8) {
                            append("\n--- caused by ---\n")
                            append(cause.stackTraceToString())
                            cause = cause.cause
                            depth++
                        }
                    },
                )
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** The last recorded crash, or null if the previous run ended cleanly. */
    fun read(context: Context): String? =
        runCatching { file(context).takeIf { it.exists() && it.length() > 0 }?.readText() }.getOrNull()

    /** Called once the operator has seen the report, so it does not keep showing. */
    fun clear(context: Context) {
        runCatching { file(context).delete() }
    }

    private fun file(context: Context) = File(context.filesDir, FILE)

    /** For tests and for the on-screen view: the first informative lines. */
    fun summary(trace: String, maxLines: Int = 12): String {
        val writer = StringWriter()
        PrintWriter(writer).use { it.print(trace) }
        return trace.lineSequence()
            .filter { it.isNotBlank() }
            .take(maxLines)
            .joinToString("\n")
    }
}
