// :core:model — the record model, shared by :core:database, :core:domain and
// the UI. Declared as a plain Kotlin/JVM module: Room's *annotations* live in
// the `room-common` artifact which has no Android dependency, so the entities
// stay Android-free and reusable from JVM tests, while the DAOs and the
// database class (which do need a Context) live in :core:database.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    // Annotations only (@Entity, @ColumnInfo, …) — no runtime, no Android.
    api(libs.room.common)
    api(projects.core.common)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
}
