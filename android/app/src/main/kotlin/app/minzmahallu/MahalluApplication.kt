package app.minzmahallu

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Application entry point.
 *
 * Deliberately thin: Hilt builds the graph lazily, and the database opens on
 * first access. The desktop app runs a schema-migration pass on boot; here
 * that work is owned by Room's callback in `:core:database`, so there is
 * nothing to do at process start.
 */
@HiltAndroidApp
class MahalluApplication : Application() {

    override fun onCreate() {
        // Before super, so a failure inside Hilt's own bootstrap is still
        // captured rather than vanishing with the process.
        CrashLog.install(this)
        super.onCreate()
    }
}
