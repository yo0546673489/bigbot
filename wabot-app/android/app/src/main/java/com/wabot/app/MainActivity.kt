package com.wabot.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.*
import com.wabot.app.data.Repository
import com.wabot.app.ui.screens.*
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.theme.WabotTheme
import com.wabot.app.ui.viewmodel.HomeViewModel
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var repo: Repository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WabotTheme {
                WabotApp(repo)
            }
        }
    }
}

private data class BottomTab(
    val route: String,
    val label: String,
    val icon: ImageVector
)

private val TABS = listOf(
    BottomTab("home",          "ראשי",   Icons.Default.Home),
    BottomTab("chat",          "צ'אט",   Icons.Default.ChatBubble),
    BottomTab("notifications", "התראות", Icons.Default.Notifications),
    BottomTab("settings",      "הגדרות", Icons.Default.Settings),
    BottomTab("connect",       "חיבור",  Icons.Default.Wifi)
)

@Composable
fun WabotApp(repo: Repository) {
    val navController = rememberNavController()

    val initialRoute = remember {
        val phone = runBlocking { repo.driverPhone.first() }
        if (phone.isNotBlank()) "home" else "connect"
    }

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route

    // Tabs that show bottom nav
    val showBottomNav = currentRoute in TABS.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomNav) {
                NavigationBar(
                    containerColor = BigBotColors.CardBg,
                    tonalElevation = 4.dp
                ) {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo("home") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(
                                    tab.icon,
                                    contentDescription = tab.label,
                                    tint = if (currentRoute == tab.route) BigBotColors.Primary else BigBotColors.TextSecondary
                                )
                            },
                            label = {
                                Text(
                                    tab.label,
                                    color = if (currentRoute == tab.route) BigBotColors.Primary else BigBotColors.TextSecondary
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = BigBotColors.Primary,
                                indicatorColor = BigBotColors.PrimaryBg
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        val homeViewModel: HomeViewModel = hiltViewModel()

        NavHost(
            navController = navController,
            startDestination = initialRoute,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("connect") {
                ConnectScreen(
                    onConnected = {
                        navController.navigate("home") {
                            popUpTo("connect") { inclusive = true }
                        }
                    }
                )
            }

            composable("home") {
                HomeScreen(viewModel = homeViewModel)
            }

            composable("chat") {
                ChatScreen(viewModel = homeViewModel)
            }

            composable("notifications") {
                NotificationsScreen(
                    viewModel = homeViewModel,
                    onOpenChat = {
                        navController.navigate("chat") {
                            launchSingleTop = true
                        }
                    }
                )
            }

            composable("settings") {
                SettingsScreen()
            }
        }
    }
}
