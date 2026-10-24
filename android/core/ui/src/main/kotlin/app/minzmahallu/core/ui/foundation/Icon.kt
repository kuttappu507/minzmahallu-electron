package app.minzmahallu.core.ui.foundation

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.ui.theme.MahalluTheme

/**
 * Universal Vector Icon renderer without Material Theme dependency.
 *
 * Renders pure ImageVector path geometries using standard Compose Canvas / VectorPainter
 * tinted with our MahalluTheme design system.
 */
@Composable
fun AppIcon(
    imageVector: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color? = null,
    size: Dp = 20.dp,
) {
    val resolvedTint = tint ?: MahalluTheme.colors.textPrimary
    androidx.compose.foundation.Image(
        imageVector = imageVector,
        contentDescription = contentDescription,
        modifier = modifier.size(size),
        colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(resolvedTint),
    )
}
