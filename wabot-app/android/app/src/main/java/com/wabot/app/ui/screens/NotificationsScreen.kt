package com.wabot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.data.models.AppNotification
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.viewmodel.HomeViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun NotificationsScreen(
    viewModel: HomeViewModel,
    onOpenChat: () -> Unit = {}
) {
    val notifications by viewModel.notifications.collectAsState()
    val smartLocationCity by viewModel.smartLocationCity.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(BigBotColors.PageBg)) {

        // Header
        Surface(color = BigBotColors.CardBg, shadowElevation = 2.dp) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("התראות", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
                if (notifications.any { !it.read }) {
                    Surface(shape = CircleShape, color = BigBotColors.Red) {
                        Text(
                            "${notifications.count { !it.read }}",
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            fontSize = 11.sp,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // Smart location popup
        if (smartLocationCity != null) {
            SmartLocationBanner(
                city = smartLocationCity!!,
                onConfirm = { viewModel.confirmSmartLocation(smartLocationCity!!) },
                onDismiss = { viewModel.dismissSmartLocation() }
            )
        }

        // Notifications list
        if (notifications.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text("🔔", fontSize = 52.sp)
                    Text("אין התראות", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
                    Text(
                        "התראות על נסיעות ואירועים יופיעו כאן",
                        fontSize = 13.sp,
                        color = BigBotColors.TextSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 40.dp)
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(notifications, key = { it.id }) { notification ->
                    NotificationCard(
                        notification = notification,
                        onOpenChat = onOpenChat,
                        onCancelAuto = { viewModel.cancelAutoRide(notification.rideId) },
                        onTakeRide = { viewModel.takeRideFromNotification(notification.rideId) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SmartLocationBanner(
    city: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = BigBotColors.PrimaryBg,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("📍", fontSize = 18.sp)
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("עברת לאזור $city", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
                Text("לעדכן מצב פנוי?", fontSize = 11.sp, color = BigBotColors.TextSecondary)
            }
            TextButton(
                onClick = onDismiss,
                colors = ButtonDefaults.textButtonColors(contentColor = BigBotColors.TextSecondary)
            ) { Text("לא עכשיו", fontSize = 12.sp) }
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.height(34.dp)
            ) { Text("כן, עדכן", fontSize = 12.sp, color = Color.White) }
        }
    }
}

@Composable
private fun NotificationCard(
    notification: AppNotification,
    onOpenChat: () -> Unit,
    onCancelAuto: () -> Unit,
    onTakeRide: () -> Unit
) {
    val (icon, iconColor) = when (notification.type) {
        "ride_taken"  -> "✔" to BigBotColors.Primary
        "auto_taken"  -> "⚡" to BigBotColors.Purple
        "new_ride"    -> "🚗" to BigBotColors.Blue
        "missed"      -> "⚠" to BigBotColors.Red
        "wa_status"   -> "🔗" to BigBotColors.Primary
        else          -> "●" to BigBotColors.TextSecondary
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (notification.read) BigBotColors.CardBg else BigBotColors.PrimaryBg
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (notification.read) 1.dp else 2.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                // Icon circle
                Surface(
                    shape = CircleShape,
                    color = iconColor.copy(alpha = 0.12f),
                    modifier = Modifier.size(36.dp)
                ) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(icon, fontSize = 16.sp)
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(notification.title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
                    if (notification.body.isNotBlank()) {
                        Text(notification.body, fontSize = 12.sp, color = BigBotColors.TextSecondary, lineHeight = 17.sp)
                    }
                }

                Text(
                    formatNotifTime(notification.timestamp),
                    fontSize = 10.sp,
                    color = BigBotColors.TextSecondary
                )
            }

            // Action buttons per type
            when (notification.type) {
                "ride_taken" -> {
                    Button(
                        onClick = onOpenChat,
                        colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary),
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                        modifier = Modifier.height(34.dp)
                    ) { Text("💬 פתח צ'אט", fontSize = 12.sp, color = Color.White) }
                }
                "auto_taken" -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onOpenChat,
                            colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                            modifier = Modifier.weight(1f).height(34.dp)
                        ) { Text("💬 פתח צ'אט", fontSize = 12.sp, color = Color.White) }
                        OutlinedButton(
                            onClick = onCancelAuto,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = BigBotColors.Red),
                            border = androidx.compose.foundation.BorderStroke(1.dp, BigBotColors.Red),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            modifier = Modifier.height(34.dp)
                        ) { Text("✕ בטל", fontSize = 12.sp) }
                    }
                }
                "new_ride" -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onTakeRide,
                            colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Blue),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                            modifier = Modifier.weight(1f).height(34.dp)
                        ) { Text("קח נסיעה", fontSize = 12.sp, color = Color.White) }
                        OutlinedButton(
                            onClick = { /* dismiss — no action needed */ },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = BigBotColors.TextSecondary),
                            border = androidx.compose.foundation.BorderStroke(1.dp, BigBotColors.Border),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            modifier = Modifier.height(34.dp)
                        ) { Text("דחה", fontSize = 12.sp) }
                    }
                }
            }
        }
    }
}

private fun formatNotifTime(ts: Long): String {
    if (ts == 0L) return ""
    val diff = System.currentTimeMillis() - ts
    return when {
        diff < 60_000 -> "הרגע"
        diff < 3_600_000 -> "${diff / 60_000}ד'"
        diff < 86_400_000 -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ts))
        else -> SimpleDateFormat("dd/MM", Locale.getDefault()).format(Date(ts))
    }
}
