package com.bigbot.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.bigbot.app.data.ChatStore
import com.bigbot.app.data.Repository
import com.bigbot.app.data.RideForegroundService
import com.bigbot.app.ui.components.BigBotBottomBar
import com.bigbot.app.ui.screens.*
import com.bigbot.app.ui.theme.BigBotTheme
import com.bigbot.app.viewmodel.ChatViewModel
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var chatStore: ChatStore
    @Inject lateinit var repo: Repository

    // On Android 13+ we must ask for POST_NOTIFICATIONS before we can show
    // ride push notifications from the foreground service.
    private val notifPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        // Whether or not the user granted, start the service — if denied
        // the service still runs but only the persistent foreground notif
        // will be visible (no ride pop-ups).
        startRideForegroundService()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ensureNotificationPermissionThenStartService()
        setContent {
            BigBotTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    val registered by repo.registered.collectAsState(initial = null)
                    when (registered) {
                        null -> {
                            // Loading prefs — show nothing rather than flashing
                            // the wrong screen.
                        }
                        true -> BigBotApp(chatStore)
                        false -> OnboardingScreen(onFinished = {
                            // After registration the Composable recomposes via
                            // the `registered` flow update — no manual nav needed.
                        })
                    }
                }
            }
        }
    }

    private fun ensureNotificationPermissionThenStartService() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                return
            }
        }
        startRideForegroundService()
    }

    private fun startRideForegroundService() {
        val intent = Intent(this, RideForegroundService::class.java)
        ContextCompat.startForegroundService(this, intent)
    }
}

@Composable
fun BigBotApp(chatStore: ChatStore) {
    val navController = rememberNavController()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route ?: "home"
    val tabs = listOf("home", "search", "chat", "notifications", "settings")
    val chatViewModel: ChatViewModel = hiltViewModel()

    // When the dispatcher's first reply lands and triggers an auto-open,
    // navigate to the chat tab automatically.
    LaunchedEffect(Unit) {
        chatStore.autoOpenChatRequests.collect {
            navController.navigate("chat") {
                popUpTo(navController.graph.startDestinationId) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            if (currentRoute in tabs) {
                BigBotBottomBar(currentRoute = currentRoute) { route ->
                    // Tapping the chat tab always returns to the conversation list
                    if (route == "chat") {
                        chatViewModel.closeConversation()
                    }
                    if (route != currentRoute) {
                        navController.navigate(route) {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("home") {
                HomeScreen(
                    onNavigateToChat = {
                        navController.navigate("chat") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    viewModel = hiltViewModel()
                )
            }
            composable("search") {
                SearchScreen()
            }
            composable("chat") {
                ChatScreen(viewModel = hiltViewModel())
            }
            composable("notifications") {
                NotificationsScreen(
                    viewModel = hiltViewModel(),
                    onOpenChat = { navController.navigate("chat") }
                )
            }
            composable("settings") {
                SettingsScreen(viewModel = hiltViewModel())
            }
        }
    }
}
