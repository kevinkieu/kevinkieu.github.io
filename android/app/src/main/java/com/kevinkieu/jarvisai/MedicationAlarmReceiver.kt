package com.kevinkieu.jarvisai

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class MedicationAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        Log.d(TAG, "onReceive action: $action")

        if (Intent.ACTION_BOOT_COMPLETED == action || "android.intent.action.QUICKBOOT_POWERON" == action) {
            rescheduleAllMedications(context)
            return
        }

        if (ACTION_MEDICATION_ALARM == action) {
            handleMedicationAlarm(context, intent)
            return
        }

        if (ACTION_MEDICATION_TAKEN == action) {
            handleMedicationTaken(context, intent)
            return
        }

        if (ACTION_MEDICATION_SNOOZE == action) {
            handleMedicationSnooze(context, intent)
        }
    }

    private fun handleMedicationAlarm(context: Context, intent: Intent) {
        var medId = intent.getStringExtra("medId")
        var medName = intent.getStringExtra("medName")
        var dosage = intent.getStringExtra("dosage")
        var timeStr = intent.getStringExtra("timeStr")
        var mealNote = intent.getStringExtra("mealNote")

        if (medName.isNullOrEmpty()) medName = "Thuốc / TPCN"
        if (dosage.isNullOrEmpty()) dosage = "1 liều"
        if (timeStr.isNullOrEmpty()) timeStr = ""
        if (mealNote.isNullOrEmpty()) mealNote = "Sau bữa ăn"

        val notificationId = if (medId != null) (medId + timeStr).hashCode() else 8888

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (nm == null) return

        createNotificationChannel(context, nm)

        val openAppIntent = Intent(context, MainActivity::class.java)
        openAppIntent.putExtra("OPEN_TAB", "medication")
        openAppIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
        }
        val openPi = PendingIntent.getActivity(context, notificationId, openAppIntent, piFlags)

        val takenIntent = Intent(context, MedicationAlarmReceiver::class.java)
        takenIntent.action = ACTION_MEDICATION_TAKEN
        takenIntent.putExtra("medId", medId)
        takenIntent.putExtra("medName", medName)
        takenIntent.putExtra("dosage", dosage)
        takenIntent.putExtra("timeStr", timeStr)
        takenIntent.putExtra("notificationId", notificationId)
        val takenPi = PendingIntent.getBroadcast(context, notificationId + 1, takenIntent, piFlags)

        val snoozeIntent = Intent(context, MedicationAlarmReceiver::class.java)
        snoozeIntent.action = ACTION_MEDICATION_SNOOZE
        snoozeIntent.putExtra("medId", medId)
        snoozeIntent.putExtra("medName", medName)
        snoozeIntent.putExtra("dosage", dosage)
        snoozeIntent.putExtra("timeStr", timeStr)
        snoozeIntent.putExtra("mealNote", mealNote)
        snoozeIntent.putExtra("notificationId", notificationId)
        val snoozePi = PendingIntent.getBroadcast(context, notificationId + 2, snoozeIntent, piFlags)

        val detailText = "🐶 Gâu Gâu! Max nhắc bạn hãy uống $medName ($dosage) đúng giờ nhé! \nThời điểm: $mealNote"

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("🐶 Max: Đến giờ uống $medName rồi!")
            .setContentText("$dosage • $mealNote")
            .setStyle(NotificationCompat.BigTextStyle().bigText(detailText))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(openPi)
            .addAction(R.mipmap.ic_launcher, "✅ Đã uống", takenPi)
            .addAction(R.mipmap.ic_launcher, "⏰ Nhắc lại 10p", snoozePi)
            .setVibrate(longArrayOf(0, 500, 250, 500, 250, 500))
            .setLights(Color.parseColor("#38bdf8"), 1000, 500)

        nm.notify(notificationId, builder.build())

        if (medId != null && !medId.startsWith("test_med_") && !timeStr.isNullOrEmpty()) {
            scheduleNextDayAlarm(context, medId, medName, dosage, timeStr, mealNote)
        }
    }

    private fun handleMedicationTaken(context: Context, intent: Intent) {
        val medId = intent.getStringExtra("medId")
        val medName = intent.getStringExtra("medName")
        val timeStr = intent.getStringExtra("timeStr")
        val notificationId = intent.getIntExtra("notificationId", if (medId != null) (medId + timeStr).hashCode() else 8888)

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        nm?.cancel(notificationId)

        if (medId != null && medId.startsWith("test_med_")) {
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(context, "🐶 Max: Đã thử nghiệm chuông báo và xác nhận thành công!", Toast.LENGTH_SHORT).show()
            }
            return
        }

        recordMedicationTaken(context, medId, medName, timeStr)

        MainActivity.notifyMedicationStatusChanged(medId, timeStr, "taken")

        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, "🐶 Max: Giỏi lắm! Đã ghi nhận bạn uống ${medName ?: "thuốc"}", Toast.LENGTH_LONG).show()
        }
    }

    private fun handleMedicationSnooze(context: Context, intent: Intent) {
        val medId = intent.getStringExtra("medId")
        val medName = intent.getStringExtra("medName")
        val dosage = intent.getStringExtra("dosage")
        val timeStr = intent.getStringExtra("timeStr")
        val mealNote = intent.getStringExtra("mealNote")
        val notificationId = intent.getIntExtra("notificationId", if (medId != null) (medId + timeStr).hashCode() else 8888)

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        nm?.cancel(notificationId)

        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        if (am != null) {
            val alarmIntent = Intent(context, MedicationAlarmReceiver::class.java)
            alarmIntent.action = ACTION_MEDICATION_ALARM
            alarmIntent.putExtra("medId", medId)
            alarmIntent.putExtra("medName", medName)
            alarmIntent.putExtra("dosage", dosage)
            alarmIntent.putExtra("timeStr", timeStr)
            alarmIntent.putExtra("mealNote", mealNote)

            var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
            }
            val pi = PendingIntent.getBroadcast(context, notificationId, alarmIntent, piFlags)

            val snoozeTime = System.currentTimeMillis() + 10 * 60 * 1000L
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeTime, pi)
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, snoozeTime, pi)
                }
            } catch (se: SecurityException) {
                Log.w(TAG, "SecurityException snoozing alarm: ${se.message}, falling back to inexact")
                am.set(AlarmManager.RTC_WAKEUP, snoozeTime, pi)
            } catch (ex: Exception) {
                Log.e(TAG, "Exception snoozing alarm: ${ex.message}")
            }
        }

        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, "🐶 Max: Sẽ nhắc bạn uống ${medName ?: "thuốc"} sau 10 phút nữa nhé!", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        private const val TAG = "MaxMedication"
        const val CHANNEL_ID = "max_medication_reminder_channel"
        const val ACTION_MEDICATION_ALARM = "com.kevinkieu.jarvisai.ACTION_MEDICATION_ALARM"
        const val ACTION_MEDICATION_TAKEN = "com.kevinkieu.jarvisai.ACTION_MEDICATION_TAKEN"
        const val ACTION_MEDICATION_SNOOZE = "com.kevinkieu.jarvisai.ACTION_MEDICATION_SNOOZE"

        @JvmStatic
        fun recordMedicationTaken(context: Context, medId: String?, medName: String?, timeStr: String?) {
            try {
                val prefs = context.getSharedPreferences("JarvisPersistentStore", Context.MODE_PRIVATE)
                val historyJson = prefs.getString("jarvis_med_history", "[]")
                val arr = JSONArray(historyJson)

                val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                val todayStr = dateFormat.format(Date())

                val record = JSONObject()
                record.put("id", "take_" + System.currentTimeMillis())
                record.put("medId", medId)
                record.put("medName", medName)
                record.put("timeStr", timeStr)
                record.put("date", todayStr)
                record.put("timestamp", System.currentTimeMillis())

                arr.put(record)
                prefs.edit().putString("jarvis_med_history", arr.toString()).commit()
            } catch (e: Exception) {
                Log.e(TAG, "Error recording medication taken: ${e.message}")
            }
        }

        @JvmStatic
        fun scheduleNextDayAlarm(context: Context, medId: String, medName: String?, dosage: String?, timeStr: String, mealNote: String?) {
            try {
                val parts = timeStr.split(":")
                val hour = parts[0].trim().toInt()
                val minute = parts[1].trim().toInt()

                val cal = Calendar.getInstance()
                cal.add(Calendar.DAY_OF_YEAR, 1)
                cal.set(Calendar.HOUR_OF_DAY, hour)
                cal.set(Calendar.MINUTE, minute)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)

                scheduleAlarm(context, medId, medName, dosage, timeStr, mealNote, cal.timeInMillis)
            } catch (e: Exception) {
                Log.e(TAG, "Error scheduling next day alarm: ${e.message}")
            }
        }

        @JvmStatic
        fun scheduleAlarm(context: Context, medId: String?, medName: String?, dosage: String?, timeStr: String?, mealNote: String?, triggerAtMillis: Long) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

            val intent = Intent(context, MedicationAlarmReceiver::class.java)
            intent.action = ACTION_MEDICATION_ALARM
            intent.putExtra("medId", medId)
            intent.putExtra("medName", medName)
            intent.putExtra("dosage", dosage)
            intent.putExtra("timeStr", timeStr)
            intent.putExtra("mealNote", mealNote)

            val reqCode = (medId + timeStr).hashCode()
            var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
            }
            val pi = PendingIntent.getBroadcast(context, reqCode, intent, piFlags)

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
                }
                Log.d(TAG, "Scheduled alarm for $medName at $timeStr (epoch: $triggerAtMillis)")
            } catch (se: SecurityException) {
                Log.w(TAG, "SecurityException scheduling exact alarm: ${se.message}, falling back to inexact")
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
            } catch (ex: Exception) {
                Log.e(TAG, "Exception scheduling alarm: ${ex.message}")
            }
        }

        @JvmStatic
        fun cancelAlarm(context: Context, medId: String?, timeStr: String?) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

            val intent = Intent(context, MedicationAlarmReceiver::class.java)
            intent.action = ACTION_MEDICATION_ALARM

            val reqCode = (medId + timeStr).hashCode()
            var piFlags = PendingIntent.FLAG_NO_CREATE
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
            }
            val pi = PendingIntent.getBroadcast(context, reqCode, intent, piFlags)
            if (pi != null) {
                am.cancel(pi)
                pi.cancel()
                Log.d(TAG, "Cancelled alarm for medId: $medId at $timeStr")
            }
        }

        @JvmStatic
        fun rescheduleAllMedications(context: Context) {
            try {
                val prefs = context.getSharedPreferences("JarvisPersistentStore", Context.MODE_PRIVATE)
                val medsJson = prefs.getString("jarvis_medications", "[]")
                val arr = JSONArray(medsJson)

                val now = System.currentTimeMillis()

                for (i in 0 until arr.length()) {
                    val med = arr.getJSONObject(i)
                    val active = med.optBoolean("active", true)
                    if (!active) continue

                    val medId = med.optString("id")
                    val name = med.optString("name")
                    val dosage = med.optString("dosage", "1 liều")
                    val meal = med.optString("meal", "Sau bữa ăn")
                    val times = med.optJSONArray("times")

                    if (times == null || times.length() == 0) continue

                    for (t in 0 until times.length()) {
                        val timeStr = times.getString(t)
                        val parts = timeStr.split(":")
                        val hour = parts[0].trim().toInt()
                        val minute = parts[1].trim().toInt()

                        val cal = Calendar.getInstance()
                        cal.set(Calendar.HOUR_OF_DAY, hour)
                        cal.set(Calendar.MINUTE, minute)
                        cal.set(Calendar.SECOND, 0)
                        cal.set(Calendar.MILLISECOND, 0)

                        if (cal.timeInMillis <= now) {
                            cal.add(Calendar.DAY_OF_YEAR, 1)
                        }

                        scheduleAlarm(context, medId, name, dosage, timeStr, meal, cal.timeInMillis)
                    }
                }
                Log.d(TAG, "Successfully rescheduled all active medications (${arr.length()})")
            } catch (e: Exception) {
                Log.e(TAG, "Error in rescheduleAllMedications: ${e.message}")
            }
        }

        private fun createNotificationChannel(context: Context, nm: NotificationManager) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                var channel = nm.getNotificationChannel(CHANNEL_ID)
                if (channel == null) {
                    channel = NotificationChannel(
                        CHANNEL_ID,
                        "Max Care - Nhắc Uống Thuốc",
                        NotificationManager.IMPORTANCE_HIGH
                    )
                    channel.description = "Chuông và thông báo nhắc nhở uống thuốc của chú cún Max"
                    channel.enableLights(true)
                    channel.lightColor = Color.parseColor("#38bdf8")
                    channel.enableVibration(true)
                    channel.vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 500)
                    channel.lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC

                    val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                    val audioAttributes = AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                    channel.setSound(soundUri, audioAttributes)

                    nm.createNotificationChannel(channel)
                }
            }
        }
    }
}

