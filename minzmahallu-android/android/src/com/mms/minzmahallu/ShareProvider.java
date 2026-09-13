package com.mms.minzmahallu;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Serves the app's generated files (PDF receipts and certificates, .mmbak
 * backups, spreadsheet exports) to other apps.
 *
 * Android 7 and newer refuse to hand a {@code file://} URI to another app, so
 * a shared file must come from a content provider. This is the standard
 * framework class — deliberately not AndroidX's FileProvider — which keeps the
 * build free of any external dependency.
 *
 * The provider is not exported: a receiving app only gets access to the exact
 * URI it was granted through the share sheet.
 */
public class ShareProvider extends ContentProvider {

    public static final String AUTHORITY = "com.mms.minzmahallu.files";

    public static Uri uriFor(Context context, File file) {
        String base;
        String prefix;
        if (isInside(context.getCacheDir(), file)) {
            base = context.getCacheDir().getAbsolutePath();
            prefix = "cache";
        } else {
            base = context.getFilesDir().getAbsolutePath();
            prefix = "files";
        }
        String relative = file.getAbsolutePath();
        if (relative.startsWith(base)) relative = relative.substring(base.length());
        while (relative.startsWith("/")) relative = relative.substring(1);
        return Uri.parse("content://" + AUTHORITY + "/" + prefix + "/" + Uri.encode(relative, "/"));
    }

    private static boolean isInside(File directory, File file) {
        try {
            return file.getCanonicalPath().startsWith(directory.getCanonicalPath());
        } catch (Exception failure) {
            return false;
        }
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String path = uri.getPath();
        if (path == null) throw new FileNotFoundException("No path in " + uri);
        while (path.startsWith("/")) path = path.substring(1);
        int slash = path.indexOf('/');
        if (slash < 0) throw new FileNotFoundException("No file in " + uri);
        String prefix = path.substring(0, slash);
        String relative = path.substring(slash + 1);
        if (relative.isEmpty() || relative.contains("..")) throw new FileNotFoundException("Invalid path " + uri);

        Context context = getContext();
        if (context == null) throw new FileNotFoundException("No context");
        File base = "cache".equals(prefix) ? context.getCacheDir() : context.getFilesDir();
        File file = new File(base, relative);
        if (!file.exists()) throw new FileNotFoundException(file.getAbsolutePath());
        return file;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return "application/octet-stream";
        int dot = name.lastIndexOf('.');
        String extension = dot < 0 ? "" : name.substring(dot + 1).toLowerCase();
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return mime == null ? "application/octet-stream" : mime;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        MatrixCursor cursor = new MatrixCursor(new String[]{
                OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        try {
            File file = fileFor(uri);
            cursor.addRow(new Object[]{file.getName(), Long.valueOf(file.length())});
        } catch (FileNotFoundException missing) {
            // an empty cursor is a valid answer for a file that is gone
        }
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only provider");
    }
}
