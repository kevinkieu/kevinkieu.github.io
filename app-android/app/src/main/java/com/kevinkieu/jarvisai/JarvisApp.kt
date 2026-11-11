package com.kevinkieu.jarvisai

import android.app.Application
import androidx.room.Room
import com.kevinkieu.jarvisai.data.local.JarvisDatabase
import com.kevinkieu.jarvisai.data.local.KeyManager
import com.kevinkieu.jarvisai.data.remote.GeminiApiService
import com.kevinkieu.jarvisai.data.remote.GistSyncService

class JarvisApp : Application() {
    lateinit var database: JarvisDatabase
        private set
    lateinit var keyManager: KeyManager
        private set
    lateinit var geminiApi: GeminiApiService
        private set
    lateinit var syncService: GistSyncService
        private set

    override fun onCreate() {
        super.onCreate()

        database = Room.databaseBuilder(
            applicationContext,
            JarvisDatabase::class.java,
            "jarvis_native_db"
        ).fallbackToDestructiveMigration().build()

        keyManager = KeyManager(applicationContext)
        geminiApi = GeminiApiService(keyManager)
        syncService = GistSyncService(keyManager, database.jarvisDao())
    }
}
