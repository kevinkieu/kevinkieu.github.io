package com.kevinkieu.jarvisai

import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Quick Settings Tile cho Jarvis AI
 * - Vuông màn hình → bật Tile → mở app + auto-start wake word listening
 * - Tile trạng thái: ACTIVE khi listening, INACTIVE khi không
 * - Long press tile → mở app trực tiếp
 */
@RequiresApi(Build.VERSION_CODES.N)
class JarvisTileService : TileService() {

    companion object {
        private const val TAG = "JarvisTileService"
        // Action để MainActivity biết cần auto-start wake word
        const val ACTION_AUTO_START_WAKEWORD = "com.kevinkieu.jarvisai.ACTION_AUTO_START_WAKEWORD"
        // Extra để truyền state mong muốn
        const val EXTRA_START_LISTENING = "start_listening"
    }

    override fun onTileAdded() {
        super.onTileAdded()
        Log.d(TAG, "Tile added")
        updateTileState(isListening = false)
    }

    override fun onTileRemoved() {
        super.onTileRemoved()
        Log.d(TAG, "Tile removed")
    }

    override fun onStartListening() {
        super.onStartListening()
        // Được gọi khi Quick Settings panel mở
        // Có thể query trạng thái thực từ app (SharedPreferences, broadcast, etc.)
        updateTileFromAppState()
    }

    override fun onStopListening() {
        super.onStopListening()
    }

    override fun onClick() {
        super.onClick()
        Log.d(TAG, "Tile clicked")

        val tile = qsTile
        val newState = when (tile.state) {
            Tile.STATE_ACTIVE -> Tile.STATE_INACTIVE
            else -> Tile.STATE_ACTIVE
        }

        // Toggle trạng thái
        val startListening = (newState == Tile.STATE_ACTIVE)
        launchJarvisWithWakeWord(startListening)
        updateTileState(startListening)
    }

    /**
     * Mở MainActivity và gửi intent để auto-start wake word listening
     */
    private fun launchJarvisWithWakeWord(startListening: Boolean) {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_AUTO_START_WAKEWORD
            putExtra(EXTRA_START_LISTENING, startListening)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivityAndCollapse(intent)
    }

    /**
     * Cập nhật UI tile (icon, label, state)
     */
    private fun updateTileState(isListening: Boolean) {
        val tile = qsTile
        tile.state = if (isListening) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = if (isListening) getString(R.string.tile_label_listening) else getString(R.string.tile_label)
        tile.subtitle = if (isListening) getString(R.string.tile_subtitle_on) else getString(R.string.tile_subtitle_off)
        // Icon: có thể dùng icon khác cho trạng thái active
        tile.icon = Icon.createWithResource(this, if (isListening) R.drawable.ic_tile_jarvis_active else R.drawable.ic_tile_jarvis)
        tile.updateTile()
    }

    /**
     * Query trạng thái thực từ app (nếu app đang chạy)
     * Ở đây đơn giản: đọc SharedPreferences hoặc broadcast
     */
    private fun updateTileFromAppState() {
        // TODO: Có thể implement broadcast receiver để sync state thực từ MainActivity
        // Hiện tại mặc định inactive khi mở panel
        updateTileState(isListening = false)
    }
}