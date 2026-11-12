package com.kevinkieu.jarvisai;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public class MedicationAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "MaxMedication";
    public static final String CHANNEL_ID = "max_medication_reminder_channel";
    public static final String ACTION_MEDICATION_ALARM = "com.kevinkieu.jarvisai.ACTION_MEDICATION_ALARM";
    public static final String ACTION_MEDICATION_TAKEN = "com.kevinkieu.jarvisai.ACTION_MEDICATION_TAKEN";
    public static final String ACTION_MEDICATION_SNOOZE = "com.kevinkieu.jarvisai.ACTION_MEDICATION_SNOOZE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.d(TAG, "onReceive action: " + action);

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            // Khởi động lại toàn bộ chuông nhắc uống thuốc sau khi điện thoại khởi động lại
            rescheduleAllMedications(context);
            return;
        }

        if (ACTION_MEDICATION_ALARM.equals(action)) {
            handleMedicationAlarm(context, intent);
            return;
        }

        if (ACTION_MEDICATION_TAKEN.equals(action)) {
            handleMedicationTaken(context, intent);
            return;
        }

        if (ACTION_MEDICATION_SNOOZE.equals(action)) {
            handleMedicationSnooze(context, intent);
        }
    }

    private void handleMedicationAlarm(Context context, Intent intent) {
        String medId = intent.getStringExtra("medId");
        String medName = intent.getStringExtra("medName");
        String dosage = intent.getStringExtra("dosage");
        String timeStr = intent.getStringExtra("timeStr");
        String mealNote = intent.getStringExtra("mealNote");

        if (medName == null || medName.isEmpty()) medName = "Thuốc / TPCN";
        if (dosage == null || dosage.isEmpty()) dosage = "1 liều";
        if (timeStr == null || timeStr.isEmpty()) timeStr = "";
        if (mealNote == null || mealNote.isEmpty()) mealNote = "Sau bữa ăn";

        int notificationId = (medId != null ? (medId + timeStr).hashCode() : 8888);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        createNotificationChannel(context, nm);

        // Intent khi bấm vào thân thông báo -> Mở tab Quản lý thuốc trong app
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.putExtra("OPEN_TAB", "medication");
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent openPi = PendingIntent.getActivity(context, notificationId, openAppIntent, piFlags);

        // Action 1: Đã uống
        Intent takenIntent = new Intent(context, MedicationAlarmReceiver.class);
        takenIntent.setAction(ACTION_MEDICATION_TAKEN);
        takenIntent.putExtra("medId", medId);
        takenIntent.putExtra("medName", medName);
        takenIntent.putExtra("dosage", dosage);
        takenIntent.putExtra("timeStr", timeStr);
        takenIntent.putExtra("notificationId", notificationId);
        PendingIntent takenPi = PendingIntent.getBroadcast(context, notificationId + 1, takenIntent, piFlags);

        // Action 2: Nhắc lại sau 10 phút (Snooze)
        Intent snoozeIntent = new Intent(context, MedicationAlarmReceiver.class);
        snoozeIntent.setAction(ACTION_MEDICATION_SNOOZE);
        snoozeIntent.putExtra("medId", medId);
        snoozeIntent.putExtra("medName", medName);
        snoozeIntent.putExtra("dosage", dosage);
        snoozeIntent.putExtra("timeStr", timeStr);
        snoozeIntent.putExtra("mealNote", mealNote);
        snoozeIntent.putExtra("notificationId", notificationId);
        PendingIntent snoozePi = PendingIntent.getBroadcast(context, notificationId + 2, snoozeIntent, piFlags);

        String detailText = "🐶 Gâu Gâu! Max nhắc bạn hãy uống " + medName + " (" + dosage + ") đúng giờ nhé! \nThời điểm: " + mealNote;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("🐶 Max: Đến giờ uống " + medName + " rồi!")
                .setContentText(dosage + " • " + mealNote)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(detailText))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setOngoing(false)
                .setContentIntent(openPi)
                .addAction(R.mipmap.ic_launcher, "✅ Đã uống", takenPi)
                .addAction(R.mipmap.ic_launcher, "⏰ Nhắc lại 10p", snoozePi)
                .setVibrate(new long[]{0, 500, 250, 500, 250, 500})
                .setLights(Color.parseColor("#38bdf8"), 1000, 500);

        nm.notify(notificationId, builder.build());

        // Tự động lên lịch lại cho ngày hôm sau vào cùng khung giờ này
        if (medId != null && !timeStr.isEmpty()) {
            scheduleNextDayAlarm(context, medId, medName, dosage, timeStr, mealNote);
        }
    }

    private void handleMedicationTaken(Context context, Intent intent) {
        String medId = intent.getStringExtra("medId");
        String medName = intent.getStringExtra("medName");
        String timeStr = intent.getStringExtra("timeStr");
        int notificationId = intent.getIntExtra("notificationId", (medId != null ? (medId + timeStr).hashCode() : 8888));

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notificationId);
        }

        // Ghi vào lịch sử SharedPreferences
        recordMedicationTaken(context, medId, medName, timeStr);

        // Thông báo qua UI WebView nếu đang chạy
        MainActivity.notifyMedicationStatusChanged(medId, timeStr, "taken");

        // Toast xác nhận
        new Handler(Looper.getMainLooper()).post(() -> {
            Toast.makeText(context, "🐶 Max: Giỏi lắm! Đã ghi nhận bạn uống " + (medName != null ? medName : "thuốc"), Toast.LENGTH_LONG).show();
        });
    }

    private void handleMedicationSnooze(Context context, Intent intent) {
        String medId = intent.getStringExtra("medId");
        String medName = intent.getStringExtra("medName");
        String dosage = intent.getStringExtra("dosage");
        String timeStr = intent.getStringExtra("timeStr");
        String mealNote = intent.getStringExtra("mealNote");
        int notificationId = intent.getIntExtra("notificationId", (medId != null ? (medId + timeStr).hashCode() : 8888));

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notificationId);
        }

        // Đặt hẹn giờ lại sau 10 phút
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            Intent alarmIntent = new Intent(context, MedicationAlarmReceiver.class);
            alarmIntent.setAction(ACTION_MEDICATION_ALARM);
            alarmIntent.putExtra("medId", medId);
            alarmIntent.putExtra("medName", medName);
            alarmIntent.putExtra("dosage", dosage);
            alarmIntent.putExtra("timeStr", timeStr);
            alarmIntent.putExtra("mealNote", mealNote);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, notificationId, alarmIntent, piFlags);

            long snoozeTime = System.currentTimeMillis() + 10 * 60 * 1000L;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeTime, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, snoozeTime, pi);
            }
        }

        new Handler(Looper.getMainLooper()).post(() -> {
            Toast.makeText(context, "🐶 Max: Sẽ nhắc bạn uống " + (medName != null ? medName : "thuốc") + " sau 10 phút nữa nhé!", Toast.LENGTH_SHORT).show();
        });
    }

    public static void recordMedicationTaken(Context context, String medId, String medName, String timeStr) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("JarvisPersistentStore", Context.MODE_PRIVATE);
            String historyJson = prefs.getString("jarvis_med_history", "[]");
            JSONArray arr = new JSONArray(historyJson);

            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
            String todayStr = dateFormat.format(new Date());

            JSONObject record = new JSONObject();
            record.put("id", "take_" + System.currentTimeMillis());
            record.put("medId", medId);
            record.put("medName", medName);
            record.put("timeStr", timeStr);
            record.put("date", todayStr);
            record.put("timestamp", System.currentTimeMillis());

            arr.put(record);
            prefs.edit().putString("jarvis_med_history", arr.toString()).commit();
        } catch (Exception e) {
            Log.e(TAG, "Error recording medication taken: " + e.getMessage());
        }
    }

    public static void scheduleNextDayAlarm(Context context, String medId, String medName, String dosage, String timeStr, String mealNote) {
        try {
            String[] parts = timeStr.split(":");
            int hour = Integer.parseInt(parts[0].trim());
            int minute = Integer.parseInt(parts[1].trim());

            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, 1);
            cal.set(Calendar.HOUR_OF_DAY, hour);
            cal.set(Calendar.MINUTE, minute);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);

            scheduleAlarm(context, medId, medName, dosage, timeStr, mealNote, cal.getTimeInMillis());
        } catch (Exception e) {
            Log.e(TAG, "Error scheduling next day alarm: " + e.getMessage());
        }
    }

    public static void scheduleAlarm(Context context, String medId, String medName, String dosage, String timeStr, String mealNote, long triggerAtMillis) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, MedicationAlarmReceiver.class);
        intent.setAction(ACTION_MEDICATION_ALARM);
        intent.putExtra("medId", medId);
        intent.putExtra("medName", medName);
        intent.putExtra("dosage", dosage);
        intent.putExtra("timeStr", timeStr);
        intent.putExtra("mealNote", mealNote);

        int reqCode = (medId + timeStr).hashCode();
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(context, reqCode, intent, piFlags);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            }
            Log.d(TAG, "Scheduled alarm for " + medName + " at " + timeStr + " (epoch: " + triggerAtMillis + ")");
        } catch (SecurityException se) {
            Log.w(TAG, "SecurityException scheduling exact alarm: " + se.getMessage() + ", falling back to inexact");
            am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        } catch (Exception ex) {
            Log.e(TAG, "Exception scheduling alarm: " + ex.getMessage());
        }
    }

    public static void cancelAlarm(Context context, String medId, String timeStr) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, MedicationAlarmReceiver.class);
        intent.setAction(ACTION_MEDICATION_ALARM);

        int reqCode = (medId + timeStr).hashCode();
        int piFlags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(context, reqCode, intent, piFlags);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
            Log.d(TAG, "Cancelled alarm for medId: " + medId + " at " + timeStr);
        }
    }

    public static void rescheduleAllMedications(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("JarvisPersistentStore", Context.MODE_PRIVATE);
            String medsJson = prefs.getString("jarvis_medications", "[]");
            JSONArray arr = new JSONArray(medsJson);

            long now = System.currentTimeMillis();

            for (int i = 0; i < arr.length(); i++) {
                JSONObject med = arr.getJSONObject(i);
                boolean active = med.optBoolean("active", true);
                if (!active) continue;

                String medId = med.optString("id");
                String name = med.optString("name");
                String dosage = med.optString("dosage", "1 liều");
                String meal = med.optString("meal", "Sau bữa ăn");
                JSONArray times = med.optJSONArray("times");

                if (times == null || times.length() == 0) continue;

                for (int t = 0; t < times.length(); t++) {
                    String timeStr = times.getString(t);
                    String[] parts = timeStr.split(":");
                    int hour = Integer.parseInt(parts[0].trim());
                    int minute = Integer.parseInt(parts[1].trim());

                    Calendar cal = Calendar.getInstance();
                    cal.set(Calendar.HOUR_OF_DAY, hour);
                    cal.set(Calendar.MINUTE, minute);
                    cal.set(Calendar.SECOND, 0);
                    cal.set(Calendar.MILLISECOND, 0);

                    // Nếu giờ của ngày hôm nay đã qua thì đặt cho ngày mai
                    if (cal.getTimeInMillis() <= now) {
                        cal.add(Calendar.DAY_OF_YEAR, 1);
                    }

                    scheduleAlarm(context, medId, name, dosage, timeStr, meal, cal.getTimeInMillis());
                }
            }
            Log.d(TAG, "Successfully rescheduled all active medications (" + arr.length() + ")");
        } catch (Exception e) {
            Log.e(TAG, "Error in rescheduleAllMedications: " + e.getMessage());
        }
    }

    private static void createNotificationChannel(Context context, NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Max Care - Nhắc Uống Thuốc",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Chuông và thông báo nhắc nhở uống thuốc của chú cún Max");
                channel.enableLights(true);
                channel.setLightColor(Color.parseColor("#38bdf8"));
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build();
                channel.setSound(soundUri, audioAttributes);

                nm.createNotificationChannel(channel);
            }
        }
    }
}
