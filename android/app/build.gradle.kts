plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "app.minzmahallu"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.minzmahallu"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "2.7.2"
        resourceConfigurations += listOf("en", "ml")
    }

    signingConfigs {
        // The desktop build signs with a checked-in key; the Android build
        // reads it from the environment so no secret is committed.
        if (System.getenv("MMS_KEYSTORE") != null) {
            create("release") {
                storeFile = file(System.getenv("MMS_KEYSTORE")!!)
                storePassword = System.getenv("MMS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MMS_KEY_ALIAS")
                keyPassword = System.getenv("MMS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "META-INF/DEPENDENCIES",
        )
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
    implementation(projects.core.common)
    implementation(projects.core.model)
    implementation(projects.core.database)
    implementation(projects.core.domain)
    implementation(projects.core.ui)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.animation)
    implementation(libs.compose.material.icons)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.splashscreen)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(libs.room.runtime)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.androidx.exifinterface)

    // PDF output — receipts, certificates, the audit pack.
    implementation(libs.androidx.pdf)

    // Barcode scanning for token check-in and certificate verification.
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)
    implementation(libs.mlkit.barcode)

    // .xlsx export is written directly (a zip of SpreadsheetML parts) rather
    // than pulling in Apache POI, whose desktop footprint does not fit a phone.
    // See app/src/main/kotlin/app/minzmahallu/export/XlsxWriter.kt.

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.mockito.core)
    androidTestImplementation(libs.androidx.test.junit)
}
