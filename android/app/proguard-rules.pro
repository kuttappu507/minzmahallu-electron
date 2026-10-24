# Minz Mahallu — R8 rules for the release build.
#
# The app is minified (isMinifyEnabled = true), so anything reached only by
# reflection, serialisation or a resource name has to be kept here or R8 will
# quietly strip it and the failure shows up at runtime on somebody's phone
# instead of at build time.

# ---------------------------------------------------------------------------
# Kotlin metadata / coroutines / serialisation
# ---------------------------------------------------------------------------
-dontwarn kotlin.**
-keepclassmembers class kotlin.Metadata { *; }
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions

# kotlinx.serialization generates serializers referenced by name.
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.minzmahallu.**$$serializer { *; }
-keepclassmembers class app.minzmahallu.** {
    *** Companion;
}
-keepclasseswithmembers class app.minzmahallu.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ---------------------------------------------------------------------------
# Room
# ---------------------------------------------------------------------------
# Entities are instantiated by generated code from column names, and the
# generated *_Impl classes are looked up by name.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao class * { *; }
-keep class app.minzmahallu.core.database.** { *; }
-keep class app.minzmahallu.core.model.** { *; }
-dontwarn androidx.room.paging.**

# ---------------------------------------------------------------------------
# Hilt / Dagger
# ---------------------------------------------------------------------------
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }
-keepclassmembers,allowobfuscation class * {
    @dagger.hilt.android.AndroidEntryPoint <init>(...);
}

# ---------------------------------------------------------------------------
# Jetpack Compose
# ---------------------------------------------------------------------------
# Compose compiler plugin output is reflectively instantiated by the runtime.
-dontwarn androidx.compose.**
-keep class androidx.compose.runtime.** { *; }
-keepclassmembers class * implements androidx.compose.ui.platform.ViewRootForInspector { *; }

# ---------------------------------------------------------------------------
# CameraX / ML Kit — barcode scanning for token check-in
# ---------------------------------------------------------------------------
-keep class androidx.camera.** { *; }
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# ---------------------------------------------------------------------------
# android.print.pdf — receipts and certificates
# ---------------------------------------------------------------------------
-keep class android.print.** { *; }

# ---------------------------------------------------------------------------
# Stack traces: this app writes an audit trail, and a minified stack trace in
# an audit record is useless to whoever has to investigate it.
# ---------------------------------------------------------------------------
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable
