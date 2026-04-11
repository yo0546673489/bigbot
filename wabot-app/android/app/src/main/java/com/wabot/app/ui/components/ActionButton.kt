package com.wabot.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wabot.app.ui.theme.BigBotColors
import com.wabot.app.ui.viewmodel.ButtonState
import kotlinx.coroutines.launch

@Composable
fun ActionButton(
    label: String,
    color: Color,
    state: ButtonState,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val scale = remember { Animatable(1f) }

    val displayText = when (state) {
        ButtonState.IDLE    -> label
        ButtonState.SENDING -> "מתבצע..."
        ButtonState.SENT    -> "נשלח ✓"
        ButtonState.FAILED  -> "נכשל ✕"
    }
    val bgColor = when (state) {
        ButtonState.IDLE    -> color
        ButtonState.SENDING -> color.copy(alpha = 0.7f)
        ButtonState.SENT    -> color
        ButtonState.FAILED  -> BigBotColors.Red
    }

    Button(
        onClick = {
            if (state == ButtonState.IDLE) {
                scope.launch {
                    scale.animateTo(0.95f, spring(dampingRatio = 0.5f))
                    scale.animateTo(1f, spring(dampingRatio = 0.7f))
                }
                onClick()
            }
        },
        enabled = state == ButtonState.IDLE,
        colors = ButtonDefaults.buttonColors(
            containerColor = bgColor,
            disabledContainerColor = bgColor
        ),
        shape = RoundedCornerShape(10.dp),
        modifier = modifier
            .scale(scale.value)
            .height(34.dp)
    ) {
        Text(
            text = displayText,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 11.sp
        )
    }
}
