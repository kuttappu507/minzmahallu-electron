package app.minzmahallu.whatsApp

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/** What the gateway needs in order to hand a message to WhatsApp. */
data class WhatsAppSend(
    val number: String,
    val message: String,
    val attachment: File? = null,
)

/** The outcome of an attempt to hand a message over. */
sealed interface SendResult {
    /** WhatsApp (or the chooser) is now in front of the operator. */
    data object Handed : SendResult

    /** No app on this device can take the message. */
    data class NoApp(val reason: String) : SendResult
}

/**
 * WhatsApp sending.
 *
 * This is the one place where the Android build genuinely cannot match the
 * desktop. The desktop drives Baileys — a WhatsApp Web client — so it can send
 * a receipt with nobody present and read delivery receipts back. Android offers
 * no equivalent: an app may compose an intent with a phone number, a body and
 * an attachment, and WhatsApp shows it to the operator, who presses send.
 *
 * So the gateway does the three things it *can* do reliably — normalise the
 * number to WhatsApp's `wa.me` form, attach the PDF through a FileProvider so
 * WhatsApp can read it without a storage permission, and report honestly when
 * no app is installed. The caller records the send from the operator's
 * confirmation, which is why `markReceiptSent` lives behind that step rather
 * than here.
 */
class WhatsAppGateway(private val context: Context) {

    private val personalPackage = "com.whatsapp"
    private val businessPackage = "com.whatsapp.w4b"

    /** True when either WhatsApp client is installed. */
    fun isAvailable(): Boolean = resolvePackage() != null

    private fun resolvePackage(): String? = listOf(personalPackage, businessPackage)
        .firstOrNull { candidate ->
            runCatching { context.packageManager.getPackageInfo(candidate, 0) }.isSuccess
        }

    /**
     * Hands the message over. The returned intent is started by the caller's
     * activity, because starting an activity from a service or a view model is
     * what gets an app background-launch restrictions on modern Android.
     */
    fun intentFor(send: WhatsAppSend): Intent? {
        val target = resolvePackage() ?: return null
        val digits = send.number.filter { it.isDigit() }

        return if (send.attachment != null) {
            // A document goes through ACTION_SEND, which is the only path that
            // carries both a body and a file.
            Intent(Intent.ACTION_SEND).apply {
                setPackage(target)
                type = "application/pdf"
                putExtra(Intent.EXTRA_TEXT, send.message)
                putExtra(
                    Intent.EXTRA_STREAM,
                    FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        send.attachment,
                    ),
                )
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            // A text-only message can go straight into the chat with the number
            // pre-filled, which is one tap fewer for the operator.
            Intent(Intent.ACTION_VIEW).apply {
                setPackage(target)
                data = Uri.parse("https://wa.me/$digits?text=${Uri.encode(send.message)}")
            }
        }
    }

    /** Convenience for callers that hold an activity context. */
    fun send(send: WhatsAppSend): SendResult {
        val intent = intentFor(send) ?: return SendResult.NoApp("WhatsApp is not installed")
        return try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            SendResult.Handed
        } catch (error: ActivityNotFoundException) {
            SendResult.NoApp(error.message ?: "WhatsApp could not be opened")
        }
    }

    /**
     * Opens a plain chat with a number, for the "message this family" action on
     * a member or family screen where there is no document to attach.
     */
    fun chatIntent(number: String, message: String = ""): Intent? {
        val target = resolvePackage() ?: return null
        val digits = number.filter { it.isDigit() }
        return Intent(Intent.ACTION_VIEW).apply {
            setPackage(target)
            data = Uri.parse("https://wa.me/$digits?text=${Uri.encode(message)}")
        }
    }
}
