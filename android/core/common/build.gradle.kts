// :core:common — pure Kotlin (JVM), zero Android dependencies.
//
// Every business rule that the Electron app implements in TypeScript lives here
// as a plain function so it can be unit-tested on the JVM in milliseconds
// (no Robolectric, no emulator): IST calendar maths, the mahallu document
// numbering scheme, password policy, phone clamping, the role write-access
// matrix, currency formatting and QR payload building/verification.
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
    implementation(libs.kotlinx.coroutines.core)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
}
