package com.kevinkieu.jarvisai.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kevinkieu.jarvisai.data.local.JarvisDao
import com.kevinkieu.jarvisai.data.local.KeyManager
import com.kevinkieu.jarvisai.data.model.MessageEntity
import com.kevinkieu.jarvisai.data.model.SessionEntity
import com.kevinkieu.jarvisai.data.remote.GeminiApiService
import com.kevinkieu.jarvisai.data.remote.GistSyncService
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class ChatViewModel(
    private val dao: JarvisDao,
    private val geminiApi: GeminiApiService,
    private val syncService: GistSyncService,
    val keyManager: KeyManager
) : ViewModel() {

    val sessions: StateFlow<List<SessionEntity>> = dao.getAllSessions()
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    private val _currentSessionId = MutableStateFlow<String?>(null)
    val currentSessionId: StateFlow<String?> = _currentSessionId.asStateFlow()

    private val _messages = MutableStateFlow<List<MessageEntity>>(emptyList())
    val messages: StateFlow<List<MessageEntity>> = _messages.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _statusToast = MutableSharedFlow<String>()
    val statusToast: SharedFlow<String> = _statusToast.asSharedFlow()

    init {
        viewModelScope.launch {
            sessions.collect { list ->
                if (_currentSessionId.value == null && list.isNotEmpty()) {
                    selectSession(list.first().id)
                } else if (list.isEmpty()) {
                    createNewSession()
                }
            }
        }
    }

    fun selectSession(sessionId: String) {
        _currentSessionId.value = sessionId
        viewModelScope.launch {
            dao.getMessagesForSession(sessionId).collect {
                _messages.value = it
            }
        }
    }

    fun createNewSession() {
        val newId = "s_" + System.currentTimeMillis()
        val count = sessions.value.size + 1
        val newSess = SessionEntity(id = newId, name = "Hội thoại $count")
        viewModelScope.launch {
            dao.insertOrUpdateSession(newSess)
            selectSession(newId)
        }
    }

    fun sendMessage(userText: String) {
        val sId = _currentSessionId.value ?: return
        if (userText.isBlank() || _isGenerating.value) return

        val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
        val userMsg = MessageEntity(
            sessionId = sId,
            role = "user",
            text = userText.trim(),
            timestamp = timeStr
        )

        viewModelScope.launch {
            dao.insertMessage(userMsg)

            _isGenerating.value = true
            val botMsgPlaceholder = MessageEntity(
                sessionId = sId,
                role = "model",
                text = "",
                timestamp = timeStr
            )
            val currentList = _messages.value.toMutableList()
            currentList.add(botMsgPlaceholder)
            _messages.value = currentList

            var responseAcc = ""
            geminiApi.streamChat(
                model = "gemini-3.6-flash",
                messages = _messages.value.dropLast(1),
                thinkingLevel = "minimal"
            ).collect { chunk ->
                responseAcc += chunk
                val updated = _messages.value.toMutableList()
                if (updated.isNotEmpty()) {
                    val last = updated.last()
                    updated[updated.size - 1] = last.copy(text = responseAcc)
                    _messages.value = updated
                }
            }

            // Save finalized message to Room DB
            val finalBotMsg = MessageEntity(
                sessionId = sId,
                role = "model",
                text = responseAcc,
                timestamp = timeStr
            )
            dao.insertMessage(finalBotMsg)
            _isGenerating.value = false
        }
    }

    fun triggerCloudSync() {
        viewModelScope.launch {
            _statusToast.emit("⏳ Đang đồng bộ GitHub Gist 2 chiều...")
            val res = syncService.sync2Way()
            res.onSuccess { gistId ->
                _statusToast.emit("✅ Đã đồng bộ Cloud Gist thành công ($gistId)!")
            }.onFailure { err ->
                _statusToast.emit("❌ Lỗi đồng bộ: ${err.message}")
            }
        }
    }
}
