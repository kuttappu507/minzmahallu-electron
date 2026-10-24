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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.minzmahallu.core.ui.component.MahalluButton
import app.minzmahallu.core.ui.component.ButtonSize
import app.minzmahallu.core.ui.component.ButtonVariant
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
 * Runs once, when the database holds no real administrator. It creates the
 * mahallu's identity *and* the administrator account together, because the
 * certificate and receipt numbering schemes are derived from the mahallu's
 * initials: getting the name wrong here would mis-number every document the
 * mahallu ever issues.
 */
@Composable
fun SetupScreen(
    onComplete: () -> Unit,
    viewModel: SetupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MahalluTheme.colors

    androidx.compose.runtime.LaunchedEffect(state.done) {
        if (state.done) onComplete()
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground(intensity = 1.1f)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 40.dp),
        ) {
            StepDots(step = state.step, total = 3)
            Spacer(Modifier.height(28.dp))

            when (state.step) {
                1 -> Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(leaf())
                        .background(colors.surface)
                        .padding(24.dp),
                ) {
                    Eyebrow("step 1 of 3")
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = "About this mahallu",
                        style = MahalluTheme.type.headline,
                        color = colors.textPrimary,
                    )
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = "The name is printed on every receipt and certificate, and its initials become the document numbers.",
                        style = MahalluTheme.type.body,
                        color = colors.textSecondary,
                    )
                    Spacer(Modifier.height(24.dp))
                    MahalluTextField(
                        value = state.mahalluName,
                        onValueChange = viewModel::onName,
                        label = "Mahallu name (English)",
                    )
                    Spacer(Modifier.height(14.dp))
                    MahalluTextField(
                        value = state.mahalluNameMl,
                        onValueChange = viewModel::onNameMl,
                        label = "മഹല്ലിന്റെ പേര്",
                        supporting = "Used when the app is switched to Malayalam",
                    )
                    Spacer(Modifier.height(14.dp))
                    MahalluTextField(
                        value = state.prefix,
                        onValueChange = viewModel::onPrefix,
                        label = "Receipt prefix",
                        supporting = state.prefixHint,
                        textStyle = MahalluTheme.type.code,
                    )
                    Spacer(Modifier.height(26.dp))
                    MahalluButton(
                        onClick = viewModel::next,
                        text = "Continue",
                        modifier = Modifier.fillMaxWidth(),
                        size = ButtonSize.Large,
                        enabled = state.mahalluName.isNotBlank(),
                    )
                }

                2 -> Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(leaf())
                        .background(colors.surface)
                        .padding(24.dp),
                ) {
                    Eyebrow("step 2 of 3")
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = "Administrator account",
                        style = MahalluTheme.type.headline,
                        color = colors.textPrimary,
                    )
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = "This account can delete and restore records, so its password is asked for again before destructive actions.",
                        style = MahalluTheme.type.body,
                        color = colors.textSecondary,
                    )
                    Spacer(Modifier.height(24.dp))
                    MahalluTextField(
                        value = state.username,
                        onValueChange = viewModel::onUsername,
                        label = "Username",
                        error = state.usernameError,
                    )
                    Spacer(Modifier.height(14.dp))
                    MahalluTextField(
                        value = state.fullName,
                        onValueChange = viewModel::onFullName,
                        label = "Full name",
                    )
                    Spacer(Modifier.height(14.dp))
                    PasswordField(
                        value = state.password,
                        onValueChange = viewModel::onPassword,
                        label = "Password",
                        showStrength = true,
                        error = state.passwordError,
                    )
                    Spacer(Modifier.height(14.dp))
                    PasswordField(
                        value = state.confirm,
                        onValueChange = viewModel::onConfirm,
                        label = "Confirm password",
                        error = state.confirmError,
                    )
                    Spacer(Modifier.height(26.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MahalluButton(
                            onClick = viewModel::back,
                            variant = ButtonVariant.Ghost,
                            text = "Back",
                            modifier = Modifier.weight(1f),
                            size = ButtonSize.Large,
                        )
                        MahalluButton(
                            onClick = viewModel::next,
                            text = "Continue",
                            modifier = Modifier.weight(1.4f),
                            size = ButtonSize.Large,
                            enabled = state.accountReady,
                        )
                    }
                }

                else -> Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(leaf())
                        .background(colors.surface)
                        .padding(24.dp),
                ) {
                    Eyebrow("step 3 of 3")
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = "Subscription plan",
                        style = MahalluTheme.type.headline,
                        color = colors.textPrimary,
                    )
                    Spacer(Modifier.height(6.dp))
                    AppText(
                        text = "You can change these later in Settings. Setting them now means the first month's dues are ready to collect.",
                        style = MahalluTheme.type.body,
                        color = colors.textSecondary,
                    )
                    Spacer(Modifier.height(24.dp))
                    app.minzmahallu.core.ui.component.AmountField(
                        value = state.monthlyAmount,
                        onValueChange = viewModel::onMonthly,
                        label = "Monthly amount per family",
                    )
                    Spacer(Modifier.height(14.dp))
                    FrequencyPicker(
                        selected = state.frequency,
                        onSelect = viewModel::onFrequency,
                    )
                    Spacer(Modifier.height(26.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MahalluButton(
                            onClick = viewModel::back,
                            variant = ButtonVariant.Ghost,
                            text = "Back",
                            modifier = Modifier.weight(1f),
                            size = ButtonSize.Large,
                        )
                        MahalluButton(
                            onClick = viewModel::finish,
                            text = "Create and sign in",
                            modifier = Modifier.weight(1.6f),
                            size = ButtonSize.Large,
                            loading = state.busy,
                        )
                    }
                    if (state.error != null) {
                        Spacer(Modifier.height(16.dp))
                        AppText(
                            text = state.error.orEmpty(),
                            style = MahalluTheme.type.caption,
                            color = colors.danger,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StepDots(step: Int, total: Int) {
    val colors = MahalluTheme.colors
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        repeat(total) { index ->
            // The current step's dot stretches, so progress reads at a glance.
            val grow by androidx.compose.animation.core.animateFloatAsState(
                targetValue = if (index == step - 1) 1f else 0f,
                animationSpec = app.minzmahallu.core.ui.theme.Motion.springy(),
                label = "step-dot",
            )
            Box(
                Modifier
                    .weight(1f + grow * 1.4f)
                    .height(5.dp)
                    .clip(RoundedCornerShape(Shapes.pill))
                    .background(if (index < step) colors.accent else colors.lineStrong),
            )
        }
    }
}

@Composable
private fun FrequencyPicker(selected: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf("Monthly" to "Every month", "Quarterly" to "Every 3 months").forEach { (value, hint) ->
            app.minzmahallu.core.ui.component.FilterChip(
                text = value,
                selected = selected == value,
                onClick = { onSelect(value) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}
