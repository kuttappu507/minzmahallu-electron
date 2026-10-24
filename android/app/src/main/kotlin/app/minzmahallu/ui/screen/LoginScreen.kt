package app.minzmahallu.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.PasswordPolicy
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.MahalluButtonSize
import app.minzmahallu.core.ui.component.MahalluButtonVariant
import app.minzmahallu.core.ui.component.ConfirmDialog
import app.minzmahallu.core.ui.component.IndeterminateBar
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PasswordField
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.AuroraBackground
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.leaf

/**
 * Login.
 *
 * Mirrors `src/pages/Login.tsx`: username + password, the 5-attempt lockout
 * with a live countdown, and a straight-through redirect into first-run setup
 * when the database has no real administrator yet.
 */
@Composable
fun LoginScreen(
    onSignedIn: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    androidx.compose.runtime.LaunchedEffect(state.signedIn, state.needsSetup) {
        when {
            state.needsSetup -> viewModel.goToSetup()
            state.signedIn -> onSignedIn()
        }
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(intensity = 1.25f)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Spacer(Modifier.height(48.dp))
            BrandMark()
            Spacer(Modifier.height(38.dp))

            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(leaf(flipped = true))
                    .background(colors.surface)
                    .padding(24.dp),
            ) {
                Eyebrow("sign in")
                Spacer(Modifier.height(6.dp))
                AppText(
                    text = "Minz Mahallu",
                    style = MahalluTheme.type.headline,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.height(4.dp))
                AppText(
                    text = "Management System",
                    style = MahalluTheme.type.body,
                    color = colors.textSecondary,
                )
                Spacer(Modifier.height(26.dp))

                MahalluTextField(
                    value = state.username,
                    onValueChange = viewModel::onUsername,
                    label = "Username",
                    enabled = !state.busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                )
                Spacer(Modifier.height(16.dp))
                PasswordField(
                    value = state.password,
                    onValueChange = viewModel::onPassword,
                    label = "Password",
                    error = state.error,
                )

                if (state.lockedMinutes > 0) {
                    Spacer(Modifier.height(18.dp))
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Shapes.md))
                            .background(colors.danger.copy(alpha = 0.10f))
                            .padding(14.dp),
                    ) {
                        AppText(
                            text = "Account locked",
                            style = MahalluTheme.type.bodyStrong,
                            color = colors.danger,
                        )
                        Spacer(Modifier.height(4.dp))
                        AppText(
                            text = "Too many failed attempts. Try again in " +
                                "${state.lockedMinutes} minute" +
                                if (state.lockedMinutes == 1) "" else "s" + ".",
                            style = MahalluTheme.type.caption,
                            color = colors.textSecondary,
                        )
                    }
                }

                Spacer(Modifier.height(24.dp))
                if (state.busy) IndeterminateBar(Modifier.fillMaxWidth())
                Spacer(Modifier.height(14.dp))
                MahalluButton(
                    onClick = viewModel::submit,
                    text = "Sign in",
                    modifier = Modifier.fillMaxWidth(),
                    size = ButtonSize.Large,
                    loading = state.busy,
                    enabled = state.username.isNotBlank() &&
                        state.password.isNotEmpty() &&
                        state.lockedMinutes == 0,
                )
            }
            Spacer(Modifier.height(40.dp))
        }
    }
}

/** The app mark — a leaf-shaped plate with the mahallu initial. */
@Composable
private fun BrandMark() {
    val colors = MahalluTheme.colors
    Box(
        Modifier
            .size(76.dp)
            .clip(leaf(large = 30.dp, small = 12.dp))
            .background(colors.accentWash),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(58.dp)
                .clip(leaf(large = 24.dp, small = 10.dp))
                .background(colors.accent),
            contentAlignment = Alignment.Center,
        ) {
            AppText(
                text = "M",
                style = MahalluTheme.type.display,
                color = colors.onAccent,
                maxLines = 1,
            )
        }
    }
}
