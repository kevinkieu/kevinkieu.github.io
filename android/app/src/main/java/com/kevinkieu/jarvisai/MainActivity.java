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
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
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

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Map;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "JarvisAI";
    private static final String LOCAL_ORIGIN = "https://appassets.androidplatform.net";
    private static final String TARGET_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final int PERMISSION_REQ_CODE = 1001;
    private static final int FILE_CHOOSER_REQ_CODE = 1002;

    private static MainActivity sInstance;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private long lastBackPressTime = 0;
    private WebViewAssetLoader assetLoader;
    private String pendingOpenTab = null;
    private boolean isPageLoaded = false;

    public static void notifyMedicationStatusChanged(String medId, String timeStr, String status) {
        if (sInstance != null && sInstance.webView != null) {
            sInstance.runOnUiThread(() -> {
                String js = String.format("if (window.onMedicationStatusChanged) window.onMedicationStatusChanged('%s', '%s', '%s');",
                        medId != null ? medId : "",
                        timeStr != null ? timeStr : "",
                        status != null ? status : "");
                sInstance.webView.evaluateJavascript(js, null);
            });
        }
    }

    /**
     * Native Storage & Max Medication Bridge: Cầu nối lưu trữ đồng bộ Flash Storage, ghi file
     * và quản lý lịch nhắc nhở uống thuốc chuẩn hệ thống Android (Max Care Pill Reminder).
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

        @JavascriptInterface
        public String getPlatformName() {
            return "Android-Native-App";
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void onAppReady() {
            runOnUiThread(() -> {
                isPageLoaded = true;
                if ("medication".equals(pendingOpenTab)) {
                    pendingOpenTab = null;
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.openMedicationTab) window.openMedicationTab();", null);
                    }
                }
            });
        }

        /**
         * Lưu file trực tiếp vào thư mục Download của hệ điều hành Android
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

        // =========================================================================
        // MAX MEDICATION REMINDER NATIVE BRIDGES (TÍNH NĂNG NHẮC UỐNG THUỐC MAX)
        // =========================================================================

        /**
         * Lên lịch báo thức nhắc uống thuốc cho một khung giờ nhất định
         */
        @JavascriptInterface
        public boolean scheduleMedicationAlarm(String medId, String medName, String dosage, String timeStr, String mealNote) {
            try {
                if (medId == null || timeStr == null || !timeStr.contains(":")) return false;
                String[] parts = timeStr.split(":");
                int hour = Integer.parseInt(parts[0].trim());
                int minute = Integer.parseInt(parts[1].trim());

                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, hour);
                cal.set(Calendar.MINUTE, minute);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);

                long now = System.currentTimeMillis();
                if (cal.getTimeInMillis() <= now) {
                    cal.add(Calendar.DAY_OF_YEAR, 1);
                }

                MedicationAlarmReceiver.scheduleAlarm(MainActivity.this, medId, medName, dosage, timeStr, mealNote, cal.getTimeInMillis());
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Error scheduling med alarm: " + e.getMessage());
                return false;
            }
        }

        /**
         * Hủy báo thức nhắc uống thuốc
         */
        @JavascriptInterface
        public boolean cancelMedicationAlarm(String medId, String timeStr) {
            try {
                if (medId == null || timeStr == null) return false;
                MedicationAlarmReceiver.cancelAlarm(MainActivity.this, medId, timeStr);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Error cancelling med alarm: " + e.getMessage());
                return false;
            }
        }

        /**
         * Đồng bộ và khôi phục toàn bộ lịch nhắc uống thuốc
         */
        @JavascriptInterface
        public void rescheduleAllMedications() {
            try {
                MedicationAlarmReceiver.rescheduleAllMedications(MainActivity.this);
            } catch (Exception e) {
                Log.e(TAG, "Error in rescheduleAllMedications: " + e.getMessage());
            }
        }

        /**
         * Ghi nhận đã uống thuốc trực tiếp vào Native SharedPreferences
         */
        @JavascriptInterface
        public void markMedicationTakenNative(String medId, String medName, String timeStr) {
            try {
                MedicationAlarmReceiver.recordMedicationTaken(MainActivity.this, medId, medName, timeStr);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "🐶 Max: Giỏi lắm! Đã ghi nhận bạn uống " + (medName != null ? medName : "thuốc"), Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                Log.e(TAG, "Error marking medication taken: " + e.getMessage());
            }
        }

        /**
         * Thử nghiệm thông báo nhắc nhở tức thì (phát sau 3 giây để người dùng kiểm tra chuông & rung)
         */
        @JavascriptInterface
        public void testMedicationReminder(String medName, String dosage, String mealNote) {
            try {
                long triggerTime = System.currentTimeMillis() + 3000L;
                MedicationAlarmReceiver.scheduleAlarm(
                        MainActivity.this,
                        "test_med_" + System.currentTimeMillis(),
                        (medName != null && !medName.isEmpty()) ? medName : "Panadol Extra",
                        (dosage != null && !dosage.isEmpty()) ? dosage : "1 viên",
                        "08:00",
                        (mealNote != null && !mealNote.isEmpty()) ? mealNote : "Sau bữa ăn 🍽️",
                        triggerTime
                );
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "🐶 Max: Chuông nhắc mẫu sẽ reo sau 3 giây...", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                Log.e(TAG, "Error testing medication reminder: " + e.getMessage());
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

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
                Log.w(TAG, "ServiceWorkerController init warning: " + e.getMessage());
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
            webView.loadUrl(TARGET_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        handleOpenTabIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOpenTabIntent(intent);
    }

    private void handleOpenTabIntent(Intent intent) {
        if (intent == null) return;
        String openTab = intent.getStringExtra("OPEN_TAB");
        if ("medication".equals(openTab)) {
            pendingOpenTab = "medication";
            if (webView != null && isPageLoaded) {
                pendingOpenTab = null;
                webView.post(() -> {
                    webView.evaluateJavascript("if (window.openMedicationTab) window.openMedicationTab();", null);
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

        // Cầu nối lưu trữ Native SharedPreferences & Max Medication Reminder
        webView.addJavascriptInterface(new NativeStorageBridge(this), "JarvisNativeBridge");

        // Tải tài nguyên từ local assets qua WebViewAssetLoader
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
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                isPageLoaded = true;
                if ("medication".equals(pendingOpenTab)) {
                    pendingOpenTab = null;
                    view.postDelayed(() -> {
                        view.evaluateJavascript("if (window.openMedicationTab) window.openMedicationTab();", null);
                    }, 250);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && request.isForMainFrame()) {
                    Log.e(TAG, "MainFrame WebResourceError: " + error.getErrorCode() + " - " + error.getDescription());
                }
            }
        });

        // Hỗ trợ Micro, Camera cho Live Call, chọn file từ máy và log Console
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
                Log.d("JarvisWeb", consoleMessage.message() + " -- Line "
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
        List<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.RECORD_AUDIO);
        permissions.add(Manifest.permission.CAMERA);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        List<String> needRequest = new ArrayList<>();
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest.add(perm);
            }
        }

        if (!needRequest.isEmpty()) {
            ActivityCompat.requestPermissions(this, needRequest.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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
        if (webView != null) {
            // Kiểm tra xem có Modal nào đang mở không để đóng modal trước thay vì thoát app
            String checkModalJs = "(function() { " +
                    "  if (window.closeActiveModal && window.closeActiveModal()) return 'CLOSED_MODAL'; " +
                    "  const overlays = ['max-form-modal', 'max-medication-modal', 'tts-studio-modal', 'knowledge-modal', 'settings-modal', 'live-call-modal', 'live-translate-modal', 'search-modal', 'daily-briefing-modal', 'share-target-modal']; " +
                    "  for (const id of overlays) { " +
                    "    const el = document.getElementById(id); " +
                    "    if (el && (el.style.display === 'flex' || el.style.display === 'block')) { " +
                    "      el.style.display = 'none'; " +
                    "      const ov = document.getElementById('modal-overlay'); if (ov) ov.style.display = 'none'; " +
                    "      return 'CLOSED_MODAL'; " +
                    "    } " +
                    "  } " +
                    "  return 'NONE'; " +
                    "})();";

            webView.evaluateJavascript(checkModalJs, result -> {
                if (result != null && result.contains("CLOSED_MODAL")) {
                    return;
                }
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                handleExitApp();
            });
            return;
        }

        handleExitApp();
    }

    private void handleExitApp() {
        if (System.currentTimeMillis() - lastBackPressTime < 2000) {
            super.onBackPressed();
        } else {
            lastBackPressTime = System.currentTimeMillis();
            Toast.makeText(this, "Nhấn lần nữa để thoát Jarvis AI", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        sInstance = null;
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
