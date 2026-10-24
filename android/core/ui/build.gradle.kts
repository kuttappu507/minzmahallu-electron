// :core:ui — the design system.
//
// Deliberately built on `androidx.compose.foundation` + `ui` ONLY. There is no
// dependency on androidx.compose.material or material3 anywhere in the project:
// every button, field, card, sheet, chip, toggle, progress indicator and chart
// in the app is drawn here, which is what lets the motion language, the shapes
// and the surfaces be one coherent system instead of a Material theme with
// overrides.
//
// `material-icons-extended` is included because it ships vector path data only
// (no widgets, no Material styling) — drawing our own 900 glyphs would add
// nothing but risk.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "app.minzmahallu.core.ui"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    buildFeatures {
        compose = true
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
    api(projects.core.common)

    api(platform(libs.compose.bom))
    api(libs.compose.ui)
    api(libs.compose.ui.graphics)
    api(libs.compose.ui.tooling.preview)
    api(libs.compose.foundation)
    api(libs.compose.foundation.layout)
    api(libs.compose.runtime)
    api(libs.compose.animation)
    api(libs.compose.material.icons)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)

    debugApi(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
}
