package com.bigbot.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = Color.White,
    primaryContainer = PrimaryBg,
    onPrimaryContainer = GreenDark,
    background = PageBg,
    onBackground = TextPrimary,
    surface = CardBg,
    onSurface = TextPrimary,
    error = AppRed,
    outline = Border,
)

@Composable
fun BigBotTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = AppTypography,
        content = content
    )
}
