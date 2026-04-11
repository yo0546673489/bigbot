package com.wabot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.data.models.ChatMessage
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.viewmodel.HomeViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun ChatScreen(viewModel: HomeViewModel, dispatcherPhone: String = "", dispatcherName: String = "סדרן") {
    val chatMessages by viewModel.chatMessages.collectAsState()
    val listState = rememberLazyListState()
    var inputText by remember { mutableStateOf("") }

    val quickReplies = listOf("אני בדרך", "עוד 5 דקות", "תתקשר אליי", "שלח מיקום")

    LaunchedEffect(chatMessages.size) {
        if (chatMessages.isNotEmpty()) listState.animateScrollToItem(chatMessages.size - 1)
    }

    Column(modifier = Modifier.fillMaxSize().background(BigBotColors.PageBg)) {

        // Header
        Surface(color = BigBotColors.CardBg, shadowElevation = 2.dp) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = BigBotColors.PrimaryBg,
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                        Text("👤", fontSize = 20.sp)
                    }
                }
                Column {
                    Text(dispatcherName, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = BigBotColors.TextPrimary)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = BigBotColors.Primary,
                            modifier = Modifier.size(7.dp)
                        ) {}
                        Text("מחובר", fontSize = 11.sp, color = BigBotColors.TextSecondary)
                    }
                }
            }
        }

        // Messages
        if (chatMessages.isEmpty()) {
            Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text("אין הודעות עדיין", fontSize = 14.sp, color = BigBotColors.TextSecondary)
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(chatMessages) { msg ->
                    ChatBubble(msg)
                }
            }
        }

        // Quick reply chips
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(BigBotColors.CardBg)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            quickReplies.forEach { reply ->
                FilterChip(
                    selected = false,
                    onClick = {
                        viewModel.sendChatMessage(dispatcherPhone, reply)
                    },
                    label = { Text(reply, fontSize = 11.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = BigBotColors.PrimaryBg,
                        labelColor = BigBotColors.Primary
                    )
                )
            }
        }

        // Input area
        Surface(color = BigBotColors.CardBg, shadowElevation = 4.dp) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    placeholder = { Text("כתוב הודעה...", fontSize = 14.sp) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 3
                )
                IconButton(
                    onClick = {
                        if (inputText.isNotBlank()) {
                            viewModel.sendChatMessage(dispatcherPhone, inputText.trim())
                            inputText = ""
                        }
                    },
                    enabled = inputText.isNotBlank(),
                    modifier = Modifier
                        .size(44.dp)
                        .background(
                            color = if (inputText.isNotBlank()) BigBotColors.Primary else Color(0xFFCCCCCC),
                            shape = RoundedCornerShape(50)
                        )
                ) {
                    Icon(Icons.Default.Send, contentDescription = "שלח", tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(msg: ChatMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (msg.isOutgoing) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 16.dp, topEnd = 16.dp,
                bottomStart = if (msg.isOutgoing) 16.dp else 4.dp,
                bottomEnd = if (msg.isOutgoing) 4.dp else 16.dp
            ),
            color = if (msg.isOutgoing) BigBotColors.Primary else Color.White,
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(
                    text = msg.text,
                    color = if (msg.isOutgoing) Color.White else BigBotColors.TextPrimary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )
                Text(
                    text = formatMsgTime(msg.timestamp),
                    color = if (msg.isOutgoing) Color.White.copy(alpha = 0.7f) else BigBotColors.TextSecondary,
                    fontSize = 10.sp,
                    modifier = Modifier.align(Alignment.End)
                )
            }
        }
    }
}

private fun formatMsgTime(ts: Long): String {
    if (ts == 0L) return ""
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ts))
}
