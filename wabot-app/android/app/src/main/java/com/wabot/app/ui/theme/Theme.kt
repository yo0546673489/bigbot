package com.wabot.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Primary = Color(0xFF2E7D32)
val PrimaryDark = Color(0xFF1B5E20)
val Secondary = Color(0xFF25D366)
val Background = Color(0xFFF6FBF7)
val Surface = Color(0xFFFFFFFF)
val Error = Color(0xFFC62828)
val OnPrimary = Color(0xFFFFFFFF)
val OnSecondary = Color(0xFFFFFFFF)
val CardBackground = Color(0xFFFFFFFF)
val RideCardBorder = Color(0xFFE0F2E9)
val AvailableGreen = Color(0xFF2E7D32)
val BusyRed = Color(0xFFC62828)

private val LightColors = lightColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    secondary = Secondary,
    onSecondary = OnSecondary,
    background = Background,
    surface = Surface,
    error = Error,
)

@Composable
fun WabotTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        content = content
    )
}
