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
import app.minzmahallu.core.ui.component.ButtonVariant
import app.minzmahallu.core.ui.component.IndeterminateBar
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PasswordField
import app.minzmahallu.core.ui.component.StrengthMeter
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.AuroraBackground
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.leaf

/**
 * First-run setup — a port of `src/pages/Setup.tsx`.
 *
 * Runs once when no administrator account exists. Creates the Mahallu identity
 * and the primary administrator together.
 */
@Composable
fun SetupScreen(
    onComplete: () -> Unit,
    onBackToLogin: (() -> Unit)? = null,
    viewModel: SetupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    androidx.compose.runtime.LaunchedEffect(state.done) {
        if (state.done) onComplete()
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(intensity = 1.25f)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(12.dp))

            // Header brand
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Box(
                    Modifier
                        .size(46.dp)
                        .clip(leaf(large = 18.dp, small = 8.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF095950), Color(0xFF0E9C8D)),
                            ),
                        )
                        .border(1.dp, colors.gold.copy(alpha = 0.5f), leaf(large = 18.dp, small = 8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.logo_white),
                        contentDescription = "Logo",
                        modifier = Modifier.size(28.dp),
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    AppText(
                        text = "Minz Mahallu",
                        style = MahalluTheme.type.title,
                        color = colors.textPrimary,
                    )
                    AppText(
                        text = "First-Run System Setup",
                        style = MahalluTheme.type.caption,
                        color = colors.textSecondary,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
            StepDots(step = state.step, total = 3)
            Spacer(Modifier.height(24.dp))

            when (state.step) {
                1 -> StepOneMahalluIdentity(state, viewModel)
                2 -> StepTwoAdminAccount(state, viewModel)
                3 -> StepThreeReview(state, viewModel)
            }

            if (onBackToLogin != null) {
                Spacer(Modifier.height(20.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(Shapes.sm))
                        .clickable { onBackToLogin() }
                        .padding(8.dp),
                ) {
                    AppText(
                        text = "← Back to Sign in",
                        style = MahalluTheme.type.caption,
                        color = colors.textFaint,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun StepOneMahalluIdentity(
    state: SetupUiState,
    viewModel: SetupViewModel,
) {
    val colors = MahalluTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(colors.surface)
            .border(1.dp, colors.line, RoundedCornerShape(22.dp))
            .padding(22.dp),
    ) {
        Eyebrow("STEP 1 OF 3 • MAHALLU IDENTITY")
        Spacer(Modifier.height(6.dp))
        AppText(
            text = "Mahallu Details",
            style = MahalluTheme.type.title,
            color = colors.textPrimary,
        )
        Spacer(Modifier.height(4.dp))
        AppText(
            text = "This name appears on all receipts, NOCs, and official certificates.",
            style = MahalluTheme.type.caption,
            color = colors.textSecondary,
        )
        Spacer(Modifier.height(20.dp))

        MahalluTextField(
            value = state.mahalluName,
            onValueChange = viewModel::onName,
            label = "Mahallu Name (English)",
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = state.mahalluNameMl,
            onValueChange = viewModel::onNameMl,
            label = "മഹല്ല് പേര് (മലയാളം)",
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = state.prefix,
            onValueChange = viewModel::onPrefix,
            label = "Receipt Prefix (e.g. MMS)",
            supporting = state.prefixHint.ifBlank { "Used in document numbering (e.g. MMS/26/01)" },
        )
        Spacer(Modifier.height(24.dp))

        MahalluButton(
            onClick = viewModel::next,
            text = "Continue to Account Setup →",
            modifier = Modifier.fillMaxWidth(),
            size = ButtonSize.Large,
            enabled = state.mahalluName.isNotBlank(),
        )
    }
}

@Composable
private fun StepTwoAdminAccount(
    state: SetupUiState,
    viewModel: SetupViewModel,
) {
    val colors = MahalluTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(colors.surface)
            .border(1.dp, colors.line, RoundedCornerShape(22.dp))
            .padding(22.dp),
    ) {
        Eyebrow("STEP 2 OF 3 • SECURITY")
        Spacer(Modifier.height(6.dp))
        AppText(
            text = "Primary Administrator",
            style = MahalluTheme.type.title,
            color = colors.textPrimary,
        )
        Spacer(Modifier.height(4.dp))
        AppText(
            text = "Create the super-admin account with full system access.",
            style = MahalluTheme.type.caption,
            color = colors.textSecondary,
        )
        Spacer(Modifier.height(20.dp))

        MahalluTextField(
            value = state.username,
            onValueChange = viewModel::onUsername,
            label = "Username",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
            error = state.usernameError,
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = state.fullName,
            onValueChange = viewModel::onFullName,
            label = "Administrator Full Name",
        )
        Spacer(Modifier.height(14.dp))
        PasswordField(
            value = state.password,
            onValueChange = viewModel::onPassword,
            label = "Password",
            error = state.passwordError,
        )
        Spacer(Modifier.height(8.dp))
        StrengthMeter(password = state.password)
        Spacer(Modifier.height(14.dp))
        PasswordField(
            value = state.confirm,
            onValueChange = viewModel::onConfirm,
            label = "Confirm Password",
            error = state.confirmError,
        )
        Spacer(Modifier.height(24.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MahalluButton(
                onClick = viewModel::back,
                text = "Back",
                variant = ButtonVariant.Secondary,
                modifier = Modifier.weight(1f),
                size = ButtonSize.Large,
            )
            MahalluButton(
                onClick = viewModel::next,
                text = "Next →",
                modifier = Modifier.weight(1.5f),
                size = ButtonSize.Large,
                enabled = state.accountReady,
            )
        }
    }
}

@Composable
private fun StepThreeReview(
    state: SetupUiState,
    viewModel: SetupViewModel,
) {
    val colors = MahalluTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(colors.surface)
            .border(1.dp, colors.line, RoundedCornerShape(22.dp))
            .padding(22.dp),
    ) {
        Eyebrow("STEP 3 OF 3 • CONFIGURATION & LAUNCH")
        Spacer(Modifier.height(6.dp))
        AppText(
            text = "Subscriptions & Confirmation",
            style = MahalluTheme.type.title,
            color = colors.textPrimary,
        )
        Spacer(Modifier.height(18.dp))

        MahalluTextField(
            value = state.monthlyAmount,
            onValueChange = viewModel::onMonthly,
            label = "Default Monthly Subscription (₹)",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        Spacer(Modifier.height(14.dp))
        MahalluTextField(
            value = state.frequency,
            onValueChange = viewModel::onFrequency,
            label = "Billing Frequency (Monthly / Quarterly)",
        )

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

        Spacer(Modifier.height(24.dp))
        if (state.busy) {
            IndeterminateBar(Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MahalluButton(
                onClick = viewModel::back,
                text = "Back",
                variant = ButtonVariant.Secondary,
                modifier = Modifier.weight(1f),
                size = ButtonSize.Large,
                enabled = !state.busy,
            )
            MahalluButton(
                onClick = viewModel::finish,
                text = "Initialize & Launch",
                modifier = Modifier.weight(2f),
                size = ButtonSize.Large,
                loading = state.busy,
                enabled = state.accountReady && !state.busy,
            )
        }
    }
}

@Composable
private fun StepDots(step: Int, total: Int) {
    val colors = MahalluTheme.colors
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (i in 1..total) {
            val active = i == step
            val done = i < step
            val color = when {
                active -> colors.accent
                done -> colors.gold
                else -> colors.line
            }
            Box(
                Modifier
                    .size(if (active) 26.dp else 10.dp, 10.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(color),
            )
        }
    }
}
