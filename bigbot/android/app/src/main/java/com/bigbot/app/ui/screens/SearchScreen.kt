package com.bigbot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.SearchViewModel

@Composable
fun SearchScreen(viewModel: SearchViewModel = hiltViewModel()) {
    val pairCode by viewModel.pairCode.collectAsState()
    val pairStatus by viewModel.pairStatus.collectAsState()
    val keywords by viewModel.keywords.collectAsState()
    val pausedKeywords by viewModel.pausedKeywords.collectAsState()
    val waConnected by viewModel.waConnected.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()

    var phoneInput by remember { mutableStateOf("") }
    var showAddDialog by remember { mutableStateOf(false) }
    var newKeyword by remember { mutableStateOf("") }
    val clipboard = LocalClipboardManager.current

    statusMessage?.let { msg ->
        LaunchedEffect(msg) {
            kotlinx.coroutines.delay(5000)
            viewModel.clearStatus()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(Color(0xFFFAFCFA))) {
        Box(
            modifier = Modifier.fillMaxWidth().background(CardBg)
                .statusBarsPadding()
                .padding(horizontal = 18.dp, vertical = 14.dp)
        ) {
            Column {
                Text("חיבור וחיפוש", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = GreenDark)
                Text("הגדרת המערכת", fontSize = 12.sp, color = TextSecondary)
            }
        }
        HorizontalDivider(color = Border, thickness = 0.5.dp)

        statusMessage?.let { msg ->
            Box(modifier = Modifier.fillMaxWidth().background(GreenBg).padding(12.dp), contentAlignment = Alignment.Center) {
                Text(msg, color = GreenDark, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // WhatsApp connect section
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = CardBg),
                    shape = RoundedCornerShape(16.dp),
                    border = androidx.compose.foundation.BorderStroke(0.5.dp, Border),
                    elevation = CardDefaults.cardElevation(0.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Logo
                        Box(
                            modifier = Modifier.size(70.dp).clip(CircleShape).background(GreenBg),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("📱", fontSize = 30.sp)
                        }
                        Spacer(Modifier.height(10.dp))
                        Text("חבר את הוואטסאפ", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = GreenDark)
                        Text(
                            "הכנס מספר טלפון ← קבל קוד ← הכנס במכשירים מקושרים",
                            fontSize = 10.sp, color = TextSecondary, lineHeight = 16.sp
                        )
                        Spacer(Modifier.height(12.dp))

                        OutlinedTextField(
                            value = phoneInput,
                            onValueChange = { phoneInput = it },
                            placeholder = { Text("0501234567", fontSize = 14.sp) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Primary, unfocusedBorderColor = Border
                            )
                        )
                        Spacer(Modifier.height(8.dp))

                        Button(
                            onClick = { if (phoneInput.isNotBlank()) viewModel.requestPairCode(phoneInput) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary),
                            shape = RoundedCornerShape(14.dp),
                            enabled = pairStatus != "loading"
                        ) {
                            if (pairStatus == "loading") {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                            } else {
                                Text("קבל קוד חיבור", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Code display
                        pairCode?.let { code ->
                            Spacer(Modifier.height(10.dp))
                            Box(
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                    .background(Color(0xFFF1F8F2))
                                    .padding(14.dp)
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                                    Text("הקוד שלך:", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Primary)
                                    Spacer(Modifier.height(6.dp))
                                    // Force LTR for the pairing code so RTL layout doesn't reverse
                                    // the character order (e.g. "5RHFVKRA" must NOT become "RHFVKRA5")
                                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                        Text(
                                            text = code.chunked(1).joinToString(" "),
                                            fontSize = 28.sp,
                                            fontWeight = FontWeight.Bold,
                                            letterSpacing = 4.sp,
                                            color = GreenDark,
                                            style = TextStyle(
                                                textDirection = TextDirection.Ltr,
                                                textAlign = TextAlign.Center
                                            )
                                        )
                                    }
                                    Text("הכנס בוואטסאפ → מכשירים מקושרים", fontSize = 10.sp, color = TextSecondary)
                                    Spacer(Modifier.height(6.dp))
                                    OutlinedButton(
                                        onClick = { clipboard.setText(AnnotatedString(code)) },
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary),
                                        border = androidx.compose.foundation.BorderStroke(1.dp, GreenBorder),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                                    ) {
                                        Text("📋 העתק קוד", fontSize = 11.sp)
                                    }
                                }
                            }
                        }

                        // Status
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                            val (dotColor, statusText) = when {
                                waConnected -> Color(0xFF4CAF50) to "מחובר!"
                                pairStatus == "waiting" -> AppOrange to "ממתין לחיבור..."
                                pairStatus == "error" -> AppRed to "שגיאה — נסה שוב"
                                else -> Color(0xFFCFD8DC) to "מנותק"
                            }
                            Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(dotColor))
                            Spacer(Modifier.width(5.dp))
                            Text(statusText, fontSize = 10.sp, color = if (waConnected) Color(0xFF388E3C) else TextSecondary)
                        }
                    }
                }
            }

            // Saved searches section
            item {
                Text("חיפושים שמורים", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Primary,
                    modifier = Modifier.padding(top = 4.dp))
            }

            items(keywords.size, key = { keywords[it] }) { index ->
                val kw = keywords[index]
                val isPaused = pausedKeywords.contains(kw)
                SavedSearchCard(
                    keyword = kw,
                    isPaused = isPaused,
                    onToggle = { viewModel.pauseKeyword(kw) },
                    onRemove = { viewModel.removeKeyword(kw) }
                )
            }

            item {
                Button(
                    onClick = { showAddDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("+ הוסף מסלול חדש", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            // Abbreviations legend
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F8F2)),
                    shape = RoundedCornerShape(10.dp),
                    border = androidx.compose.foundation.BorderStroke(0.5.dp, Border),
                    elevation = CardDefaults.cardElevation(0.dp)
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text("קיצורים:", fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF558B2F))
                        Spacer(Modifier.height(3.dp))
                        Text(
                            "בב=בני ברק | ים=ירושלים | שמש=בית שמש | תא=תל אביב | פת=פתח תקווה | ספר=מודיעין עילית",
                            fontSize = 9.sp, color = TextSecondary, lineHeight = 15.sp
                        )
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AlertDialog(
            onDismissRequest = { showAddDialog = false; newKeyword = "" },
            title = { Text("הוסף מסלול חדש") },
            text = {
                Column {
                    Text("לדוגמה: בב, בב_ים, תא_שמש", color = TextSecondary, fontSize = 13.sp)
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
                    if (newKeyword.isNotBlank()) viewModel.addKeyword(newKeyword.trim())
                    showAddDialog = false; newKeyword = ""
                }) { Text("הוסף") }
            },
            dismissButton = { TextButton(onClick = { showAddDialog = false }) { Text("ביטול") } }
        )
    }
}

