package app.minzmahallu.ui.shell

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.minzmahallu.core.common.Route
import app.minzmahallu.core.ui.component.IconPlate
import app.minzmahallu.core.ui.component.NavItem
import app.minzmahallu.core.ui.component.Pill
import app.minzmahallu.core.ui.foundation.AppText
import app.minzmahallu.core.ui.foundation.AuroraBackground
import app.minzmahallu.core.ui.foundation.Eyebrow
import app.minzmahallu.core.ui.foundation.animatePressScale
import app.minzmahallu.core.ui.foundation.pressHighlight
import app.minzmahallu.core.ui.foundation.rememberPressState
import app.minzmahallu.core.ui.theme.MahalluTheme
import app.minzmahallu.core.ui.theme.Motion
import app.minzmahallu.core.ui.theme.ModuleTint
import app.minzmahallu.core.ui.theme.Shapes
import app.minzmahallu.core.ui.theme.tint
import app.minzmahallu.core.ui.theme.tintBed

/**
 * The navigation table.
 *
 * Grouped the way the desktop sidebar groups it — People, Money, Registers,
 * Office — so an operator who knows the PC app finds everything where they
 * expect, even though the phone renders it as a drawer instead of a rail.
 */
object Navigation {

    val people = listOf(
        NavItem(Route.Families.path, "Families", "കുടുംബങ്ങൾ", ModuleTint.Teal, "F"),
        NavItem(Route.Members.path, "Members", "അംഗങ്ങൾ", ModuleTint.Cyan, "M"),
        NavItem(Route.Staff.path, "Staff", "ജീവനക്കാർ", ModuleTint.Blue, "S"),
        NavItem(Route.Committee.path, "Committee", "കമ്മിറ്റി", ModuleTint.Violet, "C"),
    )

    val money = listOf(
        NavItem(Route.Subscriptions.path, "Subscriptions", "വരിസംഖ്യ", ModuleTint.Green, "₹"),
        NavItem(Route.Donations.path, "Donations", "സംഭാവന", ModuleTint.Gold, "D"),
        NavItem(Route.Accounting.path, "Accounting", "അക്കൗണ്ടിംഗ്", ModuleTint.Sky, "A"),
        NavItem(Route.Welfare.path, "Welfare", "ക്ഷേമം", ModuleTint.Rose, "W"),
        NavItem(Route.Assets.path, "Assets", "ആസ്തികൾ", ModuleTint.Blue, "T"),
    )

    val registers = listOf(
        NavItem(Route.Marriages.path, "Marriages", "വിവാഹങ്ങൾ", ModuleTint.Rose, "N"),
        NavItem(Route.Deaths.path, "Deaths", "മരണങ്ങൾ", ModuleTint.Violet, "X"),
        NavItem(Route.Certificates.path, "Certificates", "സർട്ടിഫിക്കറ്റ്", ModuleTint.Gold, "R"),
        NavItem(Route.Tokens.path, "Tokens", "ടോക്കണുകൾ", ModuleTint.Cyan, "K"),
    )

    val office = listOf(
        NavItem(Route.Approvals.path, "Approvals", "അംഗീകാരം", ModuleTint.Gold, "!"),
        NavItem(Route.Reports.path, "Reports", "റിപ്പോർട്ടുകൾ", ModuleTint.Sky, "P"),
        NavItem(Route.WhatsApp.path, "WhatsApp", "വാട്ട്‌സ്ആപ്പ്", ModuleTint.Green, "W"),
        NavItem(Route.Users.path, "Users", "ഉപയോക്താക്കൾ", ModuleTint.Blue, "U"),
        NavItem(Route.Audit.path, "Audit Log", "ഓഡിറ്റ് ലോഗ്", ModuleTint.Violet, "L"),
        NavItem(Route.Backup.path, "Backup", "ബാക്കപ്പ്", ModuleTint.Teal, "B"),
        NavItem(Route.Settings.path, "Settings", "ക്രമീകരണം", ModuleTint.Teal, "•"),
    )

    val sections: List<Pair<String, List<NavItem>>> = listOf(
        "People" to people,
        "Money" to money,
        "Registers" to registers,
        "Office" to office,
    )

    /** The nine modules that fill the Home grid — the ones used every day. */
    val home: List<NavItem> = listOf(
        people[0], people[1], money[0], money[1],
        money[2], registers[3], registers[2], office[0], money[3],
    )

    fun itemFor(route: String): NavItem? =
        sections.flatMap { it.second }.firstOrNull { it.route == route }

    fun allNavItems(): List<NavItem> =
        sections.flatMap { it.second }
}

/**
 * The drawer's module list.
 *
 * Drawn by hand rather than with a Material `ModalNavigationDrawer`: the item
 * is a tinted plate with a sliding selection bar, and the section headers use
 * the app's eyebrow style rather than a list subheader.
 */
@Composable
fun ModuleDrawer(
    currentRoute: String?,
    pendingApprovals: Int,
    malayalam: Boolean,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MahalluTheme.colors
    Column(
        modifier
            .fillMaxHeight()
            .background(colors.surface)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(vertical = 14.dp),
    ) {
        Navigation.sections.forEach { (section, items) ->
            Eyebrow(
                text = section,
                modifier = Modifier.padding(start = 24.dp, top = 16.dp, bottom = 8.dp),
            )
            items.forEach { item ->
                val badge = if (item.route == Route.Approvals.path) pendingApprovals else item.badge
                DrawerItem(
                    item = item,
                    selected = currentRoute == item.route,
                    badge = badge,
                    malayalam = malayalam,
                    onClick = { onNavigate(item.route) },
                )
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun DrawerItem(
    item: NavItem,
    selected: Boolean,
    badge: Int,
    malayalam: Boolean,
    onClick: () -> Unit,
) {
    val colors = MahalluTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val press = rememberPressState(interaction)
    val scale = animatePressScale(press.pressed, held = 0.97f)
    val barWidth by animateDpAsState(
        targetValue = if (selected) 22.dp else 0.dp,
        animationSpec = Motion.springy(),
        label = "drawer-bar",
    )
    val background by animateColorAsState(
        targetValue = if (selected) colors.tintBed(item.tint) else colors.surface,
        animationSpec = Motion.emphasized(240),
        label = "drawer-bg",
    )
    val shape = RoundedCornerShape(0.dp, 18.dp, 18.dp, 0.dp)

    Row(
        Modifier
            .fillMaxWidth()
            .scale(scale)
            .clip(shape)
            .background(background)
            .pressHighlight(press, shape, colors.tint(item.tint))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(start = 0.dp, end = 16.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .width(3.dp)
                .height(30.dp)
                .background(
                    if (barWidth > 0.dp) colors.tint(item.tint) else colors.surface,
                ),
        )
        Spacer(Modifier.width(12.dp))
        IconPlate(tint = item.tint, size = 34.dp) {
            AppText(
                text = item.glyph,
                style = MahalluTheme.type.bodyStrong,
                color = colors.tint(item.tint),
                maxLines = 1,
            )
        }
        Spacer(Modifier.width(12.dp))
        AppText(
            text = if (malayalam) item.titleMl else item.title,
            style = MahalluTheme.type.bodyStrong,
            color = if (selected) colors.textPrimary else colors.textSecondary,
            modifier = Modifier.weight(1f),
            maxLines = 1,
        )
        if (badge > 0) {
            Pill(text = badge.toString(), color = colors.gold)
        }
    }
}

/**
 * The drawer's header: the mahallu's name and the signed-in operator.
 */
