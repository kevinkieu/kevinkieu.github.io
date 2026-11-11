package com.kevinkieu.jarvisai.data.local

import android.content.Context
import android.content.SharedPreferences

class KeyManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("JarvisNativeKeys", Context.MODE_PRIVATE)

    fun getApiKey(index: Int): String {
        val raw = prefs.getString("api_key_$index", "") ?: ""
        return decryptIfNeeded(raw)
    }

    fun setApiKey(index: Int, key: String) {
        prefs.edit().putString("api_key_$index", key.trim()).apply()
    }

    fun getActiveKeys(): List<String> {
        val keys = mutableListOf<String>()
        for (i in 1..10) {
            val k = getApiKey(i)
            if (k.isNotBlank()) keys.add(k)
        }
        return keys
    }

    private var keyPointer = 0
    fun getNextKey(): String {
        val keys = getActiveKeys()
        if (keys.isEmpty()) return ""
        val k = keys[keyPointer % keys.size]
        keyPointer++
        return k
    }

    // GitHub Gist Settings
    var gistPat: String
        get() = prefs.getString("gist_pat", "") ?: ""
        set(value) = prefs.edit().putString("gist_pat", value.trim()).apply()

    var gistId: String
        get() = prefs.getString("gist_id", "") ?: ""
        set(value) = prefs.edit().putString("gist_id", value.trim()).apply()

    private fun decryptIfNeeded(k: String): String {
        // Decode JVENC_ or ENC_ if exported from web
        if (k.startsWith("JVENC_") || k.startsWith("ENC_")) {
            return try {
                val clean = k.replace("JVENC_", "").replace("ENC_", "")
                val decoded = android.util.Base64.decode(clean, android.util.Base64.DEFAULT)
                String(decoded, Charsets.UTF_8)
            } catch (e: Exception) {
                k
            }
        }
        return k
    }
}
