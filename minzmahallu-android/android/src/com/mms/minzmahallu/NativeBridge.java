package com.mms.minzmahallu;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * {@code window.mmsNative} — the whole native surface the web application gets.
 *
 * One synchronous entry point, {@link #call}, taking a method name and a JSON
 * payload and returning JSON. Keeping it to a single method means adding a
 * capability never changes the Java/JS contract, and it keeps the attack
 * surface small: only pages served from the app's own origin can call it.
 *
 * Logical paths used by the application map onto app-private storage:
 * <pre>
 *   data/mms.db        → filesDir/data/mms.db          (the SQLite image)
 *   docs/*.mmbak       → filesDir/docs/*.mmbak         (verified backups)
 *   cache/…            → cacheDir/…                    (share-sheet scratch)
 * </pre>
 * Nothing here ever touches shared/external storage, so the app needs no
 * storage permission at all.
 */
public class NativeBridge {

    private static final String TAG = "MMS";
    private static final String PREFS = "mms-native";
    private static final String INSTALL_ID = "install-id";

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private boolean pageReady = false;
    private final List<String> pendingEvents = new ArrayList<String>();

    NativeBridge(Activity activity) {
        this.activity = activity;
    }

    void attach(WebView view) {
        this.webView = view;
    }

    // ------------------------------------------------------------ JS entry

    @JavascriptInterface
    public String call(String method, String payload) {
        try {
            JSONObject in = new JSONObject(payload == null || payload.isEmpty() ? "{}" : payload);
            Object value = dispatch(method, in);
            JSONObject out = new JSONObject();
            out.put("ok", true);
            if (value != null) out.put("value", value);
            return out.toString();
        } catch (Throwable failure) {
            Log.w(TAG, method + " failed: " + failure);
            try {
                JSONObject out = new JSONObject();
                out.put("ok", false);
                out.put("error", failure.getMessage() == null ? failure.toString() : failure.getMessage());
                return out.toString();
            } catch (JSONException impossible) {
                return "{\"ok\":false,\"error\":\"bridge failure\"}";
            }
        }
    }

    private Object dispatch(String method, JSONObject in) throws Exception {
        if ("files.read".equals(method)) {
            byte[] bytes = readBytes(require(in, "path"));
            return bytes == null ? JSONObject.NULL : Base64.encodeToString(bytes, Base64.NO_WRAP);
        }
        if ("files.write".equals(method)) {
            writeBytes(require(in, "path"), Base64.decode(require(in, "base64"), Base64.DEFAULT));
            return "written";
        }
        if ("files.readText".equals(method)) {
            byte[] bytes = readBytes(require(in, "path"));
            return bytes == null ? JSONObject.NULL : new String(bytes, "UTF-8");
        }
        if ("files.writeText".equals(method)) {
            writeBytes(require(in, "path"), require(in, "text").getBytes("UTF-8"));
            return "written";
        }
        if ("files.exists".equals(method)) {
            return Boolean.valueOf(resolve(require(in, "path")).exists());
        }
        if ("files.remove".equals(method)) {
            delete(resolve(require(in, "path")));
            return "removed";
        }
        if ("files.list".equals(method)) {
            return listFolder(require(in, "folder"));
        }
        if ("files.uri".equals(method)) {
            File file = resolve(require(in, "path"));
            return file.exists() ? ShareProvider.uriFor(activity, file) : JSONObject.NULL;
        }
        if ("share.file".equals(method)) {
            return shareFile(in);
        }
        if ("share.openUrl".equals(method)) {
            openUrl(require(in, "url"));
            return "opened";
        }
        if ("device.identityParts".equals(method)) {
            return identityParts();
        }
        if ("device.info".equals(method)) {
            return deviceInfo();
        }
        if ("prefs.get".equals(method)) {
            String value = prefs().getString(require(in, "key"), null);
            return value == null ? JSONObject.NULL : value;
        }
        if ("prefs.set".equals(method)) {
            prefs().edit().putString(require(in, "key"), require(in, "value")).apply();
            return "set";
        }
        if ("prefs.remove".equals(method)) {
            prefs().edit().remove(require(in, "key")).apply();
            return "removed";
        }
        if ("ui.statusBar".equals(method)) {
            setStatusBar(require(in, "hex"));
            return "ok";
        }
        if ("ui.alert".equals(method)) {
            showAlert(in.optString("message", ""), in.optString("title", null));
            return "ok";
        }
        if ("app.minimize".equals(method)) {
            main.post(new Runnable() {
                public void run() {
                    activity.moveTaskToBack(true);
                }
            });
            return "minimized";
        }
        if ("app.ready".equals(method)) {
            // The page installed its event listener: deliver anything queued.
            finishPending();
            return "ready";
        }
        if ("app.info".equals(method)) {
            return deviceInfo();
        }
        if ("app.exit".equals(method)) {
            main.post(new Runnable() {
                public void run() {
                    activity.finish();
                }
            });
            return "exiting";
        }
        throw new IllegalArgumentException("Unknown method: " + method);
    }

    private static String require(JSONObject in, String key) {
        String value = in.optString(key, null);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("Missing " + key);
        return value;
    }

    // --------------------------------------------------------------- files

    /**
     * Logical path → real file. Only app-private directories are reachable:
     * {@code cache/…} lives in the cache dir (the OS may reclaim it), anything
     * else in the app's private files dir, which survives updates and is part
     * of Android's own backup of the app.
     */
    static File resolveLogical(Context context, String logical) {
        String clean = logical.replace('\\', '/');
        while (clean.startsWith("/")) clean = clean.substring(1);
        if (clean.contains("..")) throw new IllegalArgumentException("Invalid path: " + logical);
        if (clean.startsWith("cache/")) {
            return new File(context.getCacheDir(), clean.substring("cache/".length()));
        }
        if (clean.startsWith("docs/")) {
            return new File(context.getFilesDir(), clean);
        }
        return new File(context.getFilesDir(), clean);
    }

    private File resolve(String logical) {
        return resolveLogical(activity, logical);
    }

    private byte[] readBytes(String logical) throws IOException {
        File file = resolve(logical);
        if (!file.exists()) return null;
        InputStream in = new FileInputStream(file);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.max(1024, file.length()));
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    /** Atomic write: the database image must never be half-written. */
    private void writeBytes(String logical, byte[] data) throws IOException {
        File file = resolve(logical);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Cannot create " + parent);
        }
        File temp = new File(file.getAbsolutePath() + ".tmp");
        OutputStream out = new FileOutputStream(temp);
        try {
            out.write(data);
            out.flush();
            if (out instanceof FileOutputStream) ((FileOutputStream) out).getFD().sync();
        } finally {
            out.close();
        }
        if (file.exists() && !file.delete()) Log.w(TAG, "could not replace " + file);
        if (!temp.renameTo(file)) throw new IOException("Cannot write " + file);
    }

    private void delete(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) delete(child);
        }
        if (file.exists() && !file.delete()) Log.w(TAG, "could not delete " + file);
    }

    private JSONArray listFolder(String folder) {
        File dir = resolve(folder);
        JSONArray rows = new JSONArray();
        File[] files = dir.listFiles();
        if (files == null) return rows;
        Arrays.sort(files, new Comparator<File>() {
            public int compare(File a, File b) {
                return Long.compare(b.lastModified(), a.lastModified());
            }
        });
        for (File file : files) {
            if (!file.isFile() || file.getName().endsWith(".tmp")) continue;
            JSONObject row = new JSONObject();
            try {
                row.put("name", file.getName());
                row.put("size", file.length());
                row.put("mtime", file.lastModified());
            } catch (JSONException ignored) {
                continue;
            }
            rows.put(row);
        }
        return rows;
    }

    // --------------------------------------------------------------- share

    /** Writes the file into the cache and hands it to the Android share sheet. */
    private Object shareFile(JSONObject in) throws Exception {
        String name = require(in, "name").replaceAll("[\\\\/:*?\"<>|]", "_");
        String mime = in.optString("mime", "application/octet-stream");
        byte[] data = Base64.decode(require(in, "base64"), Base64.DEFAULT);
        String title = in.optString("title", name);
        String text = in.optString("text", null);

        File dir = new File(activity.getCacheDir(), "mms-share");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Cannot create share folder");
        File file = new File(dir, name);
        OutputStream out = new FileOutputStream(file);
        try {
            out.write(data);
        } finally {
            out.close();
        }

        final Uri uri = ShareProvider.uriFor(activity, file);
        final Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (title != null) send.putExtra(Intent.EXTRA_SUBJECT, title);
        if (text != null) send.putExtra(Intent.EXTRA_TEXT, text);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        final Intent chooser = Intent.createChooser(send, activity.getString(R.string.share_pick));
        main.post(new Runnable() {
            public void run() {
                try {
                    activity.startActivity(chooser);
                } catch (Exception failure) {
                    Log.w(TAG, "share sheet failed: " + failure);
                }
            }
        });

        JSONObject result = new JSONObject();
        result.put("saved", true);
        result.put("path", uri.toString());
        return result;
    }

    private void openUrl(String url) {
        final Intent intent;
        if (url.startsWith("http://") || url.startsWith("https://")) {
            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        } else {
            // whatsapp://, tel:, mailto:, sms: … all open in their own app.
            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        main.post(new Runnable() {
            public void run() {
                try {
                    activity.startActivity(intent);
                } catch (Exception failure) {
                    Log.w(TAG, "cannot open " + url + ": " + failure);
                }
            }
        });
    }

    // -------------------------------------------------------------- device

    private JSONArray identityParts() {
        JSONArray parts = new JSONArray();
        parts.put("model:" + Build.MODEL);
        parts.put("manufacturer:" + Build.MANUFACTURER);
        parts.put("device:" + Build.DEVICE);
        parts.put("os:" + Build.VERSION.RELEASE + "(" + Build.VERSION.SDK_INT + ")");
        parts.put("fingerprint:" + Build.FINGERPRINT);
        String androidId = Settings.Secure.getString(activity.getContentResolver(), Settings.Secure.ANDROID_ID);
        parts.put("android-id:" + (androidId == null ? "" : androidId));
        parts.put("app:" + activity.getPackageName() + "@" + versionName());
        parts.put("install:" + installId());
        return parts;
    }

    private JSONObject deviceInfo() throws JSONException {
        JSONObject info = new JSONObject();
        info.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        info.put("platform", "android");
        info.put("osVersion", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        info.put("appVersion", versionName());
        info.put("appId", activity.getPackageName());
        return info;
    }

    private String versionName() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return info.versionName == null ? "1.0" : info.versionName;
        } catch (Exception failure) {
            return "1.0";
        }
    }

    /** Random per-install id: a stable component even on devices that report
     *  nothing else (and it changes on reinstall, which is the intent). */
    private String installId() {
        String existing = prefs().getString(INSTALL_ID, null);
        if (existing != null) return existing;
        byte[] random = new byte[8];
        new SecureRandom().nextBytes(random);
        StringBuilder hex = new StringBuilder();
        for (byte value : random) hex.append(String.format("%02x", value));
        String generated = hex.toString();
        prefs().edit().putString(INSTALL_ID, generated).apply();
        return generated;
    }

    // ----------------------------------------------------------- ui / prefs

    private void setStatusBar(String hex) {
        int color;
        try {
            color = Color.parseColor(hex);
        } catch (IllegalArgumentException bad) {
            return;
        }
        // Dark icons suit the app's light chrome.
        final int parsed = color;
        main.post(new Runnable() {
            public void run() {
                activity.getWindow().setStatusBarColor(parsed);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    activity.getWindow().getDecorView().setSystemUiVisibility(
                            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                }
            }
        });
    }

    private void showAlert(final String message, final String title) {
        main.post(new Runnable() {
            public void run() {
                new AlertDialog.Builder(activity)
                        .setTitle(title == null || title.isEmpty() ? activity.getString(R.string.app_name) : title)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, null)
                        .show();
            }
        });
    }

    /** Used by the WebChromeClient for {@code alert()} / {@code confirm()}. */
    void showDialog(final String message, final String title, final JsResult result, final boolean confirm) {
        main.post(new Runnable() {
            public void run() {
                AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                        .setTitle(title == null || title.isEmpty() ? activity.getString(R.string.app_name) : title)
                        .setMessage(message)
                        .setCancelable(false)
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        });
                if (confirm) {
                    builder.setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface dialog, int which) {
                            result.confirm();
                        }
                    });
                    builder.setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface dialog, int which) {
                            result.cancel();
                        }
                    });
                } else {
                    builder.setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface dialog, int which) {
                            result.confirm();
                        }
                    });
                }
                builder.show();
            }
        });
    }

    private SharedPreferences prefs() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // --------------------------------------------------------------- events

    /**
     * Native → JS events: {@code ready}, {@code back}, {@code resume},
     * {@code pause} and {@code deeplink}. Events fired before the page is up
     * (a cold start from a QR scan, most often) are queued and delivered when
     * the page reports itself ready.
     */
    void emit(String name, String payloadJson) {
        JSONObject event = new JSONObject();
        try {
            event.put("name", name);
            event.put("payload", payloadJson == null ? JSONObject.NULL : new JSONObject(payloadJson));
        } catch (JSONException bad) {
            return;
        }
        final String script = "window.__mmsNativeEvent && window.__mmsNativeEvent(" + event + ")";
        main.post(new Runnable() {
            public void run() {
                WebView view = webView;
                if (view == null) return;
                if (!pageReady && !"ready".equals(name)) {
                    pendingEvents.add(script);
                    return;
                }
                view.evaluateJavascript(script, null);
            }
        });
    }

    /** Called from the WebViewClient once the bundle has loaded. */
    void pageFinished() {
        pageReady = true;
        finishPending();
    }

    /** The page tells us it has installed its event listener. */
    void finishPending() {
        main.post(new Runnable() {
            public void run() {
                WebView view = webView;
                if (view == null) return;
                for (String script : pendingEvents) view.evaluateJavascript(script, null);
                pendingEvents.clear();
            }
        });
    }
}
