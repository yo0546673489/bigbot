package com.wabot.app.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.data.models.Ride
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.viewmodel.ButtonState

@Composable
fun RideCard(
    ride: Ride,
    getButtonState: (String) -> ButtonState,
    onAction: (String) -> Unit
) {
    val context = LocalContext.current

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(0.5.dp, BigBotColors.Border),
        colors = CardDefaults.cardColors(containerColor = BigBotColors.CardBg),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {

            // Header row: timestamp + urgent badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Surface(shape = CircleShape, color = BigBotColors.PrimaryBg) {
                        Text(
                            "● עכשיו",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            fontSize = 10.sp, color = BigBotColors.Primary, fontWeight = FontWeight.Bold
                        )
                    }
                    if (ride.isUrgent) {
                        Surface(shape = RoundedCornerShape(8.dp), color = Color(0xFFFFEBEE)) {
                            Text(
                                "🔴 דחוף",
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                fontSize = 10.sp, color = BigBotColors.Red, fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Text(
                    text = ride.groupName.take(18),
                    fontSize = 11.sp,
                    color = BigBotColors.TextSecondary
                )
            }

            // Route row: Origin → Destination + Waze
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = buildRoute(ride),
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = BigBotColors.TextPrimary
                    )
                    if (ride.price.isNotEmpty()) {
                        Text(
                            "${ride.price} ₪",
                            fontSize = 13.sp,
                            color = BigBotColors.Primary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                // Waze button
                if (ride.destination.isNotEmpty()) {
                    IconButton(
                        onClick = {
                            val uri = Uri.parse("https://waze.com/ul?q=${Uri.encode(ride.destination)}")
                            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                        },
                        modifier = Modifier.size(36.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = BigBotColors.Waze
                        ) {
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text("🔺", fontSize = 14.sp)
                            }
                        }
                    }
                }
            }

            // Message body
            val displayBody = ride.bodyClean.ifEmpty { ride.body }
            if (displayBody.isNotBlank()) {
                Text(
                    text = displayBody.take(160),
                    fontSize = 13.sp,
                    color = BigBotColors.TextSecondary,
                    lineHeight = 19.sp
                )
            }

            // Link ride indicator
            if (ride.hasLink) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF3E8FF)
                ) {
                    Text(
                        "🔗 נסיעה עם קישור",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        fontSize = 11.sp, color = BigBotColors.Purple, fontWeight = FontWeight.Medium
                    )
                }
            }

            // Sender + time
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(ride.senderName, fontSize = 11.sp, color = BigBotColors.TextSecondary)
                Spacer(Modifier.weight(1f))
                Text(formatTime(ride.timestamp), fontSize = 10.sp, color = Color(0xFFB0BEC5))
            }

            Divider(color = BigBotColors.Border, thickness = 0.5.dp)

            // Action buttons
            if (ride.hasLink) {
                // Link ride: big "קח את הנסיעה" + small "ת"
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ActionButton(
                        label = "⚡ קח את הנסיעה",
                        color = BigBotColors.Purple,
                        state = getButtonState("take_ride_link"),
                        modifier = Modifier.weight(1f),
                        onClick = { onAction("take_ride_link") }
                    )
                    ActionButton(
                        label = "ת",
                        color = BigBotColors.Primary,
                        state = getButtonState("reply_group"),
                        modifier = Modifier.width(44.dp),
                        onClick = { onAction("reply_group") }
                    )
                }
            } else {
                // Regular ride: 3 action buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    ActionButton(
                        label = "ת לקבוצה",
                        color = BigBotColors.Primary,
                        state = getButtonState("reply_group"),
                        modifier = Modifier.weight(1f),
                        onClick = { onAction("reply_group") }
                    )
                    ActionButton(
                        label = "ת לפרטי",
                        color = BigBotColors.Blue,
                        state = getButtonState("reply_private"),
                        modifier = Modifier.weight(1f),
                        onClick = { onAction("reply_private") }
                    )
                    ActionButton(
                        label = "ת לשניהם",
                        color = BigBotColors.Purple,
                        state = getButtonState("reply_both"),
                        modifier = Modifier.weight(1f),
                        onClick = { onAction("reply_both") }
                    )
                }
            }
        }
    }
}

private fun buildRoute(ride: Ride): String {
    return if (ride.destination.isNotEmpty()) {
        "${ride.origin} ← ${ride.destination}"
    } else {
        ride.origin
    }
}

private fun formatTime(timestamp: Long): String {
    if (timestamp == 0L) return ""
    val diff = System.currentTimeMillis() / 1000 - timestamp
    return when {
        diff < 60 -> "הרגע"
        diff < 3600 -> "${diff / 60}ד'"
        else -> "${diff / 3600}ש'"
    }
}
