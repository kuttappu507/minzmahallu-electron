package app.minzmahallu.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import app.minzmahallu.print.PdfRenderer
import app.minzmahallu.whatsApp.WhatsAppGateway
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

/**
 * The application graph.
 *
 * Room's module lives in `:core:database`, and every repository in
 * `:core:domain` carries its own `@Inject constructor`, so Hilt builds those
 * without help. What is declared here is only the three things that need an
 * Android context or a real system service behind them.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    /** Per-device UI preferences — theme, language, motion, idle timeout. */
    @Provides
    @Singleton
    fun provideDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(
            scope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
            produceFile = { context.preferencesDataStoreFile("minzmahallu") },
        )

    /**
     * Receipts, certificates, collection sheets, the audit pack. The desktop
     * renders HTML templates through Chromium's print-to-PDF; the phone draws
     * the same layouts onto `android.graphics.pdf.PdfDocument` directly, which
     * keeps the output identical without shipping a WebView.
     */
    @Provides
    @Singleton
    fun providePdfRenderer(@ApplicationContext context: Context): PdfRenderer =
        PdfRenderer(context)

    /**
     * WhatsApp sending. The desktop drives Baileys (a WhatsApp Web client) and
     * can send unattended; Android has no such API, so this hands the composed
     * message and its PDF to the installed WhatsApp through an intent and
     * records the send from the operator's confirmation.
     */
    @Provides
    @Singleton
    fun provideWhatsAppGateway(@ApplicationContext context: Context): WhatsAppGateway =
        WhatsAppGateway(context)
}
