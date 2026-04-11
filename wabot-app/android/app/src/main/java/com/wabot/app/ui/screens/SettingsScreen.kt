package com.wabot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.viewmodel.SettingsViewModel

@Composable
fun SettingsScreen(
    onBack: (() -> Unit)? = null,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val driverPhone by viewModel.driverPhone.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val etaMinutes by viewModel.etaMinutes.collectAsState()
    val autoMode by viewModel.autoMode.collectAsState()
    val waConnected by viewModel.waConnected.collectAsState()
    val autoSendToDispatcher by viewModel.autoSendToDispatcher.collectAsState()
    val autoLocationEnabled by viewModel.autoLocationEnabled.collectAsState()
    val notificationsEnabled by viewModel.notificationsEnabled.collectAsState()
    val vibrationEnabled by viewModel.vibrationEnabled.collectAsState()
    val loudSoundEnabled by viewModel.loudSoundEnabled.collectAsState()
    val silentMode by viewModel.silentMode.collectAsState()
    val customPrivateMessage by viewModel.customPrivateMessage.collectAsState()
    val vehicleType by viewModel.vehicleType.collectAsState()

    var serverUrlInput by remember(serverUrl) { mutableStateOf(serverUrl) }
    var etaInput by remember(etaMinutes) { mutableStateOf(etaMinutes) }
    var customMsgInput by remember(customPrivateMessage) { mutableStateOf(customPrivateMessage) }
    var showEtaDialog by remember { mutableStateOf(false) }
    var showCustomMsgDialog by remember { mutableStateOf(false) }
    var showVehicleDialog by remember { mutableStateOf(false) }
    var pairingCode by remember { mutableStateOf("") }
    var phoneInput by remember { mutableStateOf("") }
    var isPairing by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BigBotColors.PageBg)
    ) {
        // Header
        Surface(color = BigBotColors.CardBg, shadowElevation = 2.dp) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("הגדרות", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {

            // ── WhatsApp connection ──────────────────────────────────
            SettingsCard(title = "חיבור וואטסאפ") {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(9.dp)
                            .background(
                                color = if (waConnected) BigBotColors.Primary else BigBotColors.Red,
                                shape = CircleShape
                            )
                    )
                    Text(
                        if (waConnected) "מחובר — $driverPhone" else "מנותק",
                        fontSize = 13.sp,
                        color = BigBotColors.TextPrimary,
                        fontWeight = FontWeight.Medium
                    )
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = phoneInput,
                    onValueChange = { phoneInput = it },
                    label = { Text("מספר טלפון (972...)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp)
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            isPairing = true
                            viewModel.pairPhone(phoneInput) { code ->
                                pairingCode = code
                                isPairing = false
                            }
                        },
                        enabled = !isPairing && phoneInput.length >= 10,
                        colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f).height(38.dp)
                    ) {
                        if (isPairing) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Text("קבל קוד חיבור", fontSize = 13.sp, color = Color.White)
                        }
                    }
                    OutlinedButton(
                        onClick = { viewModel.reconnect() },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = BigBotColors.Blue),
                        border = androidx.compose.foundation.BorderStroke(1.dp, BigBotColors.Blue),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.height(38.dp)
                    ) { Text("חבר מחדש", fontSize = 13.sp) }
                }
                if (pairingCode.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Surface(shape = RoundedCornerShape(10.dp), color = BigBotColors.PrimaryBg) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(pairingCode, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = BigBotColors.Primary)
                            Text("הכנס ב: הגדרות WA > מכשירים מקושרים", fontSize = 10.sp, color = BigBotColors.TextSecondary)
                        }
                    }
                }
            }

            // ── Server URL ───────────────────────────────────────────
            SettingsCard(title = "כתובת שרת") {
                OutlinedTextField(
                    value = serverUrlInput,
                    onValueChange = { serverUrlInput = it },
                    label = { Text("WebSocket URL") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp)
                )
                Spacer(Modifier.height(6.dp))
                Button(
                    onClick = { viewModel.saveServerUrl(serverUrlInput) },
                    colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.height(36.dp)
                ) { Text("שמור", fontSize = 13.sp, color = Color.White) }
            }

            // ── Automation ───────────────────────────────────────────
            SettingsCard(title = "אוטומציה") {
                SettingsToggleRow("אוטומציה מלאה", autoMode) { viewModel.saveAutoMode(it) }
                Divider(color = BigBotColors.Border, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 6.dp))
                SettingsToggleRow("שליחה אוטומטית לסדרן", autoSendToDispatcher) { viewModel.saveAutoSendToDispatcher(it) }
                Divider(color = BigBotColors.Border, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 6.dp))
                SettingsToggleRow("פנוי אוטומטי לפי מיקום", autoLocationEnabled) { viewModel.saveAutoLocation(it) }
                Divider(color = BigBotColors.Border, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 6.dp))
                // Default ETA tap
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("זמן ברירת מחדל", fontSize = 14.sp, color = BigBotColors.TextPrimary)
                        Text("נשלח אוטומטית כשנשאל ETA", fontSize = 11.sp, color = BigBotColors.TextSecondary)
                    }
                    TextButton(onClick = { showEtaDialog = true }) {
                        Text("$etaMinutes דק'", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = BigBotColors.Primary)
                    }
                }
            }

            // ── Notifications ────────────────────────────────────────
            SettingsCard(title = "התראות") {
                SettingsToggleRow("התראות פעילות", notificationsEnabled) { viewModel.saveNotificationsEnabled(it) }
                Divider(color = BigBotColors.Border, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 6.dp))
                SettingsToggleRow("צליל חזק", loudSoundEnabled) { viewModel.saveLoudSound(it) }
                Divider(color = BigBotColors.Border, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 6.dp))
                SettingsToggleRow("ויברציה", vibrationEnabled) { viewModel.saveVibration(it) }
            }

            // ── Messages ─────────────────────────────────────────────
            SettingsCard(title = "הודעות") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("הודעה מותאמת לפרטי", fontSize = 14.sp, color = BigBotColors.TextPrimary)
                        Text(
                            customPrivateMessage.ifBlank { "לא הוגדרה הודעה מותאמת" },
                            fontSize = 11.sp,
                            color = BigBotColors.TextSecondary,
                            maxLines = 1
                        )
                    }
                    TextButton(onClick = { showCustomMsgDialog = true }) {
                        Text("ערוך", fontSize = 13.sp, color = BigBotColors.Primary)
                    }
                }
            }

            // ── Filters ──────────────────────────────────────────────
            SettingsCard(title = "סינון") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("סוג רכב", fontSize = 14.sp, color = BigBotColors.TextPrimary)
                        Text(vehicleType, fontSize = 11.sp, color = BigBotColors.TextSecondary)
                    }
                    TextButton(onClick = { showVehicleDialog = true }) {
                        Text("שנה", fontSize = 13.sp, color = BigBotColors.Primary)
                    }
                }
            }

            // ── Display ──────────────────────────────────────────────
            SettingsCard(title = "תצוגה") {
                SettingsToggleRow("מצב שקט", silentMode) { viewModel.saveSilentMode(it) }
            }

            Spacer(Modifier.height(16.dp))
        }
    }

    // ETA dialog
    if (showEtaDialog) {
        EtaPickerDialog(
            current = etaMinutes,
            onDismiss = { showEtaDialog = false },
            onSave = { newEta ->
                viewModel.saveEta(newEta)
                showEtaDialog = false
            }
        )
    }

    // Custom message dialog
    if (showCustomMsgDialog) {
        CustomMessageDialog(
            current = customPrivateMessage,
            onDismiss = { showCustomMsgDialog = false },
            onSave = { msg ->
                viewModel.saveCustomPrivateMessage(msg)
                showCustomMsgDialog = false
            }
        )
    }

    // Vehicle type dialog
    if (showVehicleDialog) {
        VehicleTypeDialog(
            current = vehicleType,
            onDismiss = { showVehicleDialog = false },
            onSelect = { type ->
                viewModel.saveVehicleType(type)
                showVehicleDialog = false
            }
        )
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = BigBotColors.CardBg),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = BigBotColors.Primary)
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
private fun SettingsToggleRow(label: String, value: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp, color = BigBotColors.TextPrimary)
        Switch(
            checked = value,
            onCheckedChange = onToggle,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = BigBotColors.Primary,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = Color(0xFFCCCCCC)
            )
        )
    }
}

