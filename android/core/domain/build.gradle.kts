// :core:domain — the business rules.
//
// Pure Kotlin/JVM on purpose: the repositories talk to Room's DAO *interfaces*
// (which are plain Kotlin) and are constructed with @Inject, so the whole
// domain — including the subscription arrears/advance allocation, the approval
// workflow and the unified ledger — is unit-testable on the JVM with no
// emulator and no Android runtime.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    api(projects.core.model)
    api(projects.core.common)
    // DAO interfaces only — Room's runtime is supplied by :core:database at
    // app assembly time, so this module never touches Android.
    api(projects.core.database)

    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.javax.inject)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
}
