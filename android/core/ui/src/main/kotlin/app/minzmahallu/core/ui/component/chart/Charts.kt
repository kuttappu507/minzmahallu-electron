package app.minzmahallu.core.ui.component.chart

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.minzmahallu.core.common.IndianGrouping
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import kotlin.math.max

/**
 * The chart family, drawn straight onto `Canvas`.
 *
 * The desktop app uses Recharts; pulling that dependency into the phone would
 * buy nothing but weight. These four primitives cover every chart the app
 * actually shows: monthly collections, income-versus-expense, ledger splits
 * and the dashboard's trend sparkline. Each one animates in on first draw.
 */

/** A single point in a series. */
data class ChartPoint(
    val label: String,
    val value: Double,
    val secondary: Double = 0.0,
)

/** Bars that grow from the baseline, staggered left to right. */
@Composable
fun BarChart(
    points: List<ChartPoint>,
    modifier: Modifier = Modifier,
    height: Dp = 190.dp,
    barColor: Color? = null,
    secondaryColor: Color? = null,
    showSecondary: Boolean = false,
    labelEvery: Int = 1,
    valueFormat: (Double) -> String = { IndianGrouping.formatAmount(it) },
) {
    val colors = MahalluTheme.colors
    if (points.isEmpty()) return
    val fill = barColor ?: colors.accent
    val fillSecondary = secondaryColor ?: colors.gold
    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = Motion.emphasized(900),
        label = "bar-grow",
    )
    val peak = max(
        points.maxOf { if (showSecondary) max(it.value, it.secondary) else it.value },
        1.0,
    )

    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().height(height)) {
            val labelSpace = 26.dp.toPx()
            val chartHeight = size.height - labelSpace
            val slot = size.width / points.size
            val barWidth = (slot * if (showSecondary) 0.30f else 0.52f)
                .coerceAtMost(34.dp.toPx())

            // Gridlines at quarters, so the reader can estimate a value.
            for (i in 0..4) {
                val y = chartHeight * (1f - i / 4f)
                drawLine(
                    color = colors.line.copy(alpha = if (i == 0) 0.9f else 0.45f),
                    start = Offset(0f, y),
                    end = Offset(size.width, y),
                    strokeWidth = 1.dp.toPx(),
                )
            }

            points.forEachIndexed { index, point ->
                // Stagger: each bar starts a little after the one before it.
                val localStart = index.toFloat() / points.size * 0.35f
                val localProgress = ((progress - localStart) / (1f - localStart)).coerceIn(0f, 1f)
                val centre = slot * index + slot / 2f
                val h = (chartHeight * (point.value / peak).toFloat() * localProgress)
                    .coerceAtLeast(0f)

                drawRoundRect(
                    brush = Brush.verticalGradient(
                        listOf(fill, fill.copy(alpha = 0.55f)),
                    ),
                    topLeft = Offset(centre - barWidth / 2f, chartHeight - h),
                    size = Size(barWidth, h),
                    cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f),
                )

                if (showSecondary) {
                    val h2 = (chartHeight * (point.secondary / peak).toFloat() * localProgress)
                        .coerceAtLeast(0f)
                    drawRoundRect(
                        color = fillSecondary.copy(alpha = 0.85f),
                        topLeft = Offset(centre + barWidth * 0.12f, chartHeight - h2),
                        size = Size(barWidth * 0.8f, h2),
                        cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f),
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth()) {
            points.forEachIndexed { index, point ->
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (index % labelEvery == 0) {
                        AppText(
                            text = point.label,
                            style = MahalluTheme.type.micro,
                            color = colors.textFaint,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/**
 * A smoothed line with a gradient fill underneath — the income-versus-expense
 * trend and the dashboard's twelve-month shape.
 */
@Composable
fun LineChart(
    points: List<ChartPoint>,
    modifier: Modifier = Modifier,
    height: Dp = 200.dp,
    lineColor: Color? = null,
    secondaryLine: List<Double>? = null,
    secondaryColor: Color? = null,
    labelEvery: Int = 2,
    showDots: Boolean = true,
) {
    val colors = MahalluTheme.colors
    if (points.size < 2) return
    val stroke = lineColor ?: colors.accent
    val strokeSecondary = secondaryColor ?: colors.danger
    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = Motion.emphasized(1000),
        label = "line-draw",
    )
    val secondaryValues = secondaryLine?.takeIf { it.size == points.size }
    val peak = max(
        points.maxOf { max(it.value, secondaryValues?.get(points.indexOf(it)) ?: 0.0) },
        1.0,
    )

    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().height(height)) {
            val chartHeight = size.height - 6.dp.toPx()
            val step = size.width / (points.size - 1)
            val yFor: (Double) -> Float = { v ->
                chartHeight - (chartHeight * (v / peak).toFloat()).coerceIn(0f, chartHeight)
            }

            for (i in 0..4) {
                val y = chartHeight * (1f - i / 4f)
                drawLine(
                    color = colors.line.copy(alpha = if (i == 0) 0.9f else 0.4f),
                    start = Offset(0f, y),
                    end = Offset(size.width, y),
                    strokeWidth = 1.dp.toPx(),
                )
            }

            val visible = (points.size * progress).toInt().coerceAtLeast(2)
            val line = smoothPath(points.take(visible), step, yFor)
            val fill = Path().apply {
                addPath(line)
                lineTo(step * (visible - 1), chartHeight)
                lineTo(0f, chartHeight)
                close()
            }
            drawPath(
                path = fill,
                brush = Brush.verticalGradient(
                    listOf(stroke.copy(alpha = 0.28f), stroke.copy(alpha = 0f)),
                ),
            )
            drawPath(
                path = line,
                color = stroke,
                style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round),
            )

            if (secondaryValues != null) {
                val second = smoothPath(
                    secondaryValues.take(visible).mapIndexed { i, v ->
                        ChartPoint(points[i].label, v)
                    },
                    step,
                    yFor,
                )
                drawPath(
                    path = second,
                    color = strokeSecondary,
                    style = Stroke(
                        width = 2.dp.toPx(),
                        cap = StrokeCap.Round,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)),
                    ),
                )
            }

            if (showDots) {
                points.take(visible).forEachIndexed { index, point ->
                    drawCircle(
                        color = colors.surface,
                        radius = 3.4.dp.toPx(),
                        center = Offset(step * index, yFor(point.value)),
                    )
                    drawCircle(
                        color = stroke,
                        radius = 3.4.dp.toPx(),
                        center = Offset(step * index, yFor(point.value)),
                        style = Stroke(width = 2.dp.toPx()),
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth()) {
            points.forEachIndexed { index, point ->
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (index % labelEvery == 0) {
                        AppText(
                            text = point.label,
                            style = MahalluTheme.type.micro,
                            color = colors.textFaint,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/** A Catmull-Rom-ish smoothing pass; good enough to read as a trend. */
private fun smoothPath(
    points: List<ChartPoint>,
    step: Float,
    yFor: (Double) -> Float,
): Path = Path().apply {
    if (points.isEmpty()) return@apply
    moveTo(0f, yFor(points.first().value))
    for (i in 1 until points.size) {
        val x0 = step * (i - 1)
        val x1 = step * i
        val y0 = yFor(points[i - 1].value)
        val y1 = yFor(points[i].value)
        cubicTo((x0 + x1) / 2f, y0, (x0 + x1) / 2f, y1, x1, y1)
    }
}

/**
 * The ledger split ring — subscription vs donation vs other income, or the
 * welfare/expense breakdown. Segments sweep in one after another.
 */
@Composable
fun DonutChart(
    slices: List<DonutSlice>,
    modifier: Modifier = Modifier,
    size: Dp = 168.dp,
    thickness: Dp = 20.dp,
    centreLabel: String? = null,
    centreValue: String? = null,
) {
    val colors = MahalluTheme.colors
    val total = slices.sumOf { it.value }.takeIf { it > 0 } ?: return
    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = Motion.emphasized(1000),
        label = "donut-sweep",
    )

    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = thickness.toPx()
            val diameter = this.size.minDimension - stroke
            val topLeft = Offset(
                (this.size.width - diameter) / 2f,
                (this.size.height - diameter) / 2f,
            )
            val arcSize = Size(diameter, diameter)
            var startAngle = -90f
            slices.forEach { slice ->
                val sweep = (slice.value / total * 360.0).toFloat() * progress
                drawArc(
                    color = slice.color,
                    startAngle = startAngle + 1.2f,
                    sweepAngle = (sweep - 2.4f).coerceAtLeast(0f),
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
                startAngle += sweep
            }
        }
        if (centreValue != null || centreLabel != null) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (centreValue != null) {
                    AppText(
                        text = centreValue,
                        style = MahalluTheme.type.amountSmall,
                        color = colors.textPrimary,
                        maxLines = 1,
                    )
                }
                if (centreLabel != null) {
                    AppText(
                        text = centreLabel,
                        style = MahalluTheme.type.micro,
                        color = colors.textFaint,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

data class DonutSlice(
    val label: String,
    val value: Double,
    val color: Color,
)

/** The donut's legend, laid out as label / value / share rows. */
@Composable
fun DonutLegend(
    slices: List<DonutSlice>,
    modifier: Modifier = Modifier,
    format: (Double) -> String = { IndianGrouping.formatAmount(it) },
) {
    val colors = MahalluTheme.colors
    val total = slices.sumOf { it.value }.takeIf { it > 0 } ?: 1.0
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        slices.forEach { slice ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(9.dp)
                        .background(slice.color, shape = androidx.compose.foundation.shape.CircleShape),
                )
                Spacer(Modifier.width(9.dp))
                AppText(
                    text = slice.label,
                    style = MahalluTheme.type.label,
                    color = colors.textSecondary,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                )
                AppText(
                    text = format(slice.value),
                    style = MahalluTheme.type.bodyStrong,
                    color = colors.textPrimary,
                    maxLines = 1,
                )
                Spacer(Modifier.width(10.dp))
                AppText(
                    text = "${(slice.value / total * 100).toInt()}%",
                    style = MahalluTheme.type.micro,
                    color = colors.textFaint,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * A horizontal stacked bar — the twelve-month collection summary on the
 * dashboard, and the "paid vs due" bar on a family's subscription card.
 */
@Composable
fun StackedBar(
    segments: List<Pair<Double, Color>>,
    modifier: Modifier = Modifier,
    height: Dp = 10.dp,
) {
    val total = segments.sumOf { it.first }.takeIf { it > 0 } ?: return
    val progress by animateFloatAsState(
        targetValue = 1f,
        animationSpec = Motion.emphasized(800),
        label = "stack-grow",
    )
    val radius = (height / 2)
    Canvas(modifier.fillMaxWidth().height(height)) {
        val full = size.width * progress
        var x = 0f
        segments.forEachIndexed { index, (value, color) ->
            val w = (full * (value / total)).toFloat()
            if (w <= 0f) return@forEachIndexed
            drawRoundRect(
                color = color,
                topLeft = Offset(x, 0f),
                size = Size(w, size.height),
                cornerRadius = CornerRadius(
                    x = if (index == 0 || index == segments.lastIndex) radius.toPx() else 0f,
                    y = radius.toPx(),
                ),
            )
            x += w
        }
    }
}

/** The tiny trend line beside a KPI — six months, no axes, no labels. */
@Composable
fun Sparkline(
    values: List<Double>,
    modifier: Modifier = Modifier,
    color: Color? = null,
) {
    if (values.size < 2) return
    val peak = max(values.max(), 1.0)
    val floor = values.min()
    val span = (peak - floor).takeIf { it > 0 } ?: 1.0
    Canvas(modifier) {
        val step = size.width / (values.size - 1)
        val path = Path()
        values.forEachIndexed { index, value ->
            val x = step * index
            val y = size.height - (size.height * ((value - floor) / span)).toFloat()
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(
            path = path,
            color = tint,
            style = Stroke(width = 1.8.dp.toPx(), cap = StrokeCap.Round),
        )
        drawCircle(
            color = tint,
            radius = 2.4.dp.toPx(),
            center = Offset(
                size.width,
                size.height - (size.height * ((values.last() - floor) / span)).toFloat(),
            ),
        )
    }
}

