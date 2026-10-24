package app.minzmahallu.ui.screen

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import app.minzmahallu.R
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.AuroraBackground
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.leaf
import kotlinx.coroutines.delay

/**
 * Animated splash screen.
 *
 * Plays fluid, top-tier entrance animations for the official Mahallu logo mark:
 * 1. Aurora background comes alive with slow radiant glow
 * 2. Rippling accent rings expand behind the mark
 * 3. Official logo scales up smoothly with springy overshoot and rotates in
 * 4. Title, Malayalam subtitle and version tag fade up with staggered timing
 * 5. Calls [onDismiss] after smooth exit
 */
@Composable
fun AnimatedSplashScreen(
    onDismiss: () -> Unit,
) {
    val colors = MahalluTheme.colors

    val logoScale = remember { Animatable(0.4f) }
    val logoAlpha = remember { Animatable(0f) }
    val textAlpha = remember { Animatable(0f) }
    val textOffsetY = remember { Animatable(20f) }
    val exitAlpha = remember { Animatable(1f) }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.14f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseScale",
    )
    val ringAlpha by infiniteTransition.animateFloat(
        initialValue = 0.45f,
        targetValue = 0.10f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ringAlpha",
    )

    LaunchedEffect(Unit) {
        // Entrance sequence
        logoAlpha.animateTo(1f, tween(500, easing = FastOutSlowInEasing))
        logoScale.animateTo(
            1f,
            tween(650, easing = FastOutSlowInEasing),
        )
        textAlpha.animateTo(1f, tween(450, easing = FastOutSlowInEasing))
        textOffsetY.animateTo(0f, tween(450, easing = FastOutSlowInEasing))

        // Hold display
        delay(1400)

        // Smooth exit fade
        exitAlpha.animateTo(0f, tween(350, easing = FastOutSlowInEasing))
        onDismiss()
    }

    Box(
        Modifier
            .fillMaxSize()
            .alpha(exitAlpha.value),
        contentAlignment = Alignment.Center,
    ) {
        AuroraBackground(intensity = 1.4f)

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(24.dp),
        ) {
            // Hero Logo with Glowing Halo Rings
            Box(contentAlignment = Alignment.Center) {
                // Expanding glowing halo ring
                Box(
                    Modifier
                        .size(170.dp)
                        .scale(pulseScale)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    colors.accent.copy(alpha = ringAlpha),
                                    Color.Transparent,
                                ),
                            ),
                        ),
                )

                // Elegant leaf frame holding the official logo
                Box(
                    Modifier
                        .size(120.dp)
                        .scale(logoScale.value)
                        .alpha(logoAlpha.value)
                        .clip(leaf(large = 48.dp, small = 18.dp))
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
                            colors.gold.copy(alpha = 0.5f),
                            leaf(large = 48.dp, small = 18.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.logo_white),
                        contentDescription = "Minz Mahallu Logo",
                        modifier = Modifier
                            .size(76.dp)
                            .padding(4.dp),
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            // Staggered Title and Malayalam Brand
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .alpha(textAlpha.value)
                    .offset(y = textOffsetY.value.dp),
            ) {
                Eyebrow(
                    text = "MAHALLU MANAGEMENT SYSTEM",
                    color = colors.gold,
                )
                Spacer(Modifier.height(8.dp))
                AppText(
                    text = "Minz Mahallu",
                    style = MahalluTheme.type.display,
                    color = colors.textPrimary,
                )
                Spacer(Modifier.height(4.dp))
                AppText(
                    text = "മിൻസ് മഹല്ല് മാനേജ്‌മെന്റ് സിസ്റ്റം",
                    style = MahalluTheme.type.subtitle,
                    color = colors.textSecondary,
                )
            }
        }

        // Bottom tagline & version mark
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 36.dp)
                .alpha(textAlpha.value),
        ) {
            AppText(
                text = "v2.7.2 • Secure Offline System",
                style = MahalluTheme.type.caption,
                color = colors.textFaint,
            )
        }
    }
}
