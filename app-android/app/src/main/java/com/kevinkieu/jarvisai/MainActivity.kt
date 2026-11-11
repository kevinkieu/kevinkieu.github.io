package com.kevinkieu.jarvisai

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.lifecycle.lifecycleScope
import com.kevinkieu.jarvisai.ui.chat.ChatScreen
import com.kevinkieu.jarvisai.ui.chat.ChatViewModel
import com.kevinkieu.jarvisai.ui.sync.SettingsScreen
import com.kevinkieu.jarvisai.ui.theme.JarvisAITheme
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as JarvisApp
        val viewModel = ChatViewModel(
            dao = app.database.jarvisDao(),
            geminiApi = app.geminiApi,
            syncService = app.syncService,
            keyManager = app.keyManager
        )

        lifecycleScope.launch {
            viewModel.statusToast.collectLatest { msg ->
                Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
            }
        }

        setContent {
            JarvisAITheme {
                var currentScreen by remember { mutableStateOf("chat") }

                if (currentScreen == "chat") {
                    ChatScreen(
                        viewModel = viewModel,
                        onOpenSettings = { currentScreen = "settings" }
                    )
                } else {
                    SettingsScreen(
                        keyManager = app.keyManager,
                        onBack = { currentScreen = "chat" }
                    )
                }
            }
        }
    }
}
