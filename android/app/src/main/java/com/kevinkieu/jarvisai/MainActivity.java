package com.kevinkieu.jarvisai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity {

    // Using secure domain handled by WebViewAssetLoader (100% Local Offline Assets)
    private static final String LOCAL_ORIGIN = "https://appassets.androidplatform.net";
    private static final String TARGET_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final int PERMISSION_REQ_CODE = 1001;
    private static final int FILE_CHOOSER_REQ_CODE = 1002;
    private static final int SPEECH_DIALOG_REQ_CODE = 1003;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private long lastBackPressTime = 0;
    private WebViewAssetLoader assetLoader;

    /**
     * Native Storage & File Bridge: Cầu nối lưu trữ đồng bộ Flash Storage và ghi file
     * trực tiếp vào thư mục Download của Android (hỗ trợ Android 7 -> Android 15 qua Scoped Storage).
     */
    public class NativeStorageBridge {
        private final SharedPreferences prefs;

        public NativeStorageBridge(Context context) {
            this.prefs = context.getSharedPreferences("JarvisPersistentStore", Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public void setItem(String key, String value) {
            if (key != null && value != null) {
                prefs.edit().putString(key, value).commit();
            }
        }

        @JavascriptInterface
        public String getItem(String key) {
            if (key == null) return null;
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void removeItem(String key) {
            if (key != null) {
                prefs.edit().remove(key).commit();
            }
        }

        @JavascriptInterface
        public String getAllDataJson() {
            try {
                JSONObject obj = new JSONObject();
                for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
                    if (entry.getValue() != null) {
                        obj.put(entry.getKey(), entry.getValue().toString());
                    }
                }
                return obj.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void commit() {
            // Android SharedPreferences auto-commits via commit()
        }

        /**
         * Lưu file trực tiếp vào thư mục Download của hệ điều hành Android
         * Hỗ trợ mọi định dạng: MP3, WAV (từ Gemini TTS Studio), JSON (sao lưu), v.v.
         */
        @JavascriptInterface
        public boolean saveBase64File(String base64Data, String filename, String mimeType) {
            if (base64Data == null || filename == null) return false;
            try {
                byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues contentValues = new ContentValues();
                    contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                    contentValues.put(MediaStore.MediaColumns.MIME_TYPE, mimeType != null ? mimeType : "application/octet-stream");
                    contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                    if (uri != null) {
                        try (OutputStream os = resolver.openOutputStream(uri)) {
                            if (os != null) {
                                os.write(fileBytes);
                                os.flush();
                                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Đã lưu vào thư mục Tải về (Download): " + filename, Toast.LENGTH_LONG).show());
                                return true;
                            }
                        }
                    }
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) downloadsDir.mkdirs();
                    File outFile = new File(downloadsDir, filename);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(fileBytes);
                        fos.flush();
                    }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{outFile.getAbsolutePath()}, null, null);
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Đã lưu vào thư mục Tải về (Download): " + filename, Toast.LENGTH_LONG).show());
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Lỗi khi lưu tệp: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
            return false;
        }

        @JavascriptInterface
        public String getPlatformName() {
            return "Android-Native-App";
        }

        @JavascriptInterface
        public boolean isVoiceLaunchMode() {
            return isVoiceLaunch(getIntent());
        }

        /**
         * Đặt báo thức trên ứng dụng Đồng hồ mặc định của Android
         */
        @JavascriptInterface
        public boolean setAlarm(int hour, int minutes, String message) {
            try {
                Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
                intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
                intent.putExtra(AlarmClock.EXTRA_MINUTES, minutes);
                if (message != null && !message.trim().isEmpty()) {
                    intent.putExtra(AlarmClock.EXTRA_MESSAGE, message.trim());
                }
                intent.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                final String timeStr = String.format(Locale.getDefault(), "%02d:%02d", hour, minutes);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Đã đặt báo thức lúc " + timeStr + (message != null && !message.isEmpty() ? " (" + message + ")" : ""), Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                // Thử lại không kèm EXTRA_SKIP_UI nếu ứng dụng đồng hồ của nhà sản xuất yêu cầu
                try {
                    Intent fallbackIntent = new Intent(AlarmClock.ACTION_SET_ALARM);
                    fallbackIntent.putExtra(AlarmClock.EXTRA_HOUR, hour);
                    fallbackIntent.putExtra(AlarmClock.EXTRA_MINUTES, minutes);
                    if (message != null && !message.trim().isEmpty()) {
                        fallbackIntent.putExtra(AlarmClock.EXTRA_MESSAGE, message.trim());
                    }
                    fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallbackIntent);
                    return true;
                } catch (Exception ex) {
                    ex.printStackTrace();
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Lỗi đặt báo thức: " + ex.getMessage(), Toast.LENGTH_SHORT).show());
                    return false;
                }
            }
        }

        /**
         * Hẹn giờ đếm ngược (Timer)
         */
        @JavascriptInterface
        public boolean setTimer(int seconds, String message) {
            try {
                Intent intent = new Intent(AlarmClock.ACTION_SET_TIMER);
                intent.putExtra(AlarmClock.EXTRA_LENGTH, seconds);
                if (message != null && !message.trim().isEmpty()) {
                    intent.putExtra(AlarmClock.EXTRA_MESSAGE, message.trim());
                }
                intent.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                int mins = seconds / 60;
                int secs = seconds % 60;
                final String durStr = mins > 0 ? (mins + " phút" + (secs > 0 ? " " + secs + " giây" : "")) : (secs + " giây");
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Đã hẹn giờ " + durStr, Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                try {
                    Intent fallbackIntent = new Intent(AlarmClock.ACTION_SET_TIMER);
                    fallbackIntent.putExtra(AlarmClock.EXTRA_LENGTH, seconds);
                    if (message != null && !message.trim().isEmpty()) {
                        fallbackIntent.putExtra(AlarmClock.EXTRA_MESSAGE, message.trim());
                    }
                    fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallbackIntent);
                    return true;
                } catch (Exception ex) {
                    ex.printStackTrace();
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Lỗi hẹn giờ: " + ex.getMessage(), Toast.LENGTH_SHORT).show());
                    return false;
                }
            }
        }

        /**
         * Bật hoặc tắt Đèn pin (Flashlight)
         */
        @JavascriptInterface
        public boolean setFlashlight(boolean enable) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    CameraManager cameraManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                    if (cameraManager != null) {
                        String[] cameraIdList = cameraManager.getCameraIdList();
                        for (String id : cameraIdList) {
                            CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                            Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                            Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);
                            if (Boolean.TRUE.equals(hasFlash) && (lensFacing == null || lensFacing == CameraCharacteristics.LENS_FACING_BACK)) {
                                cameraManager.setTorchMode(id, enable);
                                runOnUiThread(() -> Toast.makeText(MainActivity.this, enable ? "Đã bật đèn pin 🔦" : "Đã tắt đèn pin", Toast.LENGTH_SHORT).show());
                                return true;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Lỗi đèn pin: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
            return false;
        }

        /**
         * Mở ứng dụng đã cài đặt trên thiết bị Android theo tên hoặc từ khóa
         */
        @JavascriptInterface
        public boolean openApp(String appQuery) {
            if (appQuery == null || appQuery.trim().isEmpty()) return false;
            final String queryNorm = normalizeText(appQuery.trim());
            PackageManager pm = getPackageManager();

            // 1. Kiểm tra các ứng dụng hệ thống đặc biệt
            try {
                if (queryNorm.contains("cai dat") || queryNorm.contains("thiet lap") || queryNorm.contains("settings")) {
                    Intent settingsIntent = new Intent(android.provider.Settings.ACTION_SETTINGS);
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(settingsIntent);
                    return true;
                }
                if (queryNorm.contains("may tinh") || queryNorm.contains("calculator")) {
                    Intent calcIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_CALCULATOR);
                    calcIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (calcIntent.resolveActivity(pm) != null) {
                        startActivity(calcIntent);
                        return true;
                    }
                }
                if (queryNorm.contains("tin nhan") || queryNorm.contains("sms") || queryNorm.contains("nhan tin")) {
                    Intent smsIntent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_MESSAGING);
                    smsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (smsIntent.resolveActivity(pm) != null) {
                        startActivity(smsIntent);
                        return true;
                    }
                }
                if (queryNorm.contains("dong ho") || queryNorm.contains("bao thuc") || queryNorm.contains("clock")) {
                    Intent clockIntent = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
                    clockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (clockIntent.resolveActivity(pm) != null) {
                        startActivity(clockIntent);
                        return true;
                    }
                }
                if (queryNorm.contains("camera") || queryNorm.contains("may anh") || queryNorm.contains("chup anh")) {
                    Intent camIntent = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                    camIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (camIntent.resolveActivity(pm) != null) {
                        startActivity(camIntent);
                        return true;
                    }
                }
            } catch (Exception ignored) {}

            // 2. Danh mục ứng dụng phổ biến tại Việt Nam
            Map<String, String> commonPackages = new HashMap<>();
            commonPackages.put("zalo", "com.zing.zalo");
            commonPackages.put("facebook", "com.facebook.katana");
            commonPackages.put("fb", "com.facebook.katana");
            commonPackages.put("messenger", "com.facebook.orca");
            commonPackages.put("mess", "com.facebook.orca");
            commonPackages.put("youtube", "com.google.android.youtube");
            commonPackages.put("yt", "com.google.android.youtube");
            commonPackages.put("tiktok", "com.ss.android.ugc.trill");
            commonPackages.put("spotify", "com.spotify.music");
            commonPackages.put("chrome", "com.android.chrome");
            commonPackages.put("coccoc", "com.coccoc.trinhduyet");
            commonPackages.put("coc coc", "com.coccoc.trinhduyet");
            commonPackages.put("shopee", "com.shopee.vn");
            commonPackages.put("lazada", "com.lazada.android");
            commonPackages.put("momo", "com.mservice.momotransfer");
            commonPackages.put("telegram", "org.telegram.messenger");
            commonPackages.put("gmail", "com.google.android.gm");
            commonPackages.put("mail", "com.google.android.gm");
            commonPackages.put("drive", "com.google.android.apps.docs");
            commonPackages.put("google drive", "com.google.android.apps.docs");
            commonPackages.put("maps", "com.google.android.apps.maps");
            commonPackages.put("ban do", "com.google.android.apps.maps");
            commonPackages.put("google maps", "com.google.android.apps.maps");
            commonPackages.put("ch play", "com.android.vending");
            commonPackages.put("chplay", "com.android.vending");
            commonPackages.put("play store", "com.android.vending");

            for (Map.Entry<String, String> entry : commonPackages.entrySet()) {
                if (queryNorm.contains(entry.getKey())) {
                    Intent launchIntent = pm.getLaunchIntentForPackage(entry.getValue());
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(launchIntent);
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Đang mở " + appQuery, Toast.LENGTH_SHORT).show());
                        return true;
                    }
                }
            }

            // 3. Quét toàn bộ ứng dụng cài trên máy theo tên hiển thị (Title / Label)
            try {
                Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> pkgAppsList = pm.queryIntentActivities(mainIntent, 0);

                ResolveInfo bestMatch = null;
                for (ResolveInfo info : pkgAppsList) {
                    if (info.activityInfo == null) continue;
                    String label = info.loadLabel(pm).toString();
                    String labelNorm = normalizeText(label);

                    if (labelNorm.equals(queryNorm)) {
                        bestMatch = info;
                        break;
                    }
                    if (labelNorm.contains(queryNorm) || queryNorm.contains(labelNorm)) {
                        bestMatch = info;
                    }
                }

                if (bestMatch != null && bestMatch.activityInfo != null) {
                    Intent launchIntent = pm.getLaunchIntentForPackage(bestMatch.activityInfo.packageName);
                    if (launchIntent != null) {
                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(launchIntent);
                        final String appName = bestMatch.loadLabel(pm).toString();
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Đang mở " + appName, Toast.LENGTH_SHORT).show());
                        return true;
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }

            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Không tìm thấy ứng dụng: " + appQuery, Toast.LENGTH_SHORT).show());
            return false;
        }

        /**
         * Danh sách ứng dụng đã cài đặt dạng JSON để AI xử lý thông minh nếu cần
         */
        @JavascriptInterface
        public String getInstalledAppsJson() {
            try {
                PackageManager pm = getPackageManager();
                Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> pkgAppsList = pm.queryIntentActivities(mainIntent, 0);

                JSONArray arr = new JSONArray();
                for (ResolveInfo info : pkgAppsList) {
                    if (info.activityInfo == null) continue;
                    JSONObject item = new JSONObject();
                    item.put("name", info.loadLabel(pm).toString());
                    item.put("package", info.activityInfo.packageName);
                    arr.put(item);
                }
                return arr.toString();
            } catch (Exception e) {
                return "[]";
            }
        }

        /**
         * Thêm sự kiện vào Lịch của điện thoại
         */
        @JavascriptInterface
        public boolean addCalendarEvent(String title, long startTimeMillis, long endTimeMillis, String description) {
            try {
                Intent intent = new Intent(Intent.ACTION_INSERT);
                intent.setData(CalendarContract.Events.CONTENT_URI);
                if (title != null) intent.putExtra(CalendarContract.Events.TITLE, title);
                if (description != null) intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
                if (startTimeMillis > 0) intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startTimeMillis);
                if (endTimeMillis > 0) intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTimeMillis);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        /**
         * Mở giao diện quay số gọi điện
         */
        @JavascriptInterface
        public boolean makeCall(String phoneNumber) {
            try {
                if (phoneNumber == null || phoneNumber.trim().isEmpty()) return false;
                Intent intent = new Intent(Intent.ACTION_DIAL);
                intent.setData(Uri.parse("tel:" + Uri.encode(phoneNumber.trim())));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        /**
         * Chỉ đường / Mở bản đồ định vị
         */
        @JavascriptInterface
        public boolean openMapNavigation(String query) {
            try {
                if (query == null || query.trim().isEmpty()) return false;
                Uri uri = Uri.parse("google.navigation:q=" + Uri.encode(query.trim()));
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.setPackage("com.google.android.apps.maps");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(getPackageManager()) != null) {
                    startActivity(intent);
                    return true;
                } else {
                    Intent geoIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(query.trim())));
                    geoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(geoIntent);
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
                return false;
            }
        }

        /**
         * Bắt đầu nhận diện giọng nói tiếng Việt bằng Google SpeechRecognizer gốc của Android
         */
        @JavascriptInterface
        public void startListening() {
            runOnUiThread(() -> startNativeSpeechRecognition());
        }

        /**
         * Mở hộp thoại nhận diện giọng nói chính chủ của Google (Google Voice Dialog)
         * Đảm bảo hoạt động 100% trên mọi dòng máy Xiaomi, Samsung, Oppo, Vivo...
         */
        @JavascriptInterface
        public void openGoogleVoiceDialog() {
            runOnUiThread(() -> {
                try {
                    stopNativeSpeechRecognition();
                    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN");
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "vi-VN");
                    intent.putExtra("android.speech.extra.EXTRA_ADDITIONAL_LANGUAGES", new String[]{"vi-VN", "en-US"});
                    intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Jarvis: Nói câu lệnh tiếng Việt của bạn...");
                    startActivityForResult(intent, SPEECH_DIALOG_REQ_CODE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Không thể mở Google Voice: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    startNativeSpeechRecognition();
                }
            });
        }

        /**
         * Dừng nhận diện giọng nói
         */
        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> stopNativeSpeechRecognition());
        }

        /**
         * Kiểm tra thiết bị có sẵn Dịch vụ nhận diện giọng nói không
         */
        @JavascriptInterface
        public boolean isNativeSpeechAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }
    }

    private SpeechRecognizer speechRecognizer;
    private Intent speechRecognizerIntent;
    private boolean isListeningSpeech = false;
    private boolean hasUserSpoken = false;
    private boolean isVoiceActive = false;
    private int silenceRetryCount = 0;

    private SpeechRecognizer createBestSpeechRecognizer() {
        try {
            // Ưu tiên kết nối Google Speech Recognition Service
            android.content.ComponentName googleComponent = android.content.ComponentName.unflattenFromString("com.google.android.googlequicksearchbox/com.google.android.voicesearch.serviceapi.GoogleRecognitionService");
            if (googleComponent != null) {
                Intent intent = new Intent(android.speech.RecognitionService.SERVICE_INTERFACE);
                intent.setComponent(googleComponent);
                List<ResolveInfo> list = getPackageManager().queryIntentServices(intent, 0);
                if (list != null && !list.isEmpty()) {
                    android.util.Log.d("JarvisVoice", "Using Google Speech Recognition Service component");
                    return SpeechRecognizer.createSpeechRecognizer(this, googleComponent);
                }
            }
        } catch (Exception e) {
            android.util.Log.w("JarvisVoice", "Could not bind Google recognition service: " + e.getMessage());
        }
        return SpeechRecognizer.createSpeechRecognizer(this);
    }

    private String getSpeechErrorDescription(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "Lỗi ghi âm Micro (Mã 3)";
            case SpeechRecognizer.ERROR_CLIENT:
                return "Lỗi phần mềm Client (Mã 5)";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Chưa cấp quyền Micro cho ứng dụng (Mã 9)";
            case SpeechRecognizer.ERROR_NETWORK:
                return "Lỗi kết nối mạng (Mã 2)";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Mạng bị nghẽn (Mã 1)";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "Chưa nghe rõ câu lệnh (Mã 7)";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Dịch vụ giọng nói đang bận (Mã 8)";
            case SpeechRecognizer.ERROR_SERVER:
                return "Máy chủ giọng nói lỗi (Mã 4)";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "Hết thời gian chờ âm thanh (Mã 6)";
            default:
                return "Lỗi nhận diện số " + error;
        }
    }

    private void startNativeSpeechRecognition() {
        silenceRetryCount = 0;
        hasUserSpoken = false;
        isVoiceActive = true;
        startNativeSpeechRecognitionInternal();
    }

    private void startNativeSpeechRecognitionInternal() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            android.util.Log.w("JarvisVoice", "SpeechRecognizer not available");
            if (webView != null) {
                webView.evaluateJavascript("if (window.onNativeVoiceError) window.onNativeVoiceError('Dịch vụ giọng nói chưa được bật trên máy!');", null);
            }
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, PERMISSION_REQ_CODE);
            return;
        }

        try {
            if (speechRecognizer != null) {
                try { speechRecognizer.destroy(); } catch (Exception ignored) {}
                speechRecognizer = null;
            }

            speechRecognizer = createBestSpeechRecognizer();
            speechRecognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN");
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "vi-VN");
            speechRecognizerIntent.putExtra("android.speech.extra.EXTRA_ADDITIONAL_LANGUAGES", new String[]{"vi-VN", "en-US"});
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 4000L);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
            speechRecognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onReadyForSpeech(Bundle params) {
                    isListeningSpeech = true;
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.onNativeVoiceState) window.onNativeVoiceState('listening', 'Jarvis đang lắng nghe bạn nói...');", null);
                    }
                }

                @Override
                public void onBeginningOfSpeech() {
                    hasUserSpoken = true;
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.onNativeVoiceState) window.onNativeVoiceState('hearing', 'Đang nhận diện giọng nói...');", null);
                    }
                }

                @Override
                public void onRmsChanged(float rmsdB) {
                    if (rmsdB > 2.0f) {
                        hasUserSpoken = true;
                    }
                    if (webView != null && rmsdB > 0) {
                        webView.evaluateJavascript("if (window.onNativeVoiceRms) window.onNativeVoiceRms(" + rmsdB + ");", null);
                    }
                }

                @Override
                public void onBufferReceived(byte[] buffer) {}

                @Override
                public void onEndOfSpeech() {
                    isListeningSpeech = false;
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.onNativeVoiceState) window.onNativeVoiceState('processing', 'Đang xử lý câu lệnh...');", null);
                    }
                }

                @Override
                public void onError(int error) {
                    android.util.Log.w("JarvisVoice", "Speech error code: " + error);
                    if (!isVoiceActive) return;

                    // Nếu người dùng chưa kịp nói và bị timeout hoặc no_match, tự động nghe tiếp tối đa 3 lần (~6-8 giây)
                    if ((error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) && !hasUserSpoken && silenceRetryCount < 3) {
                        silenceRetryCount++;
                        android.util.Log.d("JarvisVoice", "User silence, auto re-listening (cycle " + silenceRetryCount + "/3)...");
                        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                            if (isVoiceActive) {
                                try {
                                    if (speechRecognizer != null) {
                                        speechRecognizer.cancel();
                                        speechRecognizer.startListening(speechRecognizerIntent);
                                    }
                                } catch (Exception e) {
                                    android.util.Log.e("JarvisVoice", "Re-listen error: " + e.getMessage());
                                }
                            }
                        }, 250);
                        return;
                    }

                    isListeningSpeech = false;
                    isVoiceActive = false;
                    String desc = getSpeechErrorDescription(error);
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.onNativeVoiceError) window.onNativeVoiceError('" + escapeJs(desc) + "', " + error + ");", null);
                    }
                }

                @Override
                public void onResults(Bundle results) {
                    isListeningSpeech = false;
                    isVoiceActive = false;
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        String text = matches.get(0);
                        if (webView != null) {
                            webView.evaluateJavascript("if (window.onNativeVoiceResult) window.onNativeVoiceResult('" + escapeJs(text) + "', true);", null);
                        }
                    }
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        String partial = matches.get(0);
                        if (webView != null) {
                            webView.evaluateJavascript("if (window.onNativeVoiceResult) window.onNativeVoiceResult('" + escapeJs(partial) + "', false);", null);
                        }
                    }
                }

                @Override
                public void onEvent(int eventType, Bundle params) {}
            });

            speechRecognizer.startListening(speechRecognizerIntent);
        } catch (Exception e) {
            android.util.Log.e("JarvisVoice", "Error in startNativeSpeechRecognitionInternal: " + e.getMessage());
        }
    }

    private void stopNativeSpeechRecognition() {
        isVoiceActive = false;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.stopListening();
            } catch (Exception ignored) {}
        }
        isListeningSpeech = false;
    }

    private static String escapeJs(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }

    private static String normalizeText(String input) {
        if (input == null) return "";
        String nfd = Normalizer.normalize(input.toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        Pattern pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        return pattern.matcher(nfd).replaceAll("").replace('đ', 'd').trim();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Khởi tạo AssetLoader phục vụ tài nguyên offline cục bộ với giao thức an toàn HTTPS
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        // Đảm bảo ServiceWorker (nếu có) cũng được chặn và phục vụ bằng AssetLoader
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                android.webkit.ServiceWorkerController swController = android.webkit.ServiceWorkerController.getInstance();
                swController.setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        if (assetLoader != null) {
                            return assetLoader.shouldInterceptRequest(request.getUrl());
                        }
                        return null;
                    }
                });
            } catch (Exception e) {
                android.util.Log.w("JarvisAI", "ServiceWorkerController init warning: " + e.getMessage());
            }
        }

        // Ẩn thanh Action Bar và cài đặt màu sắc Status Bar đồng bộ Dark Cyberpunk
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(0xFF0F172A); // #0f172a
            window.setNavigationBarColor(0xFF0F172A);
        }

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        setupWebView();

        checkAndRequestPermissions();

        if (savedInstanceState == null) {
            boolean voiceMode = isVoiceLaunch(getIntent());
            String startUrl = voiceMode ? (TARGET_URL + "?mode=voice_command") : TARGET_URL;
            webView.loadUrl(startUrl);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean isVoiceLaunch(Intent intent) {
        if (intent == null) return false;
        if (intent.getComponent() != null && "com.kevinkieu.jarvisai.VoiceAssistantActivity".equals(intent.getComponent().getClassName())) {
            return true;
        }
        String action = intent.getAction();
        if (Intent.ACTION_VOICE_COMMAND.equals(action) || Intent.ACTION_ASSIST.equals(action)) {
            return true;
        }
        if (intent.getBooleanExtra("VOICE_ASSISTANT_MODE", false)) {
            return true;
        }
        return false;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (isVoiceLaunch(intent)) {
            if (webView != null) {
                webView.post(() -> {
                    webView.evaluateJavascript("if (window.triggerVoiceAssistantMode) { window.triggerVoiceAssistantMode(); }", null);
                });
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false); // Cho phép phát audio mượt mà
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Kích hoạt lưu Cookie và hỗ trợ Third Party
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setBackgroundColor(0xFF0F172A);

        // Cầu nối lưu trữ Native SharedPreferences chống mất dữ liệu khi đóng/thoát app
        webView.addJavascriptInterface(new NativeStorageBridge(this), "JarvisNativeBridge");

        // Tải tài nguyên từ local assets qua WebViewAssetLoader (tốc độ mở 0ms, không phụ thuộc mạng)
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (assetLoader != null) {
                    WebResourceResponse resp = assetLoader.shouldInterceptRequest(request.getUrl());
                    if (resp != null) return resp;
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    return handleExternalUrl(request.getUrl().toString());
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(url);
            }

            private boolean handleExternalUrl(String url) {
                if (url == null) return false;
                if (url.startsWith(LOCAL_ORIGIN) || url.startsWith("https://kevinkieu.github.io") || url.startsWith("file:///android_asset/")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && request.isForMainFrame()) {
                    android.util.Log.e("JarvisAI", "MainFrame WebResourceError: " + error.getErrorCode() + " - " + error.getDescription());
                }
            }
        });

        // Hỗ trợ Micro, Camera cho Live Call, chọn file từ máy và log Console
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
                android.util.Log.d("JarvisWeb", consoleMessage.message() + " -- Line "
                        + consoleMessage.lineNumber() + " of "
                        + consoleMessage.sourceId());
                return true;
            }
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Tự động cấp quyền Micro và Camera cho website
                runOnUiThread(() -> {
                    String[] resources = request.getResources();
                    request.grant(resources);
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQ_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Không thể mở trình chọn tệp: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });
    }

    private void checkAndRequestPermissions() {
        String[] permissions = {
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA
        };

        boolean needRequest = false;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest = true;
                break;
            }
        }

        if (needRequest) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQ_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            for (int i = 0; i < permissions.length; i++) {
                if (Manifest.permission.RECORD_AUDIO.equals(permissions[i]) && grantResults.length > i && grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    if (isVoiceActive) {
                        runOnUiThread(() -> startNativeSpeechRecognition());
                    }
                }
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SPEECH_DIALOG_REQ_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (matches != null && !matches.isEmpty()) {
                    String spokenText = matches.get(0);
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.onNativeVoiceResult) window.onNativeVoiceResult('" + escapeJs(spokenText) + "', true);", null);
                    }
                }
            } else {
                if (webView != null) {
                    webView.evaluateJavascript("if (window.onNativeVoiceState) window.onNativeVoiceState('idle', 'Chạm để nói lệnh mới');", null);
                }
            }
            return;
        }
        if (requestCode == FILE_CHOOSER_REQ_CODE) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    String dataString = data.getDataString();
                    if (dataString != null) {
                        results = new Uri[]{Uri.parse(dataString)};
                    } else if (data.getClipData() != null) {
                        int numSelected = data.getClipData().getItemCount();
                        results = new Uri[numSelected];
                        for (int i = 0; i < numSelected; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }

        // Nhấn phím Back 2 lần trong vòng 2 giây để thoát ứng dụng
        if (System.currentTimeMillis() - lastBackPressTime < 2000) {
            super.onBackPressed();
        } else {
            lastBackPressTime = System.currentTimeMillis();
            Toast.makeText(this, "Nhấn lần nữa để thoát Jarvis AI", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
