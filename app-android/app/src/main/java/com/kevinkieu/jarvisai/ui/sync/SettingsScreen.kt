package com.kevinkieu.jarvisai.ui.sync

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Key
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kevinkieu.jarvisai.data.local.KeyManager
import com.kevinkieu.jarvisai.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    keyManager: KeyManager,
    onBack: () -> Unit
) {
    var gistPat by remember { mutableStateOf(keyManager.gistPat) }
    var gistId by remember { mutableStateOf(keyManager.gistId) }

    val apiKeys = remember {
        mutableStateListOf<String>().apply {
            for (i in 1..10) {
                add(keyManager.getApiKey(i))
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cài đặt & 10 Google Keys", color = Color.White, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BgCardDark)
            )
        },
        containerColor = BgDark
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Cloud Sync Section
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = BgCardDark),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("☁️ Đồng bộ Cloud (GitHub Gist)", fontWeight = FontWeight.Bold, color = PrimaryCyan, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = gistPat,
                            onValueChange = {
                                gistPat = it
                                keyManager.gistPat = it
                            },
                            label = { Text("GitHub Personal Access Token (PAT)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = gistId,
                            onValueChange = {
                                gistId = it
                                keyManager.gistId = it
                            },
                            label = { Text("Gist ID (Để trống nếu tạo mới)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            // 10 API Keys Section
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = BgCardDark),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("🔑 Danh sách 10 Google API Keys", fontWeight = FontWeight.Bold, color = AccentPurple, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(10.dp))

                        for (i in 1..10) {
                            OutlinedTextField(
                                value = apiKeys[i - 1],
                                onValueChange = { newVal ->
                                    apiKeys[i - 1] = newVal
                                    keyManager.setApiKey(i, newVal)
                                },
                                label = { Text("Google Key $i") },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                leadingIcon = {
                                    Icon(Icons.Default.Key, contentDescription = null, tint = TextMuted)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
