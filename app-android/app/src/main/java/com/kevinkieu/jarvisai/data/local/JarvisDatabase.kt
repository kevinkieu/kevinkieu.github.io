package com.kevinkieu.jarvisai.data.local

import androidx.room.*
import com.kevinkieu.jarvisai.data.model.KnowledgeVectorEntity
import com.kevinkieu.jarvisai.data.model.MessageEntity
import com.kevinkieu.jarvisai.data.model.SessionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface JarvisDao {
    // Sessions
    @Query("SELECT * FROM sessions ORDER BY updatedAt DESC")
    fun getAllSessions(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE id = :id LIMIT 1")
    suspend fun getSessionById(id: String): SessionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateSession(session: SessionEntity)

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun deleteSession(id: String)

    // Messages
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY localId ASC")
    fun getMessagesForSession(sessionId: String): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity): Long

    @Query("DELETE FROM messages WHERE sessionId = :sessionId")
    suspend fun deleteMessagesForSession(sessionId: String)

    // Knowledge Vectors (Second Brain)
    @Query("SELECT * FROM vectors ORDER BY createdAt DESC")
    suspend fun getAllVectors(): List<KnowledgeVectorEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVector(vector: KnowledgeVectorEntity)

    @Query("DELETE FROM vectors WHERE id = :id")
    suspend fun deleteVector(id: String)
}

@Database(
    entities = [SessionEntity::class, MessageEntity::class, KnowledgeVectorEntity::class],
    version = 1,
    exportSchema = false
)
abstract class JarvisDatabase : RoomDatabase() {
    abstract fun jarvisDao(): JarvisDao
}
