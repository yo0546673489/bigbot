package com.wabot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.data.models.KeywordItem
import com.wabot.app.ui.components.*
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.viewmodel.HomeViewModel

@Composable
fun HomeScreen(viewModel: HomeViewModel) {
    val rides by viewModel.rides.collectAsState()
    val isAvailable by viewModel.isAvailable.collectAsState()
    val waConnected by viewModel.waConnected.collectAsState()
    val keywords by viewModel.keywords.collectAsState()
    val autoMode by viewModel.autoMode.collectAsState()
    val etaRideId by viewModel.etaRideId.collectAsState()

    var showAddDialog by remember { mutableStateOf(false) }
    var showRouteSheet by remember { mutableStateOf(false) }
    var longPressKeyword by remember { mutableStateOf<String?>(null) }
    var editKeyword by remember { mutableStateOf<String?>(null) }
    var showToast by remember { mutableStateOf(false) }
    var toastMessage by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.toastEvent.collect { msg ->
            toastMessage = msg
            showToast = true
            kotlinx.coroutines.delay(2500)
            showToast = false
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(BigBotColors.PageBg)) {
        Column(modifier = Modifier.fillMaxSize()) {

            // Status Card
            StatusCard(
                isAvailable = isAvailable,
                waConnected = waConnected,
                autoMode = autoMode,
                onToggleAvailable = { viewModel.setAvailability(!isAvailable) }
            )

            // Action Buttons
            ActionButtonsRow(
                isAutoActive = autoMode,
                onAutoClick = { viewModel.setAutoMode(!autoMode) },
                onRouteClick = { showRouteSheet = true }
            )

            // Filter Chips
            FilterChipsRow(
                keywords = keywords,
                onToggle = { viewModel.toggleKeyword(it) },
                onLongPress = { longPressKeyword = it },
                onAddClick = { showAddDialog = true }
            )

            // Rides Feed
            if (!isAvailable) {
                EmptyStateView("💤", "מצב לא פנוי", "הפעל את המתג למעלה כדי לקבל נסיעות")
            } else if (rides.isEmpty()) {
                EmptyStateView("🚗", "ממתין לנסיעות...", "כשתגיע נסיעה מתאימה תופיע כאן")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(rides, key = { it.messageId }) { ride ->
                        RideCard(
                            ride = ride,
                            getButtonState = { action -> viewModel.getButtonState(ride.messageId, action) },
                            onAction = { action -> viewModel.performAction(ride, action) }
                        )
                    }
                }
            }
        }

        // Toast
        if (showToast) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp),
                shape = RoundedCornerShape(24.dp),
                color = Color(0xDD212121)
            ) {
                Text(
                    text = toastMessage,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                    fontSize = 14.sp
                )
            }
        }
    }

    // Dialogs
    if (showAddDialog) {
        AddKeywordDialog(
            onDismiss = { showAddDialog = false },
            onSave = { origin, dest ->
                val kw = if (dest.isBlank()) origin else "${origin}_$dest"
                viewModel.addKeyword(kw)
                showAddDialog = false
            }
        )
    }

    if (showRouteSheet) {
        AddKeywordDialog(
            title = "הוסף מסלול",
            onDismiss = { showRouteSheet = false },
            onSave = { origin, dest ->
                val kw = if (dest.isBlank()) origin else "${origin}_$dest"
                viewModel.addKeyword(kw)
                showRouteSheet = false
            }
        )
    }

    if (longPressKeyword != null) {
        KeywordLongPressMenu(
            keyword = longPressKeyword!!,
            onDismiss = { longPressKeyword = null },
            onDelete = { viewModel.removeKeyword(longPressKeyword!!) },
            onEdit = { editKeyword = longPressKeyword; longPressKeyword = null }
        )
    }

    if (editKeyword != null) {
        val parts = editKeyword!!.split("_")
        AddKeywordDialog(
            title = "ערוך מסלול",
            initialOrigin = parts.getOrElse(0) { "" },
            initialDest = parts.getOrElse(1) { "" },
            onDismiss = { editKeyword = null },
            onSave = { origin, dest ->
                viewModel.removeKeyword(editKeyword!!)
                val kw = if (dest.isBlank()) origin else "${origin}_$dest"
                viewModel.addKeyword(kw)
                editKeyword = null
            }
        )
    }

    if (etaRideId != null) {
        EtaBottomSheet(
            rideId = etaRideId!!,
            onEtaSelected = { rideId, minutes -> viewModel.sendEtaResponse(rideId, minutes) },
            onDismiss = { viewModel.dismissEta() }
        )
    }
}

