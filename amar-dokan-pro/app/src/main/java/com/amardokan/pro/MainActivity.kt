package com.amardokan.pro

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

/**
 * Hosts the AMAR DOKAN PRO web app in a WebView.
 *
 * - The web files (index.html, styles.css, app.js ...) are served from the APK assets over a
 *   real https origin (https://appassets.androidplatform.net) using WebViewAssetLoader, so
 *   IndexedDB, localStorage and Firebase work exactly as in a normal browser.
 * - Google blocks OAuth inside embedded WebViews, so sign-in is done natively with Credential
 *   Manager. The Google ID token is handed to the web app, which signs in to Firebase with it.
 * - A small JavascriptInterface ("AndroidBridge") provides printing, sharing and file saving.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://$HOST/assets/index.html"
    }

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPress = 0L
    private var printWebView: WebView? = null

    private val credentialManager by lazy { CredentialManager.create(this) }

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            filePathCallback?.onReceiveValue(uris)
            filePathCallback = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor("#0F766E")

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0F766E"))
        }
        setContentView(webView)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            mediaPlaybackRequiresUserGesture = true
        }

        webView.addJavascriptInterface(Bridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                if (uri.host == HOST) return false
                openExternal(uri) // tel:, sms:, mailto:, https:// -> other apps
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (e: ActivityNotFoundException) {
                    filePathCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Let the web app close dialogs / go to the previous screen first.
                webView.evaluateJavascript(
                    "(function(){try{return !!(window.__androidBack && window.__androidBack());}catch(e){return false;}})()"
                ) { result ->
                    if (result != "true") {
                        val now = System.currentTimeMillis()
                        if (now - lastBackPress < 2000) {
                            finish()
                        } else {
                            lastBackPress = now
                            Toast.makeText(
                                this@MainActivity,
                                getString(R.string.press_back_again),
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        printWebView = null
        webView.destroy()
        super.onDestroy()
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast(getString(R.string.no_app_found))
        }
    }

    private fun toast(msg: String) {
        runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }
    }

    private fun safeName(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "file" }

    // ---------------------------------------------------------------------------------------
    // Google sign-in (native) -> web
    // ---------------------------------------------------------------------------------------
    private fun sendTokenToWeb(token: String?, error: String?) {
        val payload = JSONObject()
            .put("token", token ?: JSONObject.NULL)
            .put("error", error ?: JSONObject.NULL)
        webView.evaluateJavascript(
            "window.__onNativeGoogleToken && window.__onNativeGoogleToken($payload)",
            null
        )
    }

    private fun startGoogleSignIn() {
        val serverClientId = getString(R.string.default_web_client_id)
        if (serverClientId.startsWith("REPLACE")) {
            sendTokenToWeb(null, "Web client ID is not configured (see README, step Firebase).")
            return
        }
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

        lifecycleScope.launch {
            try {
                val result = credentialManager.getCredential(this@MainActivity, request)
                val credential = result.credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
                    sendTokenToWeb(idToken, null)
                } else {
                    sendTokenToWeb(null, "Unexpected credential type")
                }
            } catch (e: GetCredentialCancellationException) {
                sendTokenToWeb(null, "cancelled")
            } catch (e: GetCredentialException) {
                sendTokenToWeb(null, e.message ?: e.type)
            } catch (e: Exception) {
                sendTokenToWeb(null, e.message ?: "Sign-in failed")
            }
        }
    }

    // ---------------------------------------------------------------------------------------
    // JavaScript bridge (all methods run on a background thread)
    // ---------------------------------------------------------------------------------------
    inner class Bridge {

        @JavascriptInterface
        fun isNative(): Boolean = true

        @JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun googleSignIn() {
            runOnUiThread { startGoogleSignIn() }
        }

        @JavascriptInterface
        fun signOutNative() {
            runOnUiThread {
                lifecycleScope.launch {
                    try {
                        credentialManager.clearCredentialState(ClearCredentialStateRequest())
                    } catch (_: Exception) {
                    }
                }
            }
        }

        @JavascriptInterface
        fun shareText(text: String, title: String) {
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                    putExtra(Intent.EXTRA_SUBJECT, title)
                }
                startActivity(Intent.createChooser(send, title))
            }
        }

        @JavascriptInterface
        fun shareFile(name: String, mime: String, base64: String) {
            try {
                val dir = File(cacheDir, "shared").apply { mkdirs() }
                val file = File(dir, safeName(name))
                file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
                val uri = FileProvider.getUriForFile(
                    this@MainActivity, "$packageName.fileprovider", file
                )
                runOnUiThread {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = mime
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(Intent.createChooser(send, name))
                }
            } catch (e: Exception) {
                toast(e.message ?: "Share failed")
            }
        }

        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val fileName = safeName(name)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
                    ) ?: throw IllegalStateException("Cannot create file")
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    toast(getString(R.string.saved_to_downloads, fileName))
                } else {
                    // Android 8/9: no storage permission requested -> let the user pick an app
                    shareFile(name, mime, base64)
                }
            } catch (e: Exception) {
                toast(e.message ?: "Save failed")
            }
        }

        @JavascriptInterface
        fun printHtml(html: String, jobName: String) {
            runOnUiThread {
                val printer = WebView(this@MainActivity)
                printWebView = printer
                printer.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        val manager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                        val adapter = view.createPrintDocumentAdapter(jobName)
                        manager.print(jobName, adapter, PrintAttributes.Builder().build())
                    }
                }
                printer.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            }
        }
    }
}
