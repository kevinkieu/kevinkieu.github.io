package com.kevinkieu.jarvisai.data.remote

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.kevinkieu.jarvisai.data.local.KeyManager
import com.kevinkieu.jarvisai.data.model.MessageEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

class GeminiApiService(private val keyManager: KeyManager) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    fun streamChat(
        model: String,
        messages: List<MessageEntity>,
        thinkingLevel: String,
        systemInstruction: String = ""
    ): Flow<String> = flow {
        var apiKey = keyManager.getNextKey()
        if (apiKey.isBlank()) {
            emit("⚠️ Chưa có Google API Key! Vui lòng vào Cài đặt để thêm ít nhất 1 Key.")
            return@flow
        }

        val url = "https://generativelanguage.googleapis.com/v1beta/models/$model:streamGenerateContent?alt=sse&key=$apiKey"

        // Build Payload matching v1beta API
        val contentsList = messages.map { msg ->
            mapOf(
                "role" to if (msg.role == "user") "user" else "model",
                "parts" to listOf(mapOf("text" to msg.text))
            )
        }

        val configMap = mutableMapOf<String, Any>(
            "maxOutputTokens" to 8192
        )
        if (thinkingLevel != "none" && thinkingLevel.isNotBlank()) {
            configMap["thinkingConfig"] = mapOf("thinkingLevel" to thinkingLevel)
        }

        val payload = mutableMapOf<String, Any>(
            "contents" to contentsList,
            "generationConfig" to configMap
        )

        if (systemInstruction.isNotBlank()) {
            payload["systemInstruction"] = mapOf(
                "parts" to listOf(mapOf("text" to systemInstruction))
            )
        }

        val body = gson.toJson(payload).toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url(url).post(body).build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            val errBody = response.body?.string() ?: "Lỗi kết nối HTTP ${response.code}"
            emit("*(⚠️ Lỗi Google API [${response.code}]: $errBody)*")
            return@flow
        }

        val reader = BufferedReader(InputStreamReader(response.body!!.byteStream()))
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            val curLine = line?.trim() ?: continue
            if (curLine.startsWith("data:")) {
                val dataJson = curLine.substring(5).trim()
                if (dataJson.isNotEmpty()) {
                    try {
                        val obj = gson.fromJson(dataJson, JsonObject::class.java)
                        val candidates = obj.getAsJsonArray("candidates")
                        if (candidates != null && candidates.size() > 0) {
                            val candidate = candidates[0].asJsonObject
                            val parts = candidate.getAsJsonObject("content")?.getAsJsonArray("parts")
                            if (parts != null) {
                                for (p in parts) {
                                    val partObj = p.asJsonObject
                                    if (partObj.has("text")) {
                                        emit(partObj.get("text").asString)
                                    }
                                }
                            }
                        }
                    } catch (_: Exception) {}
                }
            }
        }
    }.flowOn(Dispatchers.IO)
}
