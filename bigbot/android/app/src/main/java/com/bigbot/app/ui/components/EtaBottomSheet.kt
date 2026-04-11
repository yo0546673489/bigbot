package com.bigbot.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bigbot.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EtaBottomSheet(
    rideId: String,
    onSend: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    var customTime by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf(-1) }
    val options = listOf(3, 5, 10, 15)

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = CardBg) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(
                "⏱ כמה זמן אתה מהכתובת?",
                fontSize = 15.sp, fontWeight = FontWeight.Bold, color = GreenDark,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
            Spacer(Modifier.height(12.dp))

            // 2x2 grid
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                options.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { minutes ->
                            val isSelected = selected == minutes
                            Box(
                                modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                                    .background(if (isSelected) GreenBg else Color(0xFFF5F5F5))
                                    .run {
                                        if (isSelected) border(1.5.dp, Primary, RoundedCornerShape(12.dp))
                                        else this
                                    }
                                    .clickable { selected = minutes }
                                    .padding(11.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "$minutes דקות",
                                    fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                                    color = if (isSelected) GreenDark else TextSecondary
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = customTime, onValueChange = { customTime = it },
                    placeholder = { Text("הקלד זמן...", fontSize = 12.sp) },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp)
                )
                Button(
                    onClick = {
                        val minutes = customTime.toIntOrNull() ?: selected
                        if (minutes != null && minutes > 0) { onSend(minutes); onDismiss() }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("שלח", fontWeight = FontWeight.Bold)
                }
            }

            if (selected > 0) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { onSend(selected); onDismiss() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("שלח $selected דקות", fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

fun Modifier.border(width: androidx.compose.ui.unit.Dp, color: Color, shape: androidx.compose.ui.graphics.Shape): Modifier =
    this.then(Modifier.border(width, color, shape))
