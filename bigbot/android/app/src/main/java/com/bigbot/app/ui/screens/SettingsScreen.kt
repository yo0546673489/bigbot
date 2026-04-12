package com.bigbot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.SettingsViewModel

@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val driverPhone by viewModel.driverPhone.collectAsState()
    val waConnected by viewModel.waConnected.collectAsState()
    val autoMode by viewModel.autoMode.collectAsState()
    val autoSend by viewModel.autoSend.collectAsState()
    val defaultEta by viewModel.defaultEta.collectAsState()
    val autoLocation by viewModel.autoLocation.collectAsState()
    val notifsEnabled by viewModel.notifsEnabled.collectAsState()
    val loudSound by viewModel.loudSound.collectAsState()
    val vibration by viewModel.vibration.collectAsState()
    val customMessage by viewModel.customMessage.collectAsState()
    val vehicleType by viewModel.vehicleType.collectAsState()
    val vehicleTypes by viewModel.vehicleTypes.collectAsState()
    val silentMode by viewModel.silentMode.collectAsState()
    val serviceMode by viewModel.serviceMode.collectAsState()
    val acceptDeliveries by viewModel.acceptDeliveries.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()

    var showEtaDialog by remember { mutableStateOf(false) }
    var etaInput by remember { mutableStateOf(defaultEta.toString()) }
    var showMsgDialog by remember { mutableStateOf(false) }
    var msgInput by remember { mutableStateOf(customMessage) }
    var showVehicleDialog by remember { mutableStateOf(false) }

    statusMessage?.let { msg ->
        LaunchedEffect(msg) {
            kotlinx.coroutines.delay(2000)
            viewModel.clearStatus()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(Color(0xFFFAFCFA))) {
        // Header
        Box(
            modifier = Modifier.fillMaxWidth().background(CardBg)
                .statusBarsPadding()
                .padding(horizontal = 18.dp, vertical = 14.dp)
        ) {
            Column {
                Text("הגדרות", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = GreenDark)
                Text("התאמה אישית", fontSize = 12.sp, color = TextSecondary)
            }
        }
        HorizontalDivider(color = Border, thickness = 0.5.dp)

        statusMessage?.let {
            Box(modifier = Modifier.fillMaxWidth().background(GreenBg).padding(12.dp), contentAlignment = Alignment.Center) {
                Text(it, color = GreenDark, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Section: WhatsApp Connection
            item {
                SettingsSection("🔗 חיבור וואטסאפ") {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                        Box(modifier = Modifier.size(8.dp).clip(CircleShape)
                            .background(if (waConnected) Color(0xFF4CAF50) else AppRed))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (waConnected) "מחובר — $driverPhone" else "מנותק",
                            fontSize = 12.sp, color = TextPrimary
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(
                            onClick = { viewModel.reconnect() },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, Primary),
                            shape = RoundedCornerShape(12.dp)
                        ) { Text("חבר מחדש", fontSize = 11.sp) }
                        Button(
                            onClick = { viewModel.disconnect() },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = RedBg, contentColor = AppRed),
                            shape = RoundedCornerShape(12.dp),
                            elevation = ButtonDefaults.buttonElevation(0.dp)
                        ) { Text("נתק", fontSize = 11.sp) }
                    }
                }
            }

            // Section: Automation
            item {
                SettingsSection("⚡ אוטומציה") {
                    SettingsRow("אוטומציה מלאה") {
                        AppSwitch(autoMode) { viewModel.setAutoMode(it) }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("שליחה אוטומטית לסדרן") {
                        AppSwitch(autoSend) { viewModel.setAutoSend(it) }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow(label = {
                        Column {
                            Text("זמן ברירת מחדל", fontSize = 12.sp, color = TextPrimary)
                            Text("תשובה אוטו' לריידר בוט", fontSize = 9.sp, color = TextSecondary)
                        }
                    }) {
                        Row(verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { showEtaDialog = true }) {
                            Text("$defaultEta", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Primary)
                            Spacer(Modifier.width(2.dp))
                            Text("דק'", fontSize = 9.sp, color = TextSecondary)
                        }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("פנוי אוטומטי לפי מיקום") {
                        AppSwitch(autoLocation) { viewModel.setAutoLocation(it) }
                    }
                }
            }

            // Section: Notifications
            item {
                SettingsSection("🔔 התראות") {
                    SettingsRow("התראות פעילות") {
                        AppSwitch(notifsEnabled) { viewModel.setNotifsEnabled(it) }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("צליל חזק") {
                        AppSwitch(loudSound) { viewModel.setLoudSound(it) }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("ויברציה") {
                        AppSwitch(vibration) { viewModel.setVibration(it) }
                    }
                }
            }

            // Section: Messages
            item {
                SettingsSection("💬 הודעות") {
                    SettingsRow("הודעה מותאמת לפרטי") {
                        Text("ערוך", fontSize = 11.sp, color = Primary, fontWeight = FontWeight.Medium,
                            modifier = Modifier.clickable { showMsgDialog = true })
                    }
                    if (customMessage.isNotEmpty()) {
                        Box(
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFF1F8F2)).padding(8.dp, 6.dp)
                        ) {
                            Text("\"$customMessage\"", fontSize = 10.sp, color = Color(0xFF558B2F))
                        }
                    }
                }
            }

            // Section: Filters
            item {
                SettingsSection("🔧 סינון") {
                    SettingsRow("סוג רכב") {
                        Box(
                            modifier = Modifier.clip(RoundedCornerShape(12.dp))
                                .background(GreenBg).padding(horizontal = 10.dp, vertical = 3.dp)
                                .clickable { showVehicleDialog = true }
                        ) {
                            val label = when {
                                vehicleTypes.isEmpty() -> "כולם"
                                vehicleTypes.size == 1 -> vehicleTypes.first()
                                else -> "${vehicleTypes.size} נבחרו"
                            }
                            Text(label, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = GreenDark)
                        }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("קבלת משלוחים") {
                        Switch(
                            checked = acceptDeliveries,
                            onCheckedChange = { viewModel.setAcceptDeliveries(it) },
                            colors = SwitchDefaults.colors(
                                checkedTrackColor = Primary,
                                checkedThumbColor = Color.White,
                                uncheckedTrackColor = Color(0xFFCFD8DC),
                                uncheckedThumbColor = Color.White
                            )
                        )
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("סינון קבוצות") {
                        Text("הגדר", fontSize = 11.sp, color = Primary, fontWeight = FontWeight.Medium)
                    }
                }
            }

            // Section: Display
            item {
                SettingsSection("👁 תצוגה") {
                    SettingsRow("מצב שקט") {
                        AppSwitch(silentMode) { viewModel.setSilentMode(it) }
                    }
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    SettingsRow("מצב שירות") {
                        AppSwitch(serviceMode) { viewModel.setServiceMode(it) }
                    }
                }
            }
        }
    }

    // ETA dialog
    if (showEtaDialog) {
        AlertDialog(
            onDismissRequest = { showEtaDialog = false },
            title = { Text("זמן ברירת מחדל (דקות)") },
            text = {
                OutlinedTextField(
                    value = etaInput, onValueChange = { etaInput = it },
                    label = { Text("דקות (1-30)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val v = etaInput.toIntOrNull()
                    if (v != null && v in 1..30) viewModel.setDefaultEta(v)
                    showEtaDialog = false
                }) { Text("שמור") }
            },
            dismissButton = { TextButton(onClick = { showEtaDialog = false }) { Text("ביטול") } }
        )
    }

    // Custom message dialog
    if (showMsgDialog) {
        AlertDialog(
            onDismissRequest = { showMsgDialog = false },
            title = { Text("הודעה מותאמת לפרטי") },
            text = {
                OutlinedTextField(
                    value = msgInput, onValueChange = { msgInput = it },
                    placeholder = { Text("שלום, אני בדרך אליכם תוך 5 דקות") },
                    modifier = Modifier.fillMaxWidth(), maxLines = 4
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.saveCustomMessage(msgInput); showMsgDialog = false }) {
                    Text("שמור")
                }
            },
            dismissButton = { TextButton(onClick = { showMsgDialog = false }) { Text("ביטול") } }
        )
    }

    // Vehicle type dialog — multi-select with checkboxes.
    // "כולם" is mutually exclusive with the rest (selecting it clears the others;
    // selecting any other clears "כולם").
    if (showVehicleDialog) {
        var selected by remember(vehicleTypes) {
            mutableStateOf(if (vehicleTypes.isEmpty()) setOf("כולם") else vehicleTypes.toSet())
        }
        val allOptions = listOf(
            "4 מקומות",
            "מיניק",
            "מיניבוס",
            "6 מקומות",
            "7 מקומות",
            "8 מקומות",
            "ספיישל",
            "רכב גדול",
            "כולם",
        )
        AlertDialog(
            onDismissRequest = { showVehicleDialog = false },
            title = { Text("סוג רכב — בחירה מרובה") },
            text = {
                Column {
                    allOptions.forEach { type ->
                        val isChecked = selected.contains(type)
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable {
                                selected = when {
                                    type == "כולם" -> if (isChecked) emptySet() else setOf("כולם")
                                    isChecked -> selected - type
                                    else -> (selected - "כולם") + type
                                }
                            }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = { checked ->
                                    selected = when {
                                        type == "כולם" -> if (checked) setOf("כולם") else emptySet()
                                        checked -> (selected - "כולם") + type
                                        else -> selected - type
                                    }
                                },
                                colors = CheckboxDefaults.colors(checkedColor = Primary)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(type, fontSize = 14.sp)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.setVehicleTypes(selected.toList())
                    showVehicleDialog = false
                }) { Text("שמור") }
            },
            dismissButton = {
                TextButton(onClick = { showVehicleDialog = false }) { Text("ביטול") }
            }
        )
    }
}

@Composable
fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, Border),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp, 10.dp)) {
            Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Primary)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
fun SettingsRow(label: String, value: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, fontSize = 12.sp, color = TextPrimary, modifier = Modifier.weight(1f))
        value()
    }
}

@Composable
fun SettingsRow(label: @Composable () -> Unit, value: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.weight(1f)) { label() }
        value()
    }
}

@Composable
fun AppSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Switch(
        checked = checked, onCheckedChange = onCheckedChange,
        colors = SwitchDefaults.colors(
            checkedTrackColor = Primary, checkedThumbColor = Color.White,
            uncheckedTrackColor = Color(0xFFCFD8DC), uncheckedThumbColor = Color.White
        )
    )
}
