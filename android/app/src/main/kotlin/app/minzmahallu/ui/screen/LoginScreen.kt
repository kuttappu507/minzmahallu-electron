package app.minzmahallu.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.R
import app.minzmahallu.core.ui.component.ButtonSize
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.IndeterminateBar
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PasswordField
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.AuroraBackground
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.leaf

/**
 * Modern, fluid Login screen.
 *
 * Uses the official brand logo, elegant card design, localized error alerts,
 * lockout countdowns and direct route to administrator setup on first run.
 */
@Composable
fun LoginScreen(
    onSignedIn: () -> Unit,
    onNavigateSetup: (() -> Unit)? = null,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    androidx.compose.runtime.LaunchedEffect(state.signedIn, state.needsSetup) {
        when {
            state.needsSetup && onNavigateSetup != null -> onNavigateSetup()
            state.signedIn -> onSignedIn()
        }
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(intensity = 1.3f)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Spacer(Modifier.height(36.dp))

            // Official Brand Mark with Glowing Leaf container
            Box(
                Modifier
                    .size(92.dp)
                    .clip(leaf(large = 36.dp, small = 14.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                Color(0xFF095950),
                                Color(0xFF0E9C8D),
                            ),
                        ),
                    )
                    .border(
                        1.5.dp,
                        colors.gold.copy(alpha = 0.45f),
                        leaf(large = 36.dp, small = 14.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.logo_white),
                    contentDescription = "Minz Mahallu Logo",
                    modifier = Modifier.size(56.dp),
                )
            }

            Spacer(Modifier.height(18.dp))
            AppText(
                text = "Minz Mahallu",
                style = MahalluTheme.type.headline,
                color = colors.textPrimary,
            )
            AppText(
                text = "മിൻസ് മഹല്ല് മാനേജ്‌മെന്റ് സിസ്റ്റം",
                style = MahalluTheme.type.caption,
                color = colors.textSecondary,
            )

            Spacer(Modifier.height(28.dp))

            // Auth Card
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(colors.surface)
                    .border(1.dp, colors.line, RoundedCornerShape(22.dp))
                    .padding(24.dp),
            ) {
                Eyebrow("SIGN IN")
                Spacer(Modifier.height(6.dp))
                AppText(
                    text = "Welcome back",
                    style = MahalluTheme.type.title,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.height(4.dp))
                AppText(
                    text = "Enter your credentials to access the mahallu records.",
                    style = MahalluTheme.type.caption,
                    color = colors.textSecondary,
                )
                Spacer(Modifier.height(22.dp))

                MahalluTextField(
                    value = state.username,
                    onValueChange = viewModel::onUsername,
                    label = "Username",
                    enabled = !state.busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                )
                Spacer(Modifier.height(14.dp))
                PasswordField(
                    value = state.password,
                    onValueChange = viewModel::onPassword,
                    label = "Password",
                )

                // Localized error message banner
                AnimatedVisibility(
                    visible = state.error != null,
                    enter = fadeIn(),
                    exit = fadeOut(),
                ) {
                    state.error?.let { errText ->
                        Spacer(Modifier.height(14.dp))
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(Shapes.sm))
                                .background(colors.danger.copy(alpha = 0.12f))
                                .border(1.dp, colors.danger.copy(alpha = 0.35f), RoundedCornerShape(Shapes.sm))
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(colors.danger),
                            )
                            Spacer(Modifier.width(10.dp))
                            AppText(
                                text = errText,
                                style = MahalluTheme.type.body,
                                color = colors.danger,
                            )
                        }
                    }
                }

                if (state.lockedMinutes > 0) {
                    Spacer(Modifier.height(14.dp))
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Shapes.md))
                            .background(colors.danger.copy(alpha = 0.12f))
                            .border(1.dp, colors.danger.copy(alpha = 0.35f), RoundedCornerShape(Shapes.md))
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
                                if (state.lockedMinutes == 1L) "" else "s" + ".",
                            style = MahalluTheme.type.caption,
                            color = colors.textSecondary,
                        )
                    }
                }

                Spacer(Modifier.height(20.dp))
                if (state.busy) {
                    IndeterminateBar(Modifier.fillMaxWidth())
                    Spacer(Modifier.height(12.dp))
                }

                MahalluButton(
                    onClick = viewModel::submit,
                    text = "Sign in",
                    modifier = Modifier.fillMaxWidth(),
                    size = ButtonSize.Large,
                    loading = state.busy,
                    enabled = state.username.isNotBlank() &&
                        state.password.isNotEmpty() &&
                        state.lockedMinutes == 0L,
                )

                // First-run registration link
                if (state.needsSetup) {
                    Spacer(Modifier.height(16.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(Shapes.sm))
                            .clickable { onNavigateSetup?.invoke() }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        AppText(
                            text = "First run? Create Administrator account →",
                            style = MahalluTheme.type.bodyStrong,
                            color = colors.accent,
                        )
                    }
                }
            }
            Spacer(Modifier.height(36.dp))
        }
    }
}
