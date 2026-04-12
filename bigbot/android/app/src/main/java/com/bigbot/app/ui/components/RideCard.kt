package com.bigbot.app.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bigbot.app.R
import com.bigbot.app.data.models.Ride
import com.bigbot.app.data.models.RideUiState
import com.bigbot.app.ui.theme.*
import com.bigbot.app.util.RideTextParser

@Composable
fun RideCard(
    ride: Ride,
    sentButtons: Set<String> = emptySet(),
    onAction: (String) -> Unit,
    onNavigateToChat: (phone: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val borderColor = if (ride.isUrgent) AppRed else Primary

    Card(
        modifier = modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFE0F2E9)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(modifier = Modifier.height(IntrinsicSize.Min)) {
            // פס ירוק בצד (RTL → ימין ויזואלית)
            Box(
                modifier = Modifier.width(3.dp).fillMaxHeight().background(borderColor)
            )
            Column(modifier = Modifier.weight(1f).padding(horizontal = 10.dp, vertical = 5.dp)) {
                when (ride.uiState) {
                    RideUiState.SENDING -> {
                        StatusBar("⏳ שולח הודעה...", BlueBg, Blue)
                    }
                    RideUiState.WAITING_DISPATCHER -> {
                        StatusBar("⌛ ממתין לתשובת הסדרן...", OrangeBg, AppOrange)
                    }
                    RideUiState.SUCCESS -> {
                        SuccessCard(ride, onNavigateToChat, onAction)
                        return@Column
                    }
                    RideUiState.AUTO_SUCCESS -> {
                        AutoSuccessCard(ride, onNavigateToChat, onAction)
                        return@Column
                    }
                    RideUiState.AUTO_PENDING -> {
                        AutoPendingCard(ride)
                        return@Column
                    }
                    RideUiState.FAILED -> {
                        FailedCard(onAction = { onAction("retry") })
                        return@Column
                    }
                    RideUiState.IDLE -> {
                        // ✨ פרסר — חילוץ מחיר/רחוב/תגיות
                        val parsed = remember(ride.messageId, ride.rawText) {
                            RideTextParser.parse(ride.rawText, ride.origin, ride.destination)
                        }

                        // Top row: badge + group name
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (ride.isUrgent) {
                                Badge("🔴 דחוף", AppRed, RedBg)
                            } else {
                                val label = if (ride.minutesAgo > 0) "${ride.minutesAgo} דק'" else "● עכשיו"
                                Badge(label, GreenDark, GreenBg)
                            }
                            Text(ride.groupName, fontSize = 10.sp, color = Color(0xFFB0BEC5))
                        }

                        // Internal ride / Round-trip badges
                        if (ride.isInternalRide || ride.isRoundTrip) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                if (ride.isInternalRide) {
                                    Badge("🏙️ פנימי", Color(0xFF1565C0), Color(0xFFE3F2FD))
                                }
                                if (ride.isRoundTrip) {
                                    Badge("🔄 הלוך ושוב", Color(0xFF6A1B9A), Color(0xFFF3E5F5))
                                }
                            }
                        }

                        Spacer(Modifier.height(4.dp))

                        // Route section: origin / visual / destination
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Origin (right side in RTL)
                            Column(
                                modifier = Modifier.weight(1f),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    fullCityName(ride.origin).ifBlank { ride.origin },
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = GreenDark
                                )
                            }

                            // Visual line in middle
                            Box(
                                modifier = Modifier.width(75.dp).height(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Box(
                                        modifier = Modifier.size(10.dp).clip(CircleShape).background(GreenDark)
                                    )
                                    Box(
                                        modifier = Modifier.weight(1f).height(2.dp).background(GreenDark)
                                    )
                                    Box(
                                        modifier = Modifier.size(10.dp).clip(CircleShape).background(GreenDark)
                                    )
                                }
                                Text(
                                    "<",
                                    fontSize = 13.sp,
                                    color = GreenDark,
                                    fontWeight = FontWeight.Bold,
                                    style = androidx.compose.ui.text.TextStyle(
                                        textDirection = androidx.compose.ui.text.style.TextDirection.Ltr
                                    ),
                                    modifier = Modifier
                                        .background(CardBg)
                                        .padding(horizontal = 3.dp)
                                )
                            }

                            // Destination (left side in RTL)
                            Column(
                                modifier = Modifier.weight(1f),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    fullCityName(ride.destination).ifBlank { ride.destination },
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = GreenDark
                                )
                            }
                        }

                        Spacer(Modifier.height(4.dp))

                        // Info row: price + dot + seats + dot + type
                        run {
                            // Prefer the seat count parsed from the vehicle keyword
                            // (e.g. "מיניק" → 6) over the server-provided seats and
                            // the 4-seat default.
                            val seatsText = when {
                                parsed.vehicleSeats.isNotEmpty() -> "${parsed.vehicleSeats} מקומות"
                                ride.seats.isNotEmpty() -> "${ride.seats} מקומות"
                                else -> "4 מקומות"
                            }
                            // If a vehicle keyword was detected (מיניק / מיניבוס /
                            // ויטו / ספיישל / רכב גדול / ...) display it instead of
                            // the generic "רגיל" tag.
                            val typeText = parsed.vehicleType.ifEmpty { "רגיל" }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (parsed.price.isNotEmpty()) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(GreenBg)
                                            .padding(horizontal = 12.dp, vertical = 3.dp)
                                    ) {
                                        Text(
                                            "${parsed.price} \u20AA",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = GreenDark
                                        )
                                    }
                                    Spacer(Modifier.width(6.dp))
                                    Box(modifier = Modifier.size(3.dp).clip(CircleShape).background(Color(0xFFB0BEC5)))
                                    Spacer(Modifier.width(6.dp))
                                }
                                Text(
                                    seatsText,
                                    fontSize = 11.sp,
                                    color = Color(0xFF546E7A),
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(Modifier.width(6.dp))
                                Box(modifier = Modifier.size(3.dp).clip(CircleShape).background(Color(0xFFB0BEC5)))
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    typeText,
                                    fontSize = 11.sp,
                                    color = Color(0xFF546E7A),
                                    fontWeight = FontWeight.Medium
                                )
                            }
                            Spacer(Modifier.height(2.dp))
                        }

                        // Address row: רחוב ממורכז, Waze בקצה השמאלי
                        if (parsed.street.isNotEmpty() || ride.destination.isNotEmpty()) {
                            Box(
                                modifier = Modifier.fillMaxWidth().heightIn(min = 30.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                // Show street only if it's a real street, not a city name
                                val isRealStreet = parsed.street.isNotEmpty() &&
                                    parsed.street != ride.origin &&
                                    parsed.street != ride.destination &&
                                    parsed.street != fullCityName(ride.origin) &&
                                    parsed.street != fullCityName(ride.destination) &&
                                    parsed.street.trim() != "פנימי" &&
                                    parsed.street.trim() != "פ"
                                if (isRealStreet) {
                                    val addrText = buildString {
                                        append("\uD83D\uDCCD ")
                                        append(parsed.street)
                                        if (parsed.streetNumber.isNotEmpty()) {
                                            append(" ")
                                            append(parsed.streetNumber)
                                        }
                                    }
                                    Text(
                                        addrText,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF37474F),
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                        modifier = Modifier.fillMaxWidth().align(Alignment.Center)
                                    )
                                }
                                if (ride.destination.isNotEmpty()) {
                                    androidx.compose.foundation.Image(
                                        painter = androidx.compose.ui.res.painterResource(
                                            id = com.bigbot.app.R.drawable.waze_icon
                                        ),
                                        contentDescription = "Waze",
                                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                        modifier = Modifier
                                            .size(42.dp)
                                            .clip(CircleShape)
                                            .align(Alignment.CenterEnd)
                                            .clickable {
                                                // אם יש רחוב — נווט לכתובת המלאה, אחרת לעיר
                                                val query = if (parsed.street.isNotEmpty()) {
                                                    buildString {
                                                        append(parsed.street)
                                                        if (parsed.streetNumber.isNotEmpty()) append(" ${parsed.streetNumber}")
                                                        append(", ${fullCityName(ride.destination).ifBlank { ride.destination }}")
                                                    }
                                                } else {
                                                    fullCityName(ride.destination).ifBlank { ride.destination }
                                                }
                                                val uri = Uri.parse("https://waze.com/ul?q=${Uri.encode(query)}")
                                                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                            }
                                    )
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                        }

                        // Special tags
                        if (parsed.specialTags.isNotEmpty()) {
                            parsed.specialTags.forEach { tag ->
                                Text(
                                    "• $tag",
                                    fontSize = 11.sp,
                                    color = AppOrange,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                        }

                        // ETA badge — real distance + time from driver's location
                        if (ride.etaMinutes > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(PurpleBg)
                                        .padding(horizontal = 12.dp, vertical = 4.dp)
                                ) {
                                    Text(
                                        "🚗 ${ride.etaMinutes} דק' ממיקומך",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Purple
                                    )
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                        }

                        // Buttons — pick layout by message type per spec:
                        //   two_links     → [🚗 בקש נסיעה] [💬 צ'אט עם סדרן]
                        //   single_link   → [⚡ קח את הנסיעה]
                        //   regular_text  → [ת לקבוצה] [ת לפרטי] [ת לשניהם]
                        // Fallback to legacy hasLink check when messageType is empty
                        // (e.g. cached rides from before this update).
                        val effectiveType = when {
                            ride.messageType.isNotBlank() -> ride.messageType
                            ride.hasLink && ride.chatPhone.isNotBlank() -> "two_links"
                            ride.hasLink -> "single_link"
                            else -> "regular_text"
                        }
                        when (effectiveType) {
                            "two_links" -> {
                                val takeSent = sentButtons.contains("${ride.messageId}_take_ride_link")
                                val chatSent = sentButtons.contains("${ride.messageId}_open_chat")
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    BigActionBtn(
                                        if (takeSent) "✓ נשלח" else "🚗 בקש נסיעה",
                                        if (takeSent) Color(0xFF558B2F) else Color(0xFF1565C0),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        onAction("take_ride_link:${ride.linkPhone}:${ride.linkText}")
                                    }
                                    // WhatsApp chat button — green + logo
                                    Button(
                                        onClick = { onAction("open_chat") },
                                        modifier = Modifier.weight(1f).height(34.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = if (chatSent) Color(0xFF558B2F) else Color(0xFF25D366)
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 4.dp)
                                    ) {
                                        if (!chatSent) {
                                            androidx.compose.foundation.Image(
                                                painter = painterResource(id = R.drawable.logo_whatsapp),
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp).clip(CircleShape),
                                                contentScale = ContentScale.Crop
                                            )
                                            Spacer(Modifier.width(4.dp))
                                        }
                                        Text(
                                            if (chatSent) "✓ נשלח" else "צ'אט עם סדרן",
                                            fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1
                                        )
                                    }
                                }
                            }
                            "single_link" -> {
                                val takeSent = sentButtons.contains("${ride.messageId}_take_ride_link")
                                ActionBtn(
                                    if (takeSent) "✓ נשלח" else "⚡ קח את הנסיעה",
                                    if (takeSent) Color(0xFF558B2F) else Purple,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    onAction("take_ride_link:${ride.linkPhone}:${ride.linkText}")
                                }
                            }
                            else -> { // "regular_text"
                                val groupSent = sentButtons.contains("${ride.messageId}_reply_group")
                                val privateSent = sentButtons.contains("${ride.messageId}_reply_private")
                                val bothSent = sentButtons.contains("${ride.messageId}_reply_both")
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    BigActionBtn(if (groupSent) "נשלח ✓" else "ת לקבוצה", GreenDark, modifier = Modifier.weight(1f)) {
                                        onAction("reply_group")
                                    }
                                    BigActionBtn(if (privateSent) "נשלח ✓" else "ת לפרטי", Color(0xFF1565C0), modifier = Modifier.weight(1f)) {
                                        onAction("reply_private")
                                    }
                                    BigActionBtn(if (bothSent) "נשלח ✓" else "ת לשניהם", Color(0xFF5E35B1), modifier = Modifier.weight(1f)) {
                                        onAction("reply_both")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// שמות ערים מלאים מקיצורים
fun fullCityName(code: String): String = when (code) {
    "בב" -> "בני ברק"
    "ים" -> "ירושלים"
    "תא" -> "תל אביב"
    "פת" -> "פתח תקווה"
    "שמש" -> "בית שמש"
    "ספר" -> "מודיעין עילית"
    "נת" -> "נתניה"
    "אש" -> "אשדוד"
    "ב\"ש", "באר שבע" -> "באר שבע"
    else -> code
}

@Composable
fun StatusBar(text: String, bg: Color, textColor: Color) {
    Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(bg)
        .padding(10.dp), contentAlignment = Alignment.Center) {
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = textColor)
    }
}

@Composable
fun SuccessCard(ride: Ride, onNavigateToChat: (phone: String) -> Unit, onAction: (String) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text("✅", fontSize = 28.sp)
        Spacer(Modifier.height(4.dp))
        Text("קיבלת את הנסיעה!", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = GreenDark)
        if (ride.dispatcherName.isNotEmpty()) {
            Text("הסדרן ${ride.dispatcherName} מדבר איתך בפרטי",
                fontSize = 11.sp, color = Color(0xFF558B2F))
        }
        Spacer(Modifier.height(4.dp))
        val routeText = buildString {
            if (ride.origin.isNotEmpty()) append("${ride.origin} ← ${ride.destination}")
            if (ride.price.isNotEmpty()) append(" • ${ride.price}\u20AA")
        }
        Text(routeText, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Primary)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // WhatsApp chat button — ימין
            Button(
                onClick = { onNavigateToChat(ride.dispatcherPhone) },
                modifier = Modifier.weight(1f).height(42.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366)),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 8.dp)
            ) {
                androidx.compose.foundation.Image(
                    painter = painterResource(id = R.drawable.logo_whatsapp),
                    contentDescription = null,
                    modifier = Modifier.size(22.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
                Spacer(Modifier.width(5.dp))
                Text("פתח צ'אט", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            // Waze button — שמאל
            if (ride.destination.isNotEmpty()) {
                val context = LocalContext.current
                Button(
                    onClick = {
                        val uri = Uri.parse("https://waze.com/ul?q=${Uri.encode(ride.destination)}")
                        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                    },
                    modifier = Modifier.weight(1f).height(42.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Waze),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp)
                ) {
                    androidx.compose.foundation.Image(
                        painter = painterResource(id = R.drawable.logo_waze),
                        contentDescription = null,
                        modifier = Modifier.size(22.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                    Spacer(Modifier.width(5.dp))
                    Text("נווט עכשיו", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
            }
        }
    }
}

@Composable
fun AutoPendingCard(ride: Ride) {
    Column(modifier = Modifier.fillMaxWidth()) {
        // Top row: badge + group
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Badge("⚡ אוטומטי", Purple, PurpleBg)
            Text(ride.groupName, fontSize = 10.sp, color = TextSecondary)
        }
        Spacer(Modifier.height(8.dp))

        // Route line
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(ride.origin, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                color = TextPrimary, modifier = Modifier.weight(1f))
            Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(Primary))
            Box(
                modifier = Modifier.weight(1f).height(2.dp)
                    .background(Brush.horizontalGradient(listOf(Primary, AppRed)))
            )
            Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(AppRed))
        }
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text(ride.destination, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                color = TextPrimary)
        }

        // ✨ פרטי נסיעה (מחיר/רחוב/תגיות)
        Spacer(Modifier.height(6.dp))
        val parsed = remember(ride.messageId, ride.rawText) {
            RideTextParser.parse(ride.rawText, ride.origin, ride.destination)
        }
        RideInfoBlock(parsed)

        Spacer(Modifier.height(10.dp))

        // Status banner: "נשלחה בקשה — ממתינה לאישור"
        Box(
            modifier = Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(PurpleBg)
                .padding(12.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("⚡ נשלחה בקשה", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Purple)
                Text("ממתינה לאישור", fontSize = 11.sp, color = Purple)
            }
        }
    }
}

@Composable
fun AutoSuccessCard(ride: Ride, onNavigateToChat: (phone: String) -> Unit, onAction: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text("⚡ נלקח אוטומטית", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Purple)
        val info = buildString {
            if (ride.origin.isNotEmpty()) append("${ride.origin} ← ${ride.destination}")
            if (ride.price.isNotEmpty()) append(" • ${ride.price}\u20AA")
        }
        Text(info, fontSize = 11.sp, color = Color(0xFF7E57C2))
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ActionBtn("💬 פתח צ'אט", Purple, modifier = Modifier.weight(1f)) { onNavigateToChat(ride.dispatcherPhone) }
            OutlineBtn("✕ בטל", Purple, modifier = Modifier.weight(1f)) { onAction("cancel_auto") }
        }
    }
}

