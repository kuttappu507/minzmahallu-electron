// :core:domain — the business rules.
//
// This module carries no Android API calls of its own: every import is Room's
// DAO *interfaces* (plain Kotlin), kotlinx.coroutines, kotlinx.serialization
// and javax.inject. It is nevertheless built as an Android library, because
// Gradle will not let a `jvm` module consume an `androidJvm` one — the variant
// attributes are incompatible and resolution fails with "No matching variant of
// project :core:database".
//
// Being an Android library does not cost the property this module exists for.
// `testDebugUnitTest` is a plain JVM task: the subscription arrears/advance
// allocation, the approval workflow and the unified ledger are all still tested
// with no emulator and no Android runtime. What would cost that property is
// depending on Room's generated DAO implementations from a JVM module, which is
// the thing that never worked.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.hilt)
}

android {
    namespace = "app.minzmahallu.core.domain"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    api(projects.core.model)
    api(projects.core.common)
    // The DAO interfaces live here, so this stays an `api` dependency: the app
    // module reads them straight through when it wires the database.
    api(projects.core.database)

    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.javax.inject)

    implementation(libs.hilt.android)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
}
