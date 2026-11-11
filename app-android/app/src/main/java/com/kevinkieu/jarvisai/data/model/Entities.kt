package com.kevinkieu.jarvisai.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey val id: String,
    val name: String,
    val model: String = "gemini-3.6-flash",
    val thinkingLevel: String = "minimal",
    val systemPrompt: String = "",
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val sessionId: String,
    val role: String, // "user" or "model"
    val text: String,
    val timestamp: String,
    val isPinned: Boolean = false,
    val finishReason: String? = null
)

@Entity(tableName = "vectors")
data class KnowledgeVectorEntity(
    @PrimaryKey val id: String,
    val content: String,
    val type: String = "manual",
    val vectorJson: String, // Stored as JSON array of floats for Cosine Similarity
    val createdAt: Long = System.currentTimeMillis()
)
