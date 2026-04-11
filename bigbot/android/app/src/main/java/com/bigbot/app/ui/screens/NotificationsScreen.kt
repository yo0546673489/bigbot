package com.bigbot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.bigbot.app.data.models.AppNotification
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.NotificationsViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel = hiltViewModel(),
    onOpenChat: () -> Unit
) {
    val notifications by viewModel.notifications.collectAsState()
    val locationPopup by viewModel.locationPopup.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(PageBg)) {
        // Header
        Box(
            modifier = Modifier.fillMaxWidth().background(CardBg)
                .statusBarsPadding()
                .padding(horizontal = 18.dp, vertical = 14.dp)
        ) {
            Column {
                Text("התראות", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = GreenDark)
                val count = notifications.size
                Text(if (count > 0) "$count חדשות" else "אין התראות חדשות", fontSize = 12.sp, color = TextSecondary)
            }
        }
        HorizontalDivider(color = Border, thickness = 0.5.dp)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // Smart location popup
            locationPopup?.let { city ->
                item {
                    LocationPopupCard(
                        city = city,
                        onAccept = { viewModel.acceptLocationUpdate(city) },
                        onDismiss = { viewModel.dismissLocationPopup() }
                    )
                }
            }

            if (notifications.isEmpty() && locationPopup == null) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 64.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Notifications, null,
                                modifier = Modifier.size(56.dp), tint = Color(0xFFCFD8DC))
                            Spacer(Modifier.height(12.dp))
                            Text("אין התראות חדשות", fontSize = 16.sp, color = TextSecondary)
                        }
                    }
                }
            }

            items(notifications, key = { it.id }) { notif ->
                NotificationCard(
                    notif = notif,
                    onOpenChat = onOpenChat,
                    onTakeRide = { viewModel.takeRide(notif) },
                    onCancel = { viewModel.cancelAutoRide(notif) },
                    onDismiss = { viewModel.dismissNotification(notif.id) }
                )
            }
        }
    }
}

@Composable
fun LocationPopupCard(city: String, onAccept: () -> Unit, onDismiss: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = GreenBg),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFA5D6A7)),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("📍 עברת לאזור $city", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = GreenDark)
            Spacer(Modifier.height(4.dp))
            Text("לעדכן מצב פנוי?", fontSize = 11.sp, color = Color(0xFF558B2F))
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onAccept, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                    shape = RoundedCornerShape(12.dp)
                ) { Text("כן, עדכן", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                OutlinedButton(
                    onClick = onDismiss, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, Primary),
                    shape = RoundedCornerShape(12.dp)
                ) { Text("לא עכשיו", fontSize = 12.sp) }
            }
        }
    }
}

@Composable
fun NotificationCard(
    notif: AppNotification,
    onOpenChat: () -> Unit,
    onTakeRide: () -> Unit,
    onCancel: () -> Unit,
    onDismiss: () -> Unit
) {
    val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(notif.timestamp))

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, Border),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Icon
            val (icon, iconBg) = when (notif.type) {
                "ride_taken" -> "✔" to GreenBg
                "auto_taken" -> "⚡" to PurpleBg
                "new_match" -> "🚗" to BlueBg
                "missed" -> "⚠" to RedBg
                "wa_status" -> "🔗" to GreenBg
                else -> "ℹ" to GreenBg
            }
            Box(
                modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(iconBg),
                contentAlignment = Alignment.Center
            ) {
                Text(icon, fontSize = 16.sp)
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(notif.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                Text(notif.body, fontSize = 10.sp, color = TextSecondary)

                // Action buttons
                when (notif.type) {
                    "ride_taken" -> {
                        Spacer(Modifier.height(6.dp))
                        SmallButton("פתח צ'אט", Primary) { onOpenChat() }
                    }
                    "auto_taken" -> {
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SmallButton("פתח צ'אט", Purple) { onOpenChat() }
                            SmallOutlineButton("בטל", Purple) { onCancel() }
                        }
                    }
                    "new_match" -> {
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SmallButton("קח נסיעה", Blue) { onTakeRide() }
                            SmallOutlineButton("דחה", Blue) { onDismiss() }
                        }
                    }
                }

                Spacer(Modifier.height(3.dp))
                Text(timeStr, fontSize = 8.sp, color = Color(0xFFB0BEC5))
            }
        }
    }
}

@Composable
fun SmallButton(text: String, color: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 5.dp),
        modifier = Modifier.height(28.dp)
    ) {
        Text(text, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun SmallOutlineButton(text: String, color: Color, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
        border = androidx.compose.foundation.BorderStroke(1.dp, color),
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 5.dp),
        modifier = Modifier.height(28.dp)
    ) {
        Text(text, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}
