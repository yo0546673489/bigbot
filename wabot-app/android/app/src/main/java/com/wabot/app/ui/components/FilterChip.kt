package com.wabot.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.ui.theme.BigBotColors
import kotlinx.coroutines.launch

@Composable
fun BigBotFilterChip(
    keyword: String,
    displayText: String,
    isActive: Boolean,
    onToggle: () -> Unit,
    onLongPress: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val scale = remember { Animatable(1f) }

    Box(
        modifier = Modifier
            .scale(scale.value)
            .background(
                color = if (isActive) BigBotColors.Primary else Color.White,
                shape = RoundedCornerShape(20.dp)
            )
            .border(
                width = if (isActive) 0.dp else 0.5.dp,
                color = if (isActive) Color.Transparent else BigBotColors.ChipBorder,
                shape = RoundedCornerShape(20.dp)
            )
            .pointerInput(isActive) {
                detectTapGestures(
                    onTap = {
                        scope.launch {
                            scale.animateTo(0.93f, spring(dampingRatio = 0.5f, stiffness = 300f))
                            scale.animateTo(1f, spring(dampingRatio = 0.6f))
                        }
                        onToggle()
                    },
                    onLongPress = { onLongPress() }
                )
            }
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Text(
            text = displayText,
            color = if (isActive) Color.White else BigBotColors.TextSecondary,
            fontSize = 12.sp,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal
        )
    }
}

@Composable
fun AddKeywordChip(onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = BigBotColors.Primary),
        border = androidx.compose.foundation.BorderStroke(1.dp, BigBotColors.PrimaryLight),
        modifier = Modifier.height(32.dp)
    ) {
        Text("+ הוסף", fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun KeywordLongPressMenu(
    keyword: String,
    onDismiss: () -> Unit,
    onDelete: () -> Unit,
    onEdit: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(keyword, fontWeight = FontWeight.Bold) },
        text = { Text("מה תרצה לעשות עם הסינון הזה?") },
        confirmButton = {
            TextButton(onClick = { onDelete(); onDismiss() }) {
                Text("מחק", color = BigBotColors.Red, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = { onEdit(); onDismiss() }) {
                Text("ערוך", color = BigBotColors.Primary)
            }
        }
    )
}