@Composable
fun StatusCard(
    isAvailable: Boolean,
    waConnected: Boolean,
    autoMode: Boolean,
    onToggleAvailable: () -> Unit
) {
    Surface(modifier = Modifier.fillMaxWidth(), color = BigBotColors.CardBg, shadowElevation = 2.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = if (isAvailable) "פנוי עכשיו" else "לא פנוי",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (isAvailable) BigBotColors.Primary else BigBotColors.TextSecondary
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier.size(7.dp).clip(CircleShape)
                            .background(if (waConnected) BigBotColors.Primary else BigBotColors.Red)
                    )
                    Text(
                        text = if (waConnected) "WhatsApp מחובר" else "WhatsApp מנותק",
                        fontSize = 11.sp,
                        color = BigBotColors.TextSecondary
                    )
                }
                if (autoMode) {
                    Surface(shape = RoundedCornerShape(8.dp), color = Color(0xFFF3E8FF)) {
                        Text(
                            "⚡ מצב אוטומטי",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            fontSize = 10.sp, color = BigBotColors.Purple, fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
            Switch(
                checked = isAvailable,
                onCheckedChange = { onToggleAvailable() },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = BigBotColors.Primary,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color(0xFFCCCCCC)
                )
            )
        }
    }
}

@Composable
fun ActionButtonsRow(
    isAutoActive: Boolean,
    onAutoClick: () -> Unit,
    onRouteClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        QuickActionButton("📍 פנוי ממקום", BigBotColors.Primary) { /* GPS - handled by LocationService */ }
        QuickActionButton(
            "⚡ אוטומטי",
            if (isAutoActive) BigBotColors.Purple else Color(0xFF7E57C2),
            onClick = onAutoClick
        )
        QuickActionButton("🗺️ מסלול", BigBotColors.Blue, onClick = onRouteClick)
        QuickActionButton("🔇 שקט", Color(0xFF455A64)) { /* local silent mode */ }
    }
}

@Composable
fun QuickActionButton(label: String, color: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp),
        modifier = Modifier.height(36.dp)
    ) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color.White)
    }
}

@Composable
fun FilterChipsRow(
    keywords: List<KeywordItem>,
    onToggle: (String) -> Unit,
    onLongPress: (String) -> Unit,
    onAddClick: () -> Unit
) {
    if (keywords.isEmpty()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.Start
        ) {
            AddKeywordChip(onClick = onAddClick)
        }
        return
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 14.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        keywords.forEach { item ->
            BigBotFilterChip(
                keyword = item.keyword,
                displayText = item.displayText,
                isActive = item.isActive,
                onToggle = { onToggle(item.keyword) },
                onLongPress = { onLongPress(item.keyword) }
            )
        }
        AddKeywordChip(onClick = onAddClick)
    }
}

@Composable
fun EmptyStateView(icon: String, title: String, subtitle: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(icon, fontSize = 52.sp)
            Text(title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
            Text(
                subtitle, fontSize = 13.sp, color = BigBotColors.TextSecondary,
                textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 40.dp)
            )
        }
    }
}

@Composable
fun AddKeywordDialog(
    title: String = "הוסף חיפוש חדש",
    initialOrigin: String = "",
    initialDest: String = "",
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit
) {
    var origin by remember { mutableStateOf(initialOrigin) }
    var dest by remember { mutableStateOf(initialDest) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = origin, onValueChange = { origin = it },
                    label = { Text("מוצא") }, placeholder = { Text("בב") },
                    singleLine = true, modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = dest, onValueChange = { dest = it },
                    label = { Text("יעד (אופציונלי)") }, placeholder = { Text("שמש") },
                    singleLine = true, modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { if (origin.isNotBlank()) onSave(origin.trim(), dest.trim()) },
                enabled = origin.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary)
            ) { Text("שמור", color = Color.White) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("ביטול") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EtaBottomSheet(
    rideId: String,
    onEtaSelected: (String, Int) -> Unit,
    onDismiss: () -> Unit
) {
    var customEta by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = BigBotColors.CardBg) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("⏱️ כמה זמן אתה מהכתובת?", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(3, 5).forEach { min ->
                    Button(
                        onClick = { onEtaSelected(rideId, min) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.PrimaryBg),
                        shape = RoundedCornerShape(12.dp)
                    ) { Text("$min דקות", color = BigBotColors.Primary, fontWeight = FontWeight.Bold) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10, 15).forEach { min ->
                    Button(
                        onClick = { onEtaSelected(rideId, min) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.PrimaryBg),
                        shape = RoundedCornerShape(12.dp)
                    ) { Text("$min דקות", color = BigBotColors.Primary, fontWeight = FontWeight.Bold) }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = customEta,
                    onValueChange = { customEta = it.filter { c -> c.isDigit() } },
                    label = { Text("הקלד זמן...") },
                    singleLine = true, modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = { customEta.toIntOrNull()?.let { onEtaSelected(rideId, it) } },
                    enabled = customEta.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = BigBotColors.Primary)
                ) { Text("שלח", color = Color.White) }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
