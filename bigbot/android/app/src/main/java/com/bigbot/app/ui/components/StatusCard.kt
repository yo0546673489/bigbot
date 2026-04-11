package com.bigbot.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bigbot.app.ui.theme.*

@Composable
fun StatusCard(
    isAvailable: Boolean,
    keywords: List<String>,
    pausedKeywords: List<String>,
    driverName: String,
    waConnected: Boolean,
    autoMode: Boolean,
    autoSend: Boolean,
    locationCity: String,
    onToggle: (Boolean) -> Unit,
    onAddKeyword: (String) -> Unit,
    onRemoveKeyword: (String) -> Unit,
    onPauseKeyword: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var showAddDialog by remember { mutableStateOf(false) }
    var newKeyword by remember { mutableStateOf("") }

    Card(
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = GreenBg),
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, GreenBorder),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp, 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(8.dp).clip(CircleShape)
                        .background(if (isAvailable) Color(0xFF4CAF50) else Color(0xFF9E9E9E))
                )
                Spacer(Modifier.width(7.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (isAvailable) "פנוי עכשיו" else "לא פנוי",
                        fontSize = 16.sp, fontWeight = FontWeight.Bold,
                        color = if (isAvailable) GreenDark else TextPrimary
                    )
                    if (locationCity.isNotEmpty()) {
                        Text("📍 מיקום: $locationCity", fontSize = 11.sp, color = Color(0xFF558B2F))
                    }
                }
                Switch(
                    checked = isAvailable, onCheckedChange = onToggle,
                    colors = SwitchDefaults.colors(
                        checkedTrackColor = Primary,
                        checkedThumbColor = Color.White,
                        uncheckedTrackColor = Color(0xFFCFD8DC),
                        uncheckedThumbColor = Color.White
                    )
                )
            }

            if (autoMode || autoSend) {
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (autoMode) StatusBadge("⚡ מצב חכם: פעיל", Purple, PurpleBg)
                    if (autoSend) StatusBadge("✓ אוטומציה: פעילה", Primary, GreenBg)
                }
            }

            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(7.dp).clip(CircleShape)
                        .background(if (waConnected) Color(0xFF4CAF50) else Color(0xFFEF5350))
                )
                Spacer(Modifier.width(5.dp))
                Text(
                    if (waConnected) "WhatsApp מחובר" else "WhatsApp מנותק",
                    fontSize = 10.sp,
                    color = if (waConnected) Color(0xFF388E3C) else AppRed
                )
            }
        }
    }

    if (showAddDialog) {
        AlertDialog(
            onDismissRequest = { showAddDialog = false; newKeyword = "" },
            title = { Text("הוסף מסלול") },
            text = {
                Column {
                    Text("לדוגמה: בב, בב_ים, תא_בב", color = TextSecondary, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newKeyword, onValueChange = { newKeyword = it },
                        label = { Text("מסלול") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newKeyword.isNotBlank()) { onAddKeyword(newKeyword.trim()); newKeyword = "" }
                    showAddDialog = false
                }) { Text("הוסף") }
            },
            dismissButton = { TextButton(onClick = { showAddDialog = false }) { Text("ביטול") } }
        )
    }
}

@Composable
fun StatusBadge(text: String, textColor: Color, bgColor: Color) {
    Box(
        modifier = Modifier.clip(RoundedCornerShape(20.dp))
            .background(bgColor).padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Text(text, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = textColor)
    }
}
