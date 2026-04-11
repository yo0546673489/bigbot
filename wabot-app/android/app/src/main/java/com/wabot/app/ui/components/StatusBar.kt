package com.wabot.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun StatusBar(
    isAvailable: Boolean,
    keywords: List<String>,
    driverPhone: String,
    onToggle: (Boolean) -> Unit,
    onAddKeyword: (String) -> Unit
) {
    var showAddKeyword by remember { mutableStateOf(false) }
    var newKeyword by remember { mutableStateOf("") }

    val bgColor = if (isAvailable) Color(0xFF4CAF50) else Color(0xFFF44336)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(bgColor)
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isAvailable) "פנוי" else "עסוק",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
                if (keywords.isNotEmpty() && isAvailable) {
                    Text(
                        text = keywords.joinToString(", "),
                        color = Color.White,
                        fontSize = 12.sp
                    )
                }
                if (driverPhone.isNotEmpty()) {
                    Text(
                        text = "📱 $driverPhone",
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 11.sp
                    )
                }
            }

            Switch(
                checked = isAvailable,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Color(0xFF2E7D32),
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color(0xFFC62828)
                )
            )
        }

        if (isAvailable) {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                keywords.forEach { kw ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White.copy(alpha = 0.3f)
                    ) {
                        Text(
                            kw,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            color = Color.White,
                            fontSize = 12.sp
                        )
                    }
                }
                IconButton(
                    onClick = { showAddKeyword = true },
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = "הוסף מסלול",
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }

    if (showAddKeyword) {
        AlertDialog(
            onDismissRequest = { showAddKeyword = false },
            title = { Text("הוסף מסלול") },
            text = {
                Column {
                    Text("לדוגמה: בב, בב_ים, נתניה")
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newKeyword,
                        onValueChange = { newKeyword = it },
                        label = { Text("מסלול") },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newKeyword.isNotBlank()) {
                        onAddKeyword(newKeyword.trim())
                        newKeyword = ""
                    }
                    showAddKeyword = false
                }) { Text("הוסף") }
            },
            dismissButton = {
                TextButton(onClick = { showAddKeyword = false }) { Text("ביטול") }
            }
        )
    }
}
