package com.bigbot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.outlined.EmojiEmotions
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
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.bigbot.app.data.models.ChatMessage
import com.bigbot.app.data.models.Conversation
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.ChatViewModel
import java.text.SimpleDateFormat
import java.util.*

// === WhatsApp palette (local) ===
private val WaBg = Color(0xFFEAE6D6)
private val WaOutBubble = Color(0xFFDCF8C6)
private val WaInBubble = Color(0xFFFFFFFF)
private val WaTimeOut = Color(0xFF7A8A7A)
private val WaTimeIn = Color(0xFF9AA09A)
private val WaTick = Color(0xFF4FC3F7)
private val WaRideCtxBg = Color(0xFFFFF9C4)
private val WaRideCtxBorder = Color(0xFFFFE082)
private val WaRideCtxText = Color(0xFF5D4037)
private val WaInputIcon = Color(0xFF54656F)
private val WaPlaceholder = Color(0xFF3B4A54)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel = hiltViewModel()) {
    val conversations by viewModel.conversations.collectAsState()
    val selected by viewModel.selected.collectAsState()
    val messages by viewModel.messages.collectAsState()
    val quickReplies by viewModel.quickReplies.collectAsState()

    if (selected == null) {
        ChatListView(
            conversations = conversations,
            onOpen = { viewModel.openConversation(it.phone) }
        )
    } else {
        ConversationView(
            conversation = selected!!,
            messages = messages,
            quickReplies = quickReplies,
            onBack = { viewModel.closeConversation() },
            onSend = { viewModel.sendMessage(it) },
            onQuickReply = { viewModel.sendQuickReply(it) }
        )
    }
}

// ============================================================
// Chat list (mockup A)
// ============================================================
@Composable
private fun ChatListView(
    conversations: List<Conversation>,
    onOpen: (Conversation) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().background(CardBg)) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardBg)
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "WhatsApp",
                fontSize = 26.sp,
                fontWeight = FontWeight.Black,
                color = Color.Black,
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.Default.MoreVert, "עוד",
                tint = WaInputIcon, modifier = Modifier.size(20.dp)
            )
        }
        HorizontalDivider(color = Border, thickness = 0.5.dp)

        if (conversations.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("💬", fontSize = 48.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "אין שיחות עדיין",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextSecondary
                    )
                    Text(
                        "שיחות עם סדרנים יופיעו כאן",
                        fontSize = 12.sp,
                        color = Color(0xFFB0BEC5)
                    )
                }
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(conversations, key = { it.phone }) { conv ->
                    ChatListRow(conv = conv, onClick = { onOpen(conv) })
                    HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                }
            }
        }
    }
}

@Composable
private fun AvatarImage(url: String?, name: String, size: Int, bgColor: Color, textSize: Int) {
    val context = LocalContext.current
    val safeUrl = url.orEmpty()
    var showInitials by remember(safeUrl) { mutableStateOf(safeUrl.isBlank()) }
    Box(
        modifier = Modifier.size(size.dp).clip(CircleShape).background(bgColor),
        contentAlignment = Alignment.Center
    ) {
        // Always show initials as background layer
        Text(initialsOf(name), color = Color.White, fontSize = textSize.sp, fontWeight = FontWeight.Bold)
        // Overlay profile picture when URL is available
        if (safeUrl.isNotBlank() && !showInitials) {
            AsyncImage(
                model = ImageRequest.Builder(context).data(safeUrl).crossfade(true).build(),
                contentDescription = name,
                modifier = Modifier.fillMaxSize().clip(CircleShape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                onSuccess = { showInitials = false },
                onError = { showInitials = true }
            )
        }
    }
    LaunchedEffect(safeUrl) { if (safeUrl.isNotBlank()) showInitials = false }
}

@Composable
private fun ChatListRow(conv: Conversation, onClick: () -> Unit) {
    val avatarColors = listOf(
        Color(0xFF2E7D32), Color(0xFF1565C0), Color(0xFF5E35B1),
        Color(0xFFF9A825), Color(0xFF00897B)
    )
    val avatarColor = avatarColors[(conv.phone.hashCode().let { if (it < 0) -it else it }) % avatarColors.size]
    val time = formatChatListTime(conv.lastTimestamp)
    val hasUnread = conv.unreadCount > 0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        AvatarImage(url = conv.avatarUrl, name = conv.name, size = 48, bgColor = avatarColor, textSize = 16)
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    conv.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary,
                    modifier = Modifier.weight(1f),
                    maxLines = 1
                )
                Text(
                    time,
                    fontSize = 11.sp,
                    color = if (hasUnread) GreenDark else Color(0xFF90A4AE),
                    fontWeight = if (hasUnread) FontWeight.SemiBold else FontWeight.Medium
                )
            }
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when {
                        conv.lastMessage.isNotBlank() && conv.lastFromMe -> "✓✓ ${conv.lastMessage}"
                        conv.lastMessage.isNotBlank() -> conv.lastMessage
                        conv.rideOrigin.isNotBlank() || conv.rideDestination.isNotBlank() ->
                            "📍 ${conv.rideOrigin} ← ${conv.rideDestination}"
                        else -> "התחל שיחה"
                    },
                    fontSize = 13.sp,
                    color = Color(0xFF667781),
                    modifier = Modifier.weight(1f),
                    maxLines = 1
                )
                if (hasUnread) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
                            .clip(CircleShape)
                            .background(GreenDark)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            conv.unreadCount.toString(),
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

