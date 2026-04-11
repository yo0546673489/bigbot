package com.bigbot.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.bigbot.app.ui.theme.*

data class NavItem(val route: String, val label: String, val icon: ImageVector)

val navItems = listOf(
    NavItem("home", "ראשי", Icons.Default.Home),
    NavItem("chat", "צ'אט", Icons.AutoMirrored.Filled.Chat),
    NavItem("search", "חיפוש", Icons.Default.Search),
    NavItem("notifications", "התראות", Icons.Default.Notifications),
    NavItem("settings", "הגדרות", Icons.Default.Settings),
)

@Composable
fun BigBotBottomBar(currentRoute: String, onNavigate: (String) -> Unit) {
    NavigationBar(
        containerColor = CardBg,
        tonalElevation = 0.dp,
    ) {
        navItems.forEach { item ->
            val selected = item.route == currentRoute
            NavigationBarItem(
                selected = selected,
                onClick = { onNavigate(item.route) },
                icon = { Icon(item.icon, contentDescription = item.label) },
                label = { Text(item.label, style = MaterialTheme.typography.labelSmall) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Primary,
                    selectedTextColor = Primary,
                    indicatorColor = GreenBg,
                    unselectedIconColor = TextSecondary,
                    unselectedTextColor = TextSecondary
                )
            )
        }
    }
}
