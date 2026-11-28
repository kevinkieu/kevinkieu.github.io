package com.kevinkieu.jarvisai

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.annotation.NonNull
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.ArrayList
import java.util.Calendar
import java.util.List

class MainActivity : AppCompatActivity() {

    private var webView: WebView? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressTime: Long = 0
    private var assetLoader: WebViewAssetLoader? = null
    private var pendingOpenTab: String? = null
    private var isPageLoaded: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var mainPageLoadAttempts: Int = 0
    private var pendingAutoStartWakeWord: Boolean = false

    private val mainPageLoadTimeout = Runnable { retryMainPageLoad("page load timeout") }

    private inner class NativeStorageBridge(context: Context) {
        private val prefs: SharedPreferences = context.getSharedPreferences("JarvisPersistentStore", Context.MODE_PRIVATE)
        @JavascriptInterface
        fun setItem(key: String?, value: String?) {
            if (key != null && value != null) {
                prefs.edit().putString(key, value).commit()
            }
        }

        @JavascriptInterface
        fun getItem(key: String?): String? {
            if (key == null) return null
            return prefs.getString(key, null)
        }

        @JavascriptInterface
        fun removeItem(key: String?) {
            if (key != null) {
                prefs.edit().remove(key).commit()
            }
        }

        @JavascriptInterface
        fun getAllDataJson(): String {
            try {
                val obj = JSONObject()
                val keys = prefs.all
                for ((k, v) in keys) {
                    obj.put(k, v)
                }
                return obj.toString()
            } catch (e: Exception) {
                Log.e(TAG, "getAllDataJson error: ${e.message}")
                return "{}"
            }
        }

        @JavascriptInterface
        fun commit() {
            prefs.edit().commit()
        }

        @JavascriptInterface
        fun getPlatformName(): String {
            return "android-webview"
        }

        @JavascriptInterface
        fun isNativeApp(): Boolean {
            return true
        }

        @JavascriptInterface
        fun onAppReady() {
            Log.d(TAG, "onAppReady called")
        }

        @JavascriptInterface
        fun saveBase64File(base64Data: String?, filename: String?, mimeType: String?): Boolean {
            val safeName = safeFileName(filename)
            val safeMime = safeMimeType(mimeType)
            return try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues()
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                    values.put(MediaStore.Downloads.MIME_TYPE, safeMime)
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    val resolver: ContentResolver = contentResolver
                    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { os ->
                            os.write(bytes)
                        }
                        true
                    } else false
                } else {
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    val file = File(downloadsDir, safeName)
                    FileOutputStream(file).use { fos ->
                        fos.write(bytes)
                    }
                    MediaScannerConnection.scanFile(this@MainActivity, arrayOf(file.absolutePath), arrayOf(safeMime), null)
                    true
                }
            } catch (e: Exception) {
                Log.e(TAG, "saveBase64File error: ${e.message}")
                false
            }
        }

        @JavascriptInterface
        fun scheduleMedicationAlarm(medId: String?, medName: String?, dosage: String?, timeStr: String?, mealNote: String?): Boolean {
            return try {
                if (timeStr == null) return false
                val parts = timeStr.split(":")
                val hour = parts[0].trim().toInt()
                val minute = parts[1].trim().toInt()
                val cal = Calendar.getInstance()
                cal.set(Calendar.HOUR_OF_DAY, hour)
                cal.set(Calendar.MINUTE, minute)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                if (cal.timeInMillis <= System.currentTimeMillis()) {
                    cal.add(Calendar.DAY_OF_YEAR, 1)
                }
                MedicationAlarmReceiver.scheduleAlarm(
                    this@MainActivity, medId, medName, dosage, timeStr, mealNote, cal.timeInMillis
                )
                true
            } catch (e: Exception) {
                Log.e(TAG, "scheduleMedicationAlarm error: ${e.message}")
                false
            }
        }

        @JavascriptInterface
        fun cancelMedicationAlarm(medId: String?, timeStr: String?): Boolean {
            return try {
                MedicationAlarmReceiver.cancelAlarm(this@MainActivity, medId, timeStr)
                true
            } catch (e: Exception) {
                Log.e(TAG, "cancelMedicationAlarm error: ${e.message}")
                false
            }
        }

        @JavascriptInterface
        fun rescheduleAllMedications() {
            MedicationAlarmReceiver.rescheduleAllMedications(this@MainActivity)
        }

        @JavascriptInterface
        fun markMedicationTakenNative(medId: String?, medName: String?, timeStr: String?) {
            MedicationAlarmReceiver.recordMedicationTaken(this@MainActivity, medId, medName, timeStr)
            notifyMedicationStatusChanged(medId, timeStr, "taken")
        }

        @JavascriptInterface
        fun testMedicationReminder(medName: String?, dosage: String?, mealNote: String?) {
            val name = medName ?: "Thuốc thử nghiệm"
            val dose = dosage ?: "1 liều"
            val meal = mealNote ?: "Sau bữa ăn"
            val medId = "test_med_${System.currentTimeMillis()}"
            val timeStr = "00:00"
            MedicationAlarmReceiver.scheduleAlarm(
                this@MainActivity, medId, name, dose, timeStr, meal,
                System.currentTimeMillis() + 3000L
            )
            Toast.makeText(this@MainActivity, "🐶 Max: Sẽ thử chuông sau 3 giây!", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        private const val TAG = "JarvisAI"
        private const val LOCAL_ORIGIN = "https://appassets.androidplatform.net"
        private const val TARGET_URL = "https://appassets.androidplatform.net/assets/index.html"
        private const val PERMISSION_REQ_CODE = 1001
        private const val FILE_CHOOSER_REQ_CODE = 1002
        private const val MAX_MAIN_PAGE_LOAD_ATTEMPTS = 3
        private const val MAIN_PAGE_LOAD_TIMEOUT_MS = 15000L

        private var sInstance: MainActivity? = null

        @JvmStatic
        fun notifyMedicationStatusChanged(medId: String?, timeStr: String?, status: String?) {
            val inst = sInstance
            if (inst != null && inst.webView != null) {
                inst.runOnUiThread {
                    val js = "if (window.onMedicationStatusChanged) window.onMedicationStatusChanged('${medId ?: ""}', '${timeStr ?: ""}', '${status ?: ""}');"
                    inst.webView?.evaluateJavascript(js, null)
                }
            }
        }

        private fun safeFileName(filename: String?): String {
            var name = filename ?: ""
            name = name.replace('\\', '/')
            val slash = name.lastIndexOf('/')
            if (slash >= 0) name = name.substring(slash + 1)
            val dot = name.lastIndexOf('.')
            val ext = if (dot > 0) name.substring(dot) else ""
            // Basic sanitization
            name = name.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            return if (name.isBlank()) "download.bin" else name + if (ext.isNotEmpty() && !name.endsWith(ext)) ext else ""
        }

        private fun safeMimeType(mimeType: String?): String {
            val m = (mimeType ?: "").trim().lowercase()
            return if (m.isBlank()) "application/octet-stream" else m
        }

        private fun isLocalUrl(url: String?): Boolean {
            return url != null && url.startsWith(LOCAL_ORIGIN)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sInstance = this

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                val swController = android.webkit.ServiceWorkerController.getInstance()
                swController.setServiceWorkerClient(object : android.webkit.ServiceWorkerClient() {
                    override fun shouldInterceptRequest(request: WebResourceRequest?): WebResourceResponse? {
                        if (assetLoader != null && request != null) {
                            return assetLoader!!.shouldInterceptRequest(request.url)
                        }
                        return null
                    }
                })
            } catch (e: Exception) {
                Log.w(TAG, "ServiceWorkerController init warning: ${e.message}")
            }
        }

        supportRequestWindowFeature(Window.FEATURE_NO_TITLE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val window = window
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            window.statusBarColor = 0xFF0F172A.toInt()
            window.navigationBarColor = 0xFF0F172A.toInt()
        }

        setContentView(R.layout.activity_main)

        val root = findViewById<View>(R.id.app_root)
        if (root != null) applySystemBarInsets(root)

        webView = findViewById(R.id.webview)
        setupWebView()

        checkAndRequestPermissions()

        if (savedInstanceState == null) {
            loadMainPage()
        } else {
            webView?.restoreState(savedInstanceState)
            scheduleMainPageLoadTimeout()
        }

        handleOpenTabIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOpenTabIntent(intent)
    }

    /**
     * Android 15 (API 35) ép edge-to-edge với app targetSdk 35 nên WebView vẽ tràn dưới
     * status bar và navigation bar. Bù lại bằng padding theo window insets để header
     * của web app nằm dưới status bar, còn nội dung không bị thanh điều hướng che.
     */
    private fun applySystemBarInsets(root: View) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return

        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            if (view.paddingTop != bars.top || view.paddingBottom != bars.bottom ||
                view.paddingLeft != bars.left || view.paddingRight != bars.right
            ) {
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            }
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }

    private fun loadMainPage() {
        val wv = webView ?: return
        if (isFinishing || isDestroyed) return
        mainPageLoadAttempts++
        isPageLoaded = false
        wv.loadUrl(TARGET_URL)
        scheduleMainPageLoadTimeout()
    }

    private fun scheduleMainPageLoadTimeout() {
        mainHandler.removeCallbacks(mainPageLoadTimeout)
        mainHandler.postDelayed(mainPageLoadTimeout, MAIN_PAGE_LOAD_TIMEOUT_MS)
    }

    private fun retryMainPageLoad(reason: String) {
        val wv = webView ?: return
        if (isFinishing || isDestroyed || isPageLoaded) return
        if (mainPageLoadAttempts >= MAX_MAIN_PAGE_LOAD_ATTEMPTS) {
            Log.e(TAG, "Main page failed after $mainPageLoadAttempts attempts ($reason)")
            return
        }
        Log.w(TAG, "Retrying main page load after $reason (attempt ${mainPageLoadAttempts + 1}/$MAX_MAIN_PAGE_LOAD_ATTEMPTS)")
        mainHandler.postDelayed({ loadMainPage() }, 500L)
    }

    private fun handleOpenTabIntent(intent: Intent?) {
        if (intent == null) return

        if ("com.kevinkieu.jarvisai.ACTION_AUTO_START_WAKEWORD" == intent.action) {
            val startListening = intent.getBooleanExtra("start_listening", true)
            pendingAutoStartWakeWord = startListening
            if (webView != null && isPageLoaded) {
                triggerAutoStartWakeWord(startListening)
            }
            return
        }

        val openTab = intent.getStringExtra("OPEN_TAB")
        if ("medication" == openTab) {
            pendingOpenTab = "medication"
            if (webView != null && isPageLoaded) {
                pendingOpenTab = null
                webView?.post {
                    webView?.evaluateJavascript("if (window.openMedicationTab) window.openMedicationTab();", null)
                }
            }
        }
    }

    private fun triggerAutoStartWakeWord(startListening: Boolean) {
        val wv = webView ?: return
        val js = if (startListening)
            "if (window.startLiveVoiceCall) { try { window.startLiveVoiceCall(); } catch (e) { console.warn('Live call error', e); } }"
        else ""
        if (js.isNotEmpty()) wv.evaluateJavascript(js, null)
        pendingAutoStartWakeWord = false
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val wv = webView ?: return
        val settings = wv.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(wv, false)
        }

        wv.setBackgroundColor(0xFF0F172A.toInt())

        wv.addJavascriptInterface(NativeStorageBridge(this), "JarvisNativeBridge")

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val uri = request?.url
                if (assetLoader != null && uri != null && uri.toString().startsWith(LOCAL_ORIGIN)) {
                    val resp = assetLoader!!.shouldInterceptRequest(uri)
                    if (resp != null) return resp
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                if (request != null && request.url != null) {
                    return handleExternalUrl(request.url.toString())
                }
                return false
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return handleExternalUrl(url)
            }

            private fun handleExternalUrl(url: String?): Boolean {
                if (url == null) return false
                if (isLocalUrl(url)) return false
                if (!(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:") || url.startsWith("tel:"))) {
                    return true
                }
                return try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                    true
                } catch (e: Exception) {
                    true
                }
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                if (isLocalUrl(url)) {
                    isPageLoaded = false
                } else if (url != null) {
                    view?.stopLoading()
                    handleExternalUrl(url)
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (url == null || !url.startsWith(LOCAL_ORIGIN)) return
                isPageLoaded = true
                mainHandler.removeCallbacks(mainPageLoadTimeout)
                if ("medication" == pendingOpenTab) {
                    pendingOpenTab = null
                    view?.postDelayed({
                        view.evaluateJavascript("if (window.openMedicationTab) window.openMedicationTab();", null)
                    }, 250)
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && request.isForMainFrame) {
                    Log.e(TAG, "MainFrame WebResourceError: ${error?.errorCode} - ${error?.description}")
                    isPageLoaded = false
                    mainHandler.removeCallbacks(mainPageLoadTimeout)
                    mainHandler.postDelayed({ retryMainPageLoad("main frame load error") }, 500L)
                }
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                Log.d("JarvisWeb", "${consoleMessage?.message()} -- Line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    val origin = request?.origin
                    val originStr = origin?.toString() ?: ""
                    if (!LOCAL_ORIGIN.equals(originStr, ignoreCase = true)) {
                        request?.deny()
                        return@runOnUiThread
                    }
                    val granted = ArrayList<String>()
                    request?.resources?.forEach { res ->
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE == res || PermissionRequest.RESOURCE_VIDEO_CAPTURE == res) {
                            granted.add(res)
                        }
                    }
                    if (granted.isEmpty()) request?.deny() else request?.grant(granted.toTypedArray())
                }
            }

            override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                if (this@MainActivity.filePathCallback != null) {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                }
                this@MainActivity.filePathCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: return false
                return try {
                    startActivityForResult(intent, FILE_CHOOSER_REQ_CODE)
                    true
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    Toast.makeText(this@MainActivity, "Không thể mở trình chọn tệp: ${e.message}", Toast.LENGTH_SHORT).show()
                    false
                }
            }
        }
    }

    private fun checkAndRequestPermissions() {
        val permissions = ArrayList<String>()
        permissions.add(Manifest.permission.RECORD_AUDIO)
        permissions.add(Manifest.permission.CAMERA)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val needRequest = ArrayList<String>()
        for (perm in permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest.add(perm)
            }
        }
        if (needRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needRequest.toTypedArray(), PERMISSION_REQ_CODE)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, @NonNull permissions: Array<String>, @NonNull grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQ_CODE) {
            val cb = filePathCallback
            if (cb != null) {
                var results: Array<Uri>? = null
                if (resultCode == Activity.RESULT_OK && data != null) {
                    val dataString = data.dataString
                    if (dataString != null) {
                        results = arrayOf(Uri.parse(dataString))
                    } else if (data.clipData != null) {
                        val numSelected = data.clipData!!.itemCount
                        val uris = ArrayList<Uri>()
                        for (i in 0 until numSelected) {
                            uris.add(data.clipData!!.getItemAt(i).uri)
                        }
                        results = uris.toTypedArray()
                    }
                }
                cb.onReceiveValue(results)
                filePathCallback = null
            }
        }
    }

    override fun onBackPressed() {
        val wv = webView
        if (wv != null) {
            val checkModalJs = "(function() { " +
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
                    "})();"

            wv.evaluateJavascript(checkModalJs) { result ->
                if (result != null && result.contains("CLOSED_MODAL")) {
                    return@evaluateJavascript
                }
                if (wv.canGoBack()) {
                    wv.goBack()
                    return@evaluateJavascript
                }
                handleExitApp()
            }
            return
        }
        handleExitApp()
    }

    private fun handleExitApp() {
        if (System.currentTimeMillis() - lastBackPressTime < 2000) {
            super.onBackPressed()
        } else {
            lastBackPressTime = System.currentTimeMillis()
            Toast.makeText(this, "Nhấn lần nữa để thoát Jarvis AI", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        sInstance = null
        webView?.destroy()
        super.onDestroy()
    }
}