// ============================================================
// Conversation (mockup B) — WhatsApp-style chat
// ============================================================
@Composable
private fun ConversationView(
    conversation: Conversation,
    messages: List<ChatMessage>,
    quickReplies: List<String>,
    onBack: () -> Unit,
    onSend: (String) -> Unit,
    onQuickReply: (String) -> Unit
) {
    val listState = rememberLazyListState()
    var inputText by remember { mutableStateOf("") }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    // imePadding() pushes the whole conversation column up when the keyboard
    // opens so the input row + the last messages stay visible. Without this,
    // the input was staying pinned at the bottom behind the keyboard and the
    // user couldn't see what they were typing.
    Column(modifier = Modifier.fillMaxSize().background(WaBg).imePadding()) {
        // === Header ===
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardBg)
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "חזור",
                tint = GreenDark,
                modifier = Modifier.size(22.dp).clickable { onBack() }
            )
            AvatarImage(url = conversation.avatarUrl, name = conversation.name, size = 38, bgColor = GreenDark, textSize = 13)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    conversation.name.ifEmpty { conversation.phone },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = GreenDark,
                    maxLines = 1
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(GreenLight))
                    Spacer(Modifier.width(4.dp))
                    Text("מחובר", fontSize = 11.sp, color = GreenLight)
                }
            }
            Icon(Icons.Default.Phone, "התקשר", tint = WaInputIcon, modifier = Modifier.size(18.dp))
            Icon(Icons.Default.MoreVert, "עוד", tint = WaInputIcon, modifier = Modifier.size(18.dp))
        }
        HorizontalDivider(color = Border, thickness = 0.5.dp)

        // === Body (beige) ===
        Box(modifier = Modifier.weight(1f).background(WaBg)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                contentPadding = PaddingValues(vertical = 12.dp)
            ) {
                // Ride context chip if we have ride info
                if (conversation.rideOrigin.isNotBlank() || conversation.rideDestination.isNotBlank() || conversation.ridePrice.isNotBlank()) {
                    item {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(WaRideCtxBg)
                                    .border(0.5.dp, WaRideCtxBorder, RoundedCornerShape(8.dp))
                                    .padding(horizontal = 14.dp, vertical = 6.dp)
                            ) {
                                val price = if (conversation.ridePrice.isNotBlank()) " • ${conversation.ridePrice}₪" else ""
                                Text(
                                    "📍 ${conversation.rideOrigin} ← ${conversation.rideDestination}$price",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = WaRideCtxText
                                )
                            }
                        }
                    }
                }

                items(messages, key = { it.id }) { msg ->
                    MessageBubble(msg)
                }
            }
        }

        // === Bottom area: quick replies + input bar on white bg ===
        Column(modifier = Modifier.fillMaxWidth().background(Color.White)) {
        // === Quick replies row ===
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp, bottom = 4.dp)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            quickReplies.forEach { reply ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFFF0F0F0))
                        .border(0.5.dp, GreenBorder, RoundedCornerShape(20.dp))
                        .clickable { onQuickReply(reply) }
                        .padding(horizontal = 14.dp, vertical = 7.dp)
                ) {
                    Text(reply, fontSize = 12.sp, color = GreenDark, fontWeight = FontWeight.Medium)
                }
            }
        }

        // === Input bar (WhatsApp-style) — flush with keyboard ===
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp)
                    .clip(RoundedCornerShape(30.dp))
                    .background(Color.White)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(Icons.Outlined.EmojiEmotions, "אימוג'י", tint = WaInputIcon, modifier = Modifier.size(22.dp))
                Icon(Icons.Default.AttachFile, "קובץ", tint = WaInputIcon, modifier = Modifier.size(20.dp))
                BasicChatField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    modifier = Modifier.weight(1f)
                )
                Icon(Icons.Default.CameraAlt, "מצלמה", tint = WaInputIcon, modifier = Modifier.size(22.dp))
            }
            val hasText = inputText.isNotBlank()
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(GreenDark)
                    .clickable {
                        if (hasText) {
                            onSend(inputText.trim())
                            inputText = ""
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (hasText) Icons.AutoMirrored.Filled.Send else Icons.Default.Mic,
                    contentDescription = if (hasText) "שלח" else "מיקרופון",
                    tint = Color.White,
                    modifier = Modifier.size(if (hasText) 22.dp else 26.dp)
                )
            }
        }
        } // end bottom area Column(white)
    }
}

