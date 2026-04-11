package com.bigbot.app.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bigbot.app.R
import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.hilt.navigation.compose.hiltViewModel
import com.bigbot.app.data.models.Ride
import com.bigbot.app.ui.components.*
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.HomeViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToChat: (phone: String) -> Unit,
    scrollToTopTrigger: Int = 0,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val rides by viewModel.rides.collectAsState()
    val isAvailable by viewModel.isAvailable.collectAsState()
    val waConnected by viewModel.waConnected.collectAsState()
    val keywords by viewModel.keywords.collectAsState()
    val pausedKeywords by viewModel.pausedKeywords.collectAsState()
    val driverName by viewModel.driverName.collectAsState()
    val autoMode by viewModel.autoMode.collectAsState()
    val autoSend by viewModel.autoSend.collectAsState()
    val locationCity by viewModel.locationCity.collectAsState()
    val locationTrackingActive by viewModel.locationTrackingActive.collectAsState()
    val etaRequest by viewModel.etaRequest.collectAsState()

    // Location permission launcher
    val locationPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) viewModel.toggleLocationTracking()
    }
    val sentButtons by viewModel.sentButtons.collectAsState()
    val ttsEnabled by viewModel.ttsEnabled.collectAsState()
    val voiceControlEnabled by viewModel.voiceControlEnabled.collectAsState()
    val kmOptions by viewModel.kmOptions.collectAsState()
    val selectedKm by viewModel.selectedKm.collectAsState()
    val kmFilterVisible by viewModel.kmFilterVisible.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val micPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) viewModel.toggleVoiceControl() // flip to ON
    }

    val listState = rememberLazyListState()

    // Scroll to top when home tab is tapped while already on home screen
    LaunchedEffect(scrollToTopTrigger) {
        if (scrollToTopTrigger > 0) listState.animateScrollToItem(0)
    }

    var showAddKeywordDialog by remember { mutableStateOf(false) }
    var newKeyword by remember { mutableStateOf("") }
    var newKeywordDest by remember { mutableStateOf("") }
    // Km-filter "add custom value" dialog state
    var showAddKmDialog by remember { mutableStateOf(false) }
    var newKmText by remember { mutableStateOf("") }

    // ETA bottom sheet
    etaRequest?.let { req ->
        EtaBottomSheet(
            rideId = req.rideId,
            onSend = { minutes -> viewModel.sendEta(req.rideId, minutes) },
            onDismiss = { viewModel.dismissEta() }
        )
    }

    Column(modifier = Modifier.fillMaxSize().background(PageBg)) {
        // Header — no statusBarsPadding here because the Scaffold in
        // MainActivity already applies innerPadding that includes the status
        // bar. Adding it again created a visible white strip above the
        // header (double-padding).
        // Compact header — user asked to shrink the whole row and have it
        // hug the green card below with minimal gap.
        Box(
            modifier = Modifier.fillMaxWidth()
                .background(CardBg)
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(R.drawable.logo_bigbot),
                    contentDescription = "BigBot Logo",
                    modifier = Modifier.size(60.dp),
                    contentScale = ContentScale.Fit
                )
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("BigBot", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = GreenDark)
                    val subtitle = if (rides.isNotEmpty()) "${rides.size} נסיעות חדשות"
                                   else if (driverName.isNotEmpty()) "שלום $driverName!" else "מערכת נסיעות חכמה"
                    Text(subtitle, fontSize = 13.sp, color = TextSecondary)
                }
            }
            Row(
                modifier = Modifier.align(Alignment.CenterEnd),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                IconButton(
                    onClick = {},
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(Icons.Default.Settings, null, tint = TextSecondary, modifier = Modifier.size(26.dp))
                }
                IconButton(
                    onClick = {},
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(Icons.Default.Notifications, null, tint = TextSecondary, modifier = Modifier.size(26.dp))
                }
            }
        }
        // Divider removed — user wants the header to sit flush against the
        // green status card below.

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 12.dp)
        ) {
            // Status Card
            item {
                StatusCard(
                    isAvailable = isAvailable,
                    keywords = keywords,
                    pausedKeywords = pausedKeywords,
                    driverName = driverName,
                    waConnected = waConnected,
                    autoMode = autoMode,
                    autoSend = autoSend,
                    locationCity = locationCity,
                    onToggle = { viewModel.setAvailability(it) },
                    onAddKeyword = { viewModel.addKeyword(it) },
                    onRemoveKeyword = { viewModel.removeKeyword(it) },
                    onPauseKeyword = { viewModel.pauseKeyword(it) }
                )
            }

            // Action buttons row
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ActionChip(
                        label = if (locationTrackingActive) "📍 מיקום פעיל" else "📍 פנוי מיקום",
                        containerColor = if (locationTrackingActive) Color(0xFF2E7D32) else Primary,
                        contentColor = Color.White
                    ) {
                        if (locationTrackingActive) {
                            viewModel.toggleLocationTracking()
                        } else {
                            locationPermLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                        }
                    }
                    ActionChip(
                        label = "⚡ אוטומטי",
                        containerColor = Purple,
                        contentColor = Color.White
                    ) {
                        viewModel.setAutoMode(!autoMode)
                    }
                    // Hands-free voice commands — listens for "אחד/שתיים/שלוש"
                    // after each ride announcement and triggers the matching
                    // button. Requires RECORD_AUDIO: on enable we request the
                    // permission if needed, and only flip the toggle after the
                    // user grants it. Placed where the "מסלול" chip used to be.
                    ActionChip(
                        label = if (voiceControlEnabled) "🎤 קול פעיל" else "🎙️ קול",
                        containerColor = if (voiceControlEnabled) Color(0xFFD84315) else SlateGray,
                        contentColor = Color.White
                    ) {
                        if (voiceControlEnabled) {
                            viewModel.toggleVoiceControl()
                        } else {
                            val granted = androidx.core.content.ContextCompat.checkSelfPermission(
                                context, android.Manifest.permission.RECORD_AUDIO
                            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                            if (granted) {
                                viewModel.toggleVoiceControl()
                            } else {
                                micPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    }
                    // Narration toggle — when ON the chip turns blue + icon
                    // changes, when OFF it stays slate-gray with the "mic off"
                    // icon. New rides are read out loud by the TTS engine
                    // (works while the app is closed via the foreground service).
                    ActionChip(
                        label = if (ttsEnabled) "🔊 קריינות" else "🔇 שקט",
                        containerColor = if (ttsEnabled) Color(0xFF1565C0) else SlateGray,
                        contentColor = Color.White
                    ) {
                        viewModel.toggleTts()
                    }
                }
            }

            // Keyword chips
            if (keywords.isNotEmpty() || true) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            // Drop bottom padding to 0 so the km row below
                            // sits flush against this one (user request).
                            .padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 0.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        keywords.forEach { kw ->
                            val isPaused = pausedKeywords.contains(kw)
                            KeywordChip(
                                text = kw,
                                active = !isPaused,
                                onTap = { viewModel.toggleKeyword(kw, isPaused) }
                            )
                        }
                        // Add chip
                        FilterChip(
                            selected = false,
                            onClick = { showAddKeywordDialog = true },
                            label = { Text("+ הוסף", fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = CardBg,
                                labelColor = TextSecondary
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                borderColor = Border, borderWidth = 0.5.dp, enabled = true, selected = false
                            )
                        )
                    }
                }
            }

            // Km-range filter row — a horizontal strip of distance chips below
            // the keywords. Only shown when the user turned it on in Settings
            // (default off). Single-select: tapping the active chip clears it.
            // The "+ הוסף" chip opens a small dialog to add a custom km value.
            // Long-press (via separate chip for now — delete via re-tap add) is
            // not implemented; user can remove via settings / re-add if needed.
            if (kmFilterVisible) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            // Pull the row up with a negative offset — FilterChip
                            // has ~12dp internal padding that the user perceives
                            // as a gap. The offset puts the chips visually flush
                            // against the keyword row above.
                            .offset(y = (-12).dp)
                            .padding(start = 12.dp, end = 12.dp, top = 0.dp, bottom = 0.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        kmOptions.forEach { km ->
                            KmChip(
                                km = km,
                                selected = selectedKm == km,
                                onTap = { viewModel.selectKm(km) },
                                onLongPress = { viewModel.removeKmOption(km) }
                            )
                        }
                        FilterChip(
                            selected = false,
                            onClick = { showAddKmDialog = true; newKmText = "" },
                            label = { Text("+ הוסף", fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = CardBg,
                                labelColor = TextSecondary
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                borderColor = Border, borderWidth = 0.5.dp, enabled = true, selected = false
                            )
                        )
                    }
                }
            }

            // Rides feed
            if (rides.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 64.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.DirectionsCar, null,
                                modifier = Modifier.size(64.dp),
                                tint = Color(0xFFCFD8DC)
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "אין נסיעות כרגע",
                                fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                                color = TextSecondary
                            )
                            Text(
                                if (!isAvailable) "הפעל פנוי כדי לקבל נסיעות" else "ממתין לנסיעות...",
                                fontSize = 13.sp, color = Color(0xFFB0BEC5)
                            )
                        }
                    }
                }
            } else {
                items(rides, key = { it.messageId }) { ride ->
                    RideCard(
                        ride = ride,
                        sentButtons = sentButtons,
                        onAction = { action -> viewModel.performAction(ride, action) },
                        onNavigateToChat = onNavigateToChat
                    )
                }
            }
        }
    }

    if (showAddKeywordDialog) {
        AlertDialog(
            onDismissRequest = { showAddKeywordDialog = false; newKeyword = ""; newKeywordDest = "" },
            title = { Text("הוסף אזור / מסלול") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = newKeyword, onValueChange = { newKeyword = it },
                        label = { Text("אזור יציאה (חובה)") }, singleLine = true,
                        placeholder = { Text("לדוגמה: בב, תא, ים", color = TextSecondary) },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newKeywordDest, onValueChange = { newKeywordDest = it },
                        label = { Text("יעד (אופציונלי)") }, singleLine = true,
                        placeholder = { Text("לדוגמה: ים, בב", color = TextSecondary) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newKeyword.isNotBlank()) {
                        val kw = if (newKeywordDest.isNotBlank())
                            "${newKeyword.trim()}_${newKeywordDest.trim()}"
                        else
                            newKeyword.trim()
                        viewModel.addKeyword(kw)
                    }
                    showAddKeywordDialog = false; newKeyword = ""; newKeywordDest = ""
                }) { Text("הוסף") }
            },
            dismissButton = {
                TextButton(onClick = { showAddKeywordDialog = false; newKeyword = ""; newKeywordDest = "" }) {
                    Text("ביטול")
                }
            }
        )
    }

    // Add-km dialog for the km-filter row
    if (showAddKmDialog) {
        AlertDialog(
            onDismissRequest = { showAddKmDialog = false; newKmText = "" },
            title = { Text("הוסף טווח ק״מ") },
            text = {
                Column {
                    Text("הקלד מספר חיובי (למשל 15)", color = TextSecondary, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newKmText,
                        onValueChange = { newKmText = it.filter { c -> c.isDigit() } },
                        label = { Text("ק״מ") },
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "טיפ: לחיצה ארוכה על צ'יפ קיים תמחק אותו",
                        color = TextSecondary, fontSize = 11.sp
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val v = newKmText.trim().toIntOrNull()
                    if (v != null && v > 0) viewModel.addKmOption(v)
                    showAddKmDialog = false; newKmText = ""
                }) { Text("הוסף") }
            },
            dismissButton = {
                TextButton(onClick = { showAddKmDialog = false; newKmText = "" }) { Text("ביטול") }
            }
        )
    }
}

