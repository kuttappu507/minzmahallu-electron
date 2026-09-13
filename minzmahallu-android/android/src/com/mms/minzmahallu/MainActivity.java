package com.mms.minzmahallu;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * The Android shell around the Minz Mahallu web application.
 *
 * The application itself (every screen, the SQLite database, the security
 * layer) is the JavaScript bundle in {@code assets/public}. This activity
 * provides exactly the things a browser cannot:
 *
 *   · an origin the WebView trusts ({@value #APP_ORIGIN}) served straight out
 *     of the APK — a real https origin, which the app needs for WebCrypto,
 *     WebAssembly and fetch,
 *   · a JavaScript bridge ({@code window.mmsNative}) for app-private file
 *     storage, the share sheet, device identity and preferences
 *     (see {@link NativeBridge}),
 *   · the hardware back button and the foreground/background lifecycle, which
 *     the database uses to flush itself safely.
 *
 * It deliberately has no AndroidX / Gradle / Maven dependency: everything here
 * is part of the Android framework, so the APK can be built from a plain
 * command line (see {@code scripts/build-apk.mjs}).
 */
public class MainActivity extends Activity {

    /** The origin the WebView loads. Every request is answered from the APK. */
    public static final String APP_ORIGIN = "https://app.mms";

    private static final String TAG = "MMS";
    private static final String START_URL = APP_ORIGIN + "/index.html";

    private WebView webView;
    private NativeBridge bridge;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        // Brand chrome behind the status bar and the gesture bar.
        getWindow().setStatusBarColor(Color.parseColor("#0d9488"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b7c72"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);         // localStorage / sessionStorage
        settings.setDatabaseEnabled(false);          // SQLite runs in WebAssembly
        settings.setAllowFileAccess(false);          // the app never reads file://
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(true);               // pinch to enlarge a register
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);                   // keep the CSS pixel grid stable
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(false);  // everything is first-party
        }
        CookieManager.getInstance().setAcceptCookie(false);

        bridge = new NativeBridge(this);
        bridge.attach(webView);
        webView.addJavascriptInterface(bridge, "mmsNative");
        webView.setWebViewClient(new MmsWebViewClient());
        webView.setWebChromeClient(new MmsChromeClient());

        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        webView.loadUrl(START_URL);
        handleIntent(getIntent());
    }

    // ---------------------------------------------------------------- assets

    /**
     * Answers every {@code https://app.mms/…} request from the APK's asset
     * folder. Serving the bundle under an https origin (instead of file://)
     * is what makes the WebView a secure context: WebCrypto, WebAssembly
     * streaming compilation and fetch all work, and the app keeps a single,
     * stable origin for localStorage.
     */
    private final class MmsWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (!url.startsWith(APP_ORIGIN)) return null;
            String path = url.substring(APP_ORIGIN.length());
            if (path.isEmpty() || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return notFound();

            String asset = "public" + path;
            try {
                InputStream stream = getAssets().open(asset);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", path.startsWith("/assets/")
                        ? "public, max-age=31536000"   // content-hashed filenames
                        : "no-cache");
                headers.put("Access-Control-Allow-Origin", APP_ORIGIN);
                return new WebResourceResponse(mimeOf(path), null, 200, "OK", headers, stream);
            } catch (IOException missing) {
                Log.w(TAG, "asset not found: " + asset);
                return notFound();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            // The bundle is up: release events that arrived during a cold start
            // (a QR deep link, most often).
            bridge.pageFinished();
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(), null);
        }
    }

    private static String mimeOf(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".map")) return "application/json";
        if (lower.endsWith(".wasm")) return "application/wasm";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /**
     * WebView chrome: JavaScript dialogs, console logging. {@code alert()} is
     * used by the app's own error paths, so it must reach the user.
     */
    private final class MmsChromeClient extends WebChromeClient {
        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            bridge.showDialog(message, null, result, false);
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            bridge.showDialog(message, null, result, true);
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            Log.d(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
            return true;
        }
    }

    // ------------------------------------------------------------- lifecycle

    @Override
    public void onBackPressed() {
        // Let the single-page app handle the press first when it can: it closes
        // an open dialog/drawer, or asks to leave the app (which we minimise).
        bridge.emit("back", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        bridge.emit("resume", null);
    }

    @Override
    protected void onPause() {
        bridge.emit("pause", null);   // the database flushes on this event
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("mmsNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** {@code mms://verify/<code>} — a scanned QR code opening the app. */
    private void handleIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        String code = intent.getData().getLastPathSegment();
        if (code == null || code.isEmpty()) return;
        bridge.emit("deeplink", "{\"kind\":\"verify\",\"code\":\"" + code.replace("\"", "") + "\"}");
    }
}