private fun formatChatListTime(timestamp: Long): String {
    if (timestamp <= 0L) return ""
    val now = Calendar.getInstance()
    val then = Calendar.getInstance().apply { timeInMillis = timestamp }
    val sameDay = now.get(Calendar.YEAR) == then.get(Calendar.YEAR) &&
            now.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR)
    val yesterday = now.apply { add(Calendar.DAY_OF_YEAR, -1) }
    val isYesterday = yesterday.get(Calendar.YEAR) == then.get(Calendar.YEAR) &&
            yesterday.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR)
    return when {
        sameDay -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timestamp))
        isYesterday -> "אתמול"
        else -> SimpleDateFormat("d.M.yyyy", Locale.getDefault()).format(Date(timestamp))
    }
}

@Composable
private fun BasicChatField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        textStyle = androidx.compose.ui.text.TextStyle(
            fontSize = 15.sp,
            color = TextPrimary
        ),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(GreenDark),
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) {
                    Text("הודעה", fontSize = 15.sp, color = WaPlaceholder)
                }
                inner()
            }
        }
    )
}

private val WaQuotedBg = Color(0xFFD1F4C1)         // slightly darker green for outgoing quote
private val WaQuotedBgIn = Color(0xFFF0F0F0)       // gray for incoming quote
private val WaQuoteBar = Color(0xFF1B5E20)         // dark green vertical accent bar

@Composable
fun MessageBubble(msg: ChatMessage) {
    val time = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(msg.timestamp))

    Row(
        modifier = Modifier.fillMaxWidth(),
        // RTL: End = visual LEFT (outgoing/mine), Start = visual RIGHT (incoming/other)
        horizontalArrangement = if (msg.isOutgoing) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 270.dp)
                .clip(
                    // Outgoing on visual LEFT → no rounding bottom-left (= bottomEnd in RTL)
                    // Incoming on visual RIGHT → no rounding bottom-right (= bottomStart in RTL)
                    RoundedCornerShape(
                        topStart = 8.dp,
                        topEnd = 8.dp,
                        bottomStart = if (msg.isOutgoing) 8.dp else 0.dp,
                        bottomEnd = if (msg.isOutgoing) 0.dp else 8.dp
                    )
                )
                .background(if (msg.isOutgoing) WaOutBubble else WaInBubble)
                .padding(3.dp)
        ) {
            Column {
                // Quoted reply block — like WhatsApp
                if (msg.quotedText.isNotBlank()) {
                    Row(
                        modifier = Modifier
                            .padding(bottom = 3.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (msg.isOutgoing) WaQuotedBg else WaQuotedBgIn)
                            .height(IntrinsicSize.Min)
                    ) {
                        // Vertical accent bar
                        Box(
                            modifier = Modifier
                                .width(3.dp)
                                .fillMaxHeight()
                                .background(WaQuoteBar)
                        )
                        Column(
                            modifier = Modifier.padding(start = 8.dp, end = 8.dp, top = 5.dp, bottom = 5.dp)
                        ) {
                            // First line bold (like the sender header in WhatsApp quotes)
                            val lines = msg.quotedText.split('\n')
                            Text(
                                lines.first(),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = WaQuoteBar,
                                lineHeight = 15.sp
                            )
                            if (lines.size > 1) {
                                Text(
                                    lines.drop(1).joinToString("\n"),
                                    fontSize = 12.sp,
                                    color = Color(0xFF555555),
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }
                }
                // Main text + bottom-anchored time
                Box {
                    Text(
                        msg.text,
                        fontSize = 13.5.sp,
                        color = TextPrimary,
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(start = 6.dp, top = 3.dp, end = 6.dp, bottom = 15.dp)
                    )
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(start = 6.dp, end = 6.dp, bottom = 1.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Text(
                            time,
                            fontSize = 10.sp,
                            color = if (msg.isOutgoing) WaTimeOut else WaTimeIn
                        )
                        if (msg.isOutgoing) {
                            Text("✓✓", fontSize = 11.sp, color = WaTick, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

private fun initialsOf(name: String): String {
    if (name.isBlank()) return "סד"
    val parts = name.trim().split(" ", "\t").filter { it.isNotEmpty() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}"
        parts[0].length >= 2 -> parts[0].substring(0, 2)
        else -> parts[0]
    }
}
