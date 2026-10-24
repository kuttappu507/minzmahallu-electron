package app.minzmahallu.ui.shell

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import app.minzmahallu.R
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.leaf

/**
 * Top header of the navigation drawer/rail.
 *
 * Displays the official Mahallu branding, current logged in operator,
 * role badge and sign-out button.
 */
@Composable
fun DrawerHeader(
    mahalluName: String,
    operatorName: String,
    role: String,
    modifier: Modifier = Modifier,
    onSignOut: () -> Unit,
) {
    val colors = MahalluTheme.colors

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Official logo inside leaf badge
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
                    contentDescription = "Mahallu Mark",
                    modifier = Modifier.size(28.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                AppText(
                    text = mahalluName.ifBlank { "Minz Mahallu" },
                    style = MahalluTheme.type.subtitle,
                    color = colors.textPrimary,
                    maxLines = 1,
                )
                AppText(
                    text = "Mahallu Management",
                    style = MahalluTheme.type.micro,
                    color = colors.textSecondary,
                    maxLines = 1,
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        // Operator info pill
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(colors.surfaceSunken)
                .border(1.dp, colors.line, RoundedCornerShape(12.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(colors.accentWash),
                contentAlignment = Alignment.Center,
            ) {
                AppText(
                    text = operatorName.take(1).uppercase().ifBlank { "A" },
                    style = MahalluTheme.type.label,
                    color = colors.accentDeep,
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                AppText(
                    text = operatorName.ifBlank { "Administrator" },
                    style = MahalluTheme.type.bodyStrong,
                    color = colors.textPrimary,
                    maxLines = 1,
                )
                AppText(
                    text = role.ifBlank { "Admin" },
                    style = MahalluTheme.type.micro,
                    color = colors.accent,
                    maxLines = 1,
                )
            }

            Box(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onSignOut,
                    )
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                AppText(
                    text = "Sign out",
                    style = MahalluTheme.type.caption,
                    color = colors.danger,
                )
            }
        }
    }
}