@Composable
fun SavedSearchCard(
    keyword: String,
    isPaused: Boolean,
    onToggle: () -> Unit,
    onRemove: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(
            width = if (!isPaused) 3.dp else 0.5.dp,
            color = if (!isPaused) Primary else Border
        ).let { androidx.compose.foundation.BorderStroke(0.5.dp, Border) },
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp, 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(modifier = Modifier.width(3.dp).height(36.dp).clip(RoundedCornerShape(2.dp))
                    .background(if (!isPaused) Primary else Color(0xFFE0E0E0)))
                Column {
                    Text(keyword, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                    Text(keywordDescription(keyword), fontSize = 9.sp, color = TextSecondary)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier.clip(RoundedCornerShape(12.dp))
                        .background(if (!isPaused) GreenBg else Color(0xFFEEEEEE))
                        .clickable { onToggle() }
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(
                        if (!isPaused) "פעיל" else "מושהה",
                        fontSize = 8.sp, fontWeight = FontWeight.SemiBold,
                        color = if (!isPaused) GreenDark else TextSecondary
                    )
                }
                IconButton(onClick = onRemove, modifier = Modifier.size(24.dp)) {
                    Icon(Icons.Default.Close, null, tint = AppRed, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

fun keywordDescription(keyword: String): String {
    if (!keyword.contains("_")) {
        return when (keyword) {
            "בב" -> "בני ברק ← כל יעד"
            "ים" -> "ירושלים ← כל יעד"
            "תא" -> "תל אביב ← כל יעד"
            "פת" -> "פתח תקווה ← כל יעד"
            "שמש" -> "בית שמש ← כל יעד"
            "ספר" -> "מודיעין עילית ← כל יעד"
            else -> "$keyword ← כל יעד"
        }
    }
    val parts = keyword.split("_")
    val from = cityName(parts[0])
    val to = cityName(parts.getOrElse(1) { "" })
    return "$from ← $to"
}

fun cityName(code: String) = when (code) {
    "בב" -> "בני ברק"
    "ים" -> "ירושלים"
    "תא" -> "תל אביב"
    "פת" -> "פתח תקווה"
    "שמש" -> "בית שמש"
    "ספר" -> "מודיעין עילית"
    "נת" -> "נתניה"
    else -> code
}
