package app.minzmahallu.core.ui.component

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.Shapes

/**
 * The app's text field.
 *
 * Built on `BasicTextField`, so nothing about its shape, focus ring or label
 * behaviour comes from Material. The label sits above the box and tightens
 * toward the accent on focus; the border thickens and colours at the same
 * moment, so focus reads as one change rather than three.
 */
@Composable
fun MahalluTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    supporting: String? = null,
    error: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    shape: Shape = RoundedCornerShape(Shapes.md),
    textStyle: TextStyle? = null,
) {
    val colors = MahalluTheme.colors
    val resolvedStyle = textStyle ?: MahalluTheme.type.body
    var focused by remember { mutableStateOf(false) }

    val borderColor by animateColorAsState(
        targetValue = when {
            error != null -> colors.danger
            focused -> colors.accent
            else -> colors.line
        },
        animationSpec = Motion.emphasized(240),
        label = "field-border",
    )
    val labelColor by animateColorAsState(
        targetValue = when {
            error != null -> colors.danger
            focused -> colors.accent
            filled(value) -> colors.textSecondary
            else -> colors.textFaint
        },
        animationSpec = Motion.emphasized(240),
        label = "field-label",
    )
    val borderWidth by animateFloatAsState(
        targetValue = if (focused || error != null) 1.6f else 1f,
        animationSpec = Motion.emphasized(240),
        label = "field-border-width",
    )

    Column(modifier) {
        AppText(
            text = label,
            style = MahalluTheme.type.label,
            color = labelColor,
            modifier = Modifier.padding(start = 4.dp, bottom = 7.dp),
            maxLines = 1,
        )
        Row(
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(if (enabled) colors.surface else colors.surfaceSunken)
                .border(borderWidth.dp, borderColor.copy(alpha = if (enabled) 1f else 0.5f), shape)
                .padding(
                    start = if (leading != null) 12.dp else 16.dp,
                    end = if (trailing != null) 12.dp else 16.dp,
                    top = 14.dp,
                    bottom = 14.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leading != null) {
                Box(contentAlignment = Alignment.Center) { leading() }
                Spacer(Modifier.width(10.dp))
            }
            Box(Modifier.weight(1f)) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { state -> focused = state.isFocused },
                    enabled = enabled,
                    singleLine = singleLine,
                    minLines = minLines,
                    textStyle = resolvedStyle.copy(color = colors.textPrimary),
                    keyboardOptions = keyboardOptions,
                    keyboardActions = keyboardActions,
                    visualTransformation = visualTransformation,
                    cursorBrush = SolidColor(colors.accent),
                    decorationBox = { inner ->
                        if (value.isEmpty()) {
                            AppText(
                                text = label,
                                style = resolvedStyle,
                                color = colors.textFaint.copy(alpha = 0.75f),
                                maxLines = 1,
                            )
                        }
                        inner()
                    },
                )
            }
            if (trailing != null) {
                Spacer(Modifier.width(10.dp))
                Box(contentAlignment = Alignment.Center) { trailing() }
            }
        }
        when {
            error != null -> FieldNote(error, colors.danger)
            supporting != null -> FieldNote(supporting, colors.textFaint)
        }
    }
}

private fun filled(value: String) = value.isNotEmpty()

@Composable
private fun FieldNote(text: String, color: Color) {
    AppText(
        text = text,
        style = MahalluTheme.type.caption,
        color = color,
        modifier = Modifier.padding(start = 4.dp, top = 6.dp),
    )
}

/** Money field: numeric keyboard, currency glyph, and input sanitising. */
@Composable
fun AmountField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    currencySymbol: String = "₹",
    error: String? = null,
    enabled: Boolean = true,
) {
    MahalluTextField(
        value = value,
        onValueChange = { raw -> onValueChange(sanitizeAmount(raw)) },
        label = label,
        modifier = modifier,
        error = error,
        enabled = enabled,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        textStyle = MahalluTheme.type.amountSmall,
        leading = {
            AppText(
                text = currencySymbol,
                style = MahalluTheme.type.subtitle,
                color = MahalluTheme.colors.textFaint,
            )
        },
    )
}

/** Phone field: clamps to 10 Indian digits as the user types. */
@Composable
fun PhoneField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    supporting: String? = null,
    enabled: Boolean = true,
) {
    MahalluTextField(
        value = value,
        onValueChange = { onValueChange(app.minzmahallu.core.common.Phone.clamp10(it)) },
        label = label,
        modifier = modifier,
        error = error,
        supporting = supporting,
        enabled = enabled,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        textStyle = MahalluTheme.type.code,
    )
}

/** Password field with a reveal toggle and the animated strength meter. */
@Composable
fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    showStrength: Boolean = false,
) {
    var revealed by remember { mutableStateOf(false) }
    Column(modifier) {
        MahalluTextField(
            value = value,
            onValueChange = onValueChange,
            label = label,
            error = error,
            visualTransformation = if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            textStyle = MahalluTheme.type.bodyStrong,
            trailing = {
                IconButton(
                    onClick = { revealed = !revealed },
                    size = 34.dp,
                    icon = {
                        AppText(
                            text = if (revealed) "hide" else "show",
                            style = MahalluTheme.type.micro,
                            color = MahalluTheme.colors.textFaint,
                        )
                    },
                )
            },
        )
        if (showStrength) {
            Spacer(Modifier.height(12.dp))
            StrengthMeter(value)
        }
    }
}

/** The strength meter — four segments that fill as the policy is satisfied. */
@Composable
fun StrengthMeter(password: String, modifier: Modifier = Modifier) {
    val colors = MahalluTheme.colors
    val strength = app.minzmahallu.core.common.PasswordPolicy.strength(password)
    val filledSegments = (strength * 4).toInt().coerceIn(0, 4)
    val tint = when {
        strength < 0.4f -> colors.danger
        strength < 0.75f -> colors.warning
        else -> colors.accent
    }
    Column(modifier.fillMaxWidth()) {
        Row {
            repeat(4) { index ->
                Box(
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 3.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(percent = 50))
                        .background(if (index < filledSegments) tint else colors.surfaceSunken),
                )
            }
        }
        if (password.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            AppText(
                text = when {
                    strength < 0.4f -> "weak"
                    strength < 0.75f -> "fair"
                    else -> "strong"
                },
                style = MahalluTheme.type.micro,
                color = tint,
            )
        }
    }
}

/** Keeps only digits and a single decimal point, capped at a sane length. */
fun sanitizeAmount(raw: String): String {
    val cleaned = raw.filter { it.isDigit() || it == '.' }
    val firstDot = cleaned.indexOf('.')
    return if (firstDot < 0) {
        cleaned.take(11)
    } else {
        val head = cleaned.substring(0, firstDot).take(11)
        val tail = cleaned.substring(firstDot + 1).filter { it.isDigit() }.take(2)
        if (tail.isEmpty()) "$head." else "$head.$tail"
    }
}