@Composable
fun ActionChip(
    label: String,
    containerColor: Color,
    contentColor: Color,
    border: Boolean = false,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = containerColor, contentColor = contentColor),
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
        border = if (border) androidx.compose.foundation.BorderStroke(0.5.dp, Border) else null,
        elevation = ButtonDefaults.buttonElevation(0.dp)
    ) {
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun KeywordChip(
    text: String,
    active: Boolean,
    onTap: () -> Unit
) {
    Box(
        modifier = Modifier
            .background(
                color = if (active) Primary else Color(0xFFEEEEEE),
                shape = RoundedCornerShape(20.dp)
            )
            .clickable { onTap() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text, fontSize = 11.sp,
            color = if (active) Color.White else TextSecondary,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * Km-range chip — matches the KeywordChip style but is single-select
 * (controlled by [selected]) and long-press deletes the option.
 * Used only in the km-filter row below the keyword chips.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun KmChip(
    km: Int,
    selected: Boolean,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
) {
    Box(
        modifier = Modifier
            .background(
                color = if (selected) Primary else Color(0xFFEEEEEE),
                shape = RoundedCornerShape(20.dp)
            )
            .combinedClickable(
                onClick = onTap,
                onLongClick = onLongPress,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "$km ק״מ", fontSize = 11.sp,
            color = if (selected) Color.White else TextSecondary,
            fontWeight = FontWeight.Medium
        )
    }
}