@Composable
fun FailedCard(onAction: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text("❌ הפעולה נכשלה", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AppRed)
        Text("לא הצלחנו לשלוח", fontSize = 11.sp, color = Color(0xFFE53935))
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ActionBtn("נסה שוב", AppRed, modifier = Modifier.weight(1f)) { onAction("retry") }
            OutlineBtn("שלח ידנית", AppRed, modifier = Modifier.weight(1f)) { onAction("manual") }
        }
    }
}

@Composable
fun BigActionBtn(text: String, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.height(34.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 4.dp)
    ) {
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
fun ActionBtn(text: String, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.height(36.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(horizontal = 4.dp)
    ) {
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun OutlineBtn(text: String, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(36.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
        border = androidx.compose.foundation.BorderStroke(1.5.dp, color),
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(horizontal = 4.dp)
    ) {
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun RideInfoBlock(parsed: com.bigbot.app.util.ParsedRideInfo) {
    val hasMain = parsed.price.isNotEmpty() || parsed.street.isNotEmpty()
    if (!hasMain && parsed.specialTags.isEmpty()) return

    Column(modifier = Modifier.fillMaxWidth()) {
        if (hasMain) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (parsed.price.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(GreenBg)
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            "${parsed.price} \u20AA",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = GreenDark
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                }
                if (parsed.street.isNotEmpty()) {
                    val streetText = if (parsed.streetNumber.isNotEmpty())
                        "📍 ${parsed.street} ${parsed.streetNumber}"
                    else
                        "📍 ${parsed.street}"
                    Text(
                        streetText,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                }
            }
        }
        if (parsed.specialTags.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            parsed.specialTags.forEach { tag ->
                Text(
                    "• $tag",
                    fontSize = 11.sp,
                    color = AppOrange,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun Badge(text: String, textColor: Color, bgColor: Color) {
    Box(
        modifier = Modifier.clip(RoundedCornerShape(20.dp)).background(bgColor)
            .padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Text(text, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = textColor)
    }
}
