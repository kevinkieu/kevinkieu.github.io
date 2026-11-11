package com.kevinkieu.jarvisai.data.remote

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.kevinkieu.jarvisai.data.local.JarvisDao
import com.kevinkieu.jarvisai.data.local.KeyManager
import com.kevinkieu.jarvisai.data.model.MessageEntity
import com.kevinkieu.jarvisai.data.model.SessionEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class GistSyncService(
    private val keyManager: KeyManager,
    private val dao: JarvisDao
) {
    private val client = OkHttpClient()
    private val gson = Gson()

    suspend fun sync2Way(): Result<String> = withContext(Dispatchers.IO) {
        val pat = keyManager.gistPat
        val gistId = keyManager.gistId

        if (pat.isBlank()) {
            return@withContext Result.failure(Exception("Vui lòng cấu hình GitHub PAT!"))
        }

        try {
            // 1. Fetch remote data if Gist ID exists
            var remoteSessions: List<SessionEntity> = emptyList()
            if (gistId.isNotBlank()) {
                val req = Request.Builder()
                    .url("https://api.github.com/gists/$gistId")
                    .addHeader("Authorization", "Bearer $pat")
                    .build()

                val res = client.newCall(req).execute()
                if (res.isSuccessful) {
                    val bodyStr = res.body?.string() ?: ""
                    val root = gson.fromJson(bodyStr, JsonObject::class.java)
                    val files = root.getAsJsonObject("files")
                    for (entry in files.entrySet()) {
                        val fileObj = entry.value.asJsonObject
                        val contentStr = fileObj.get("content")?.asString ?: ""
                        if (contentStr.isNotEmpty()) {
                            val backupObj = gson.fromJson(contentStr, JsonObject::class.java)
                            if (backupObj.has("sessions")) {
                                val sArr = backupObj.getAsJsonArray("sessions")
                                for (sElem in sArr) {
                                    val s = sElem.asJsonObject
                                    val sId = s.get("id")?.asString ?: continue
                                    val sName = s.get("name")?.asString ?: "Hội thoại"
                                    val entity = SessionEntity(id = sId, name = sName)
                                    dao.insertOrUpdateSession(entity)

                                    // Restore messages
                                    if (s.has("his")) {
                                        val his = s.getAsJsonArray("his")
                                        for (hElem in his) {
                                            val h = hElem.asJsonObject
                                            val role = h.get("role")?.asString ?: "user"
                                            val text = h.get("text")?.asString ?: ""
                                            val time = h.get("time")?.asString ?: ""
                                            dao.insertMessage(MessageEntity(sessionId = sId, role = role, text = text, timestamp = time))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. Export local merged sessions and push back
            val localSessions = dao.getAllSessions().first()
            val backupSessions = mutableListOf<Map<String, Any>>()
            for (sess in localSessions) {
                val msgs = dao.getMessagesForSession(sess.id).first()
                val hisList = msgs.map {
                    mapOf("role" to it.role, "text" to it.text, "time" to it.timestamp)
                }
                backupSessions.add(
                    mapOf(
                        "id" to sess.id,
                        "name" to sess.name,
                        "his" to hisList
                    )
                )
            }

            val fullBackup = mapOf(
                "brand" to "Jarvis AI Native",
                "version" to "2.0.0",
                "sessions" to backupSessions
            )
            val jsonContent = gson.toJson(fullBackup)

            val payload = mapOf(
                "description" to "Jarvis AI - Cloud Sync Personal Backup",
                "files" to mapOf(
                    "jarvis_ai_cloud_sync.json" to mapOf("content" to jsonContent)
                )
            )

            val url = if (gistId.isNotBlank()) "https://api.github.com/gists/$gistId" else "https://api.github.com/gists"
            val method = if (gistId.isNotBlank()) "PATCH" else "POST"

            val pushReq = Request.Builder()
                .url(url)
                .method(method, gson.toJson(payload).toRequestBody("application/json".toMediaType()))
                .addHeader("Authorization", "Bearer $pat")
                .build()

            val pushRes = client.newCall(pushReq).execute()
            if (!pushRes.isSuccessful) {
                return@withContext Result.failure(Exception("Lỗi lưu lên Gist: ${pushRes.code}"))
            }

            val pushBody = pushRes.body?.string() ?: ""
            val pushObj = gson.fromJson(pushBody, JsonObject::class.java)
            val newGistId = pushObj.get("id")?.asString ?: gistId
            keyManager.gistId = newGistId

            Result.success(newGistId)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