@Composable
private fun EtaPickerDialog(current: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var input by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("זמן ברירת מחדל (דקות)", fontWeight = FontWeight.Bold) },
        text = {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it.filter { c -> c.isDigit() }.take(2) },
                label = { Text("דקות (1-30)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            )
        },
        confirmButton = {
            Button(
                onClick = { if (input.isNotBlank()) onSave(input) },
                enabled = input.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary)
            ) { Text("שמור", color = Color.White) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("ביטול") } }
    )
}

@Composable
private fun CustomMessageDialog(current: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var input by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("הודעה מותאמת לפרטי", fontWeight = FontWeight.Bold) },
        text = {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("הודעה") },
                placeholder = { Text("שלום, אני בדרך אליכם תוך 5 דקות") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 4,
                shape = RoundedCornerShape(10.dp)
            )
        },
        confirmButton = {
            Button(
                onClick = { onSave(input) },
                colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary)
            ) { Text("שמור", color = Color.White) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("ביטול") } }
    )
}

@Composable
private fun VehicleTypeDialog(current: String, onDismiss: () -> Unit, onSelect: (String) -> Unit) {
    val options = listOf("4 מקומות", "6 מקומות", "כולם")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("סוג רכב", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                options.forEach { option ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = option == current,
                            onClick = { onSelect(option) },
                            colors = RadioButtonDefaults.colors(selectedColor = BigBotColors.Primary)
                        )
                        Text(option, fontSize = 14.sp, color = BigBotColors.TextPrimary)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("ביטול") } }
    )
}
