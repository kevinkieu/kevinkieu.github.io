package com.kevinkieu.jarvisai.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color

val BgDark = Color(0xFF0F172A)
val BgCardDark = Color(0xFF1E293B)
val PrimaryBlue = Color(0xFF2563EB)
val PrimaryCyan = Color(0xFF0284C7)
val AccentPurple = Color(0xFF8B5CF6)
val TextLight = Color(0xFFF8FAFC)
val TextMuted = Color(0xFF94A3B8)
val SuccessGreen = Color(0xFF10B981)

val JarvisColorScheme = darkColorScheme(
    primary = PrimaryBlue,
    secondary = PrimaryCyan,
    tertiary = AccentPurple,
    background = BgDark,
    surface = BgCardDark,
    onPrimary = Color.White,
    onBackground = TextLight,
    onSurface = TextLight
)
