package com.wabot.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.data.models.Ride

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RideDetailScreen(
    ride: Ride,
    onBack: () -> Unit,
    onAction: (String) -> Unit
) {
    var actionDone by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("פרטי נסיעה") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "חזור")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Route
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1976D2)),
                elevation = CardDefaults.cardElevation(4.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            ride.origin,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 22.sp
                        )
                        if (ride.destination.isNotEmpty()) {
                            Spacer(Modifier.width(8.dp))
                            Icon(
                                Icons.Default.ArrowBack,
                                contentDescription = null,
                                tint = Color.White
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                ride.destination,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 22.sp
                            )
                        }
                    }
                    if (ride.price.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text("מחיר: ₪${ride.price}", color = Color(0xFFB3E5FC), fontSize = 14.sp)
                    }
                }
            }

            // Original message
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("הודעה מקורית", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color.Gray)
                    Spacer(Modifier.height(4.dp))
                    Text(ride.body, fontSize = 14.sp)
                }
            }

            // Sender info
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    InfoRow(Icons.Default.Person, "סדרן", ride.senderName)
                    InfoRow(Icons.Default.Phone, "טלפון", ride.senderPhone)
                    InfoRow(Icons.Default.Group, "קבוצה", ride.groupName)
                }
            }

            // Action buttons
            if (actionDone != null) {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
                    Text(
                        "✓ הפעולה בוצעה בהצלחה",
                        modifier = Modifier.padding(16.dp),
                        color = Color(0xFF2E7D32),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }
            } else {
                ride.buttons.forEach { btn ->
                    Button(
                        onClick = {
                            onAction(btn.id)
                            actionDone = btn.id
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = when (btn.id) {
                                "send_link" -> Color(0xFF25D366)
                                "reply_private" -> Color(0xFF7B1FA2)
                                else -> MaterialTheme.colorScheme.primary
                            }
                        )
                    ) {
                        Text(btn.label, fontSize = 16.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    if (value.isEmpty()) return
    Row(
        modifier = Modifier.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.Gray)
        Spacer(Modifier.width(6.dp))
        Text("$label: ", fontSize = 13.sp, color = Color.Gray, fontWeight = FontWeight.SemiBold)
        Text(value, fontSize = 13.sp)
    }
}
