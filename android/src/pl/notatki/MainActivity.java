package pl.notatki;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.PersistableBundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Natywna aplikacja Android wyświetlająca aplikację notatek (index.html, css/, js/)
 * z plików zapakowanych w APK. Notatki są zapisywane w pamięci WebView (localStorage)
 * na telefonie i nie wymagają internetu.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setTextZoom(100);

        webView.addJavascriptInterface(new Bridge(), "NotatkiAndroid");

        // WebChromeClient jest potrzebny, żeby działały okna confirm() (np. przy usuwaniu).
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                // Linki zewnętrzne otwieramy w przeglądarce.
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                return true;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    /** Funkcje dostępne z JavaScriptu jako window.NotatkiAndroid. */
    private class Bridge {
        /**
         * Kopiuje tekst do schowka. Hasło jest oznaczane jako poufne – Android 13+
         * nie pokazuje wtedy jego treści w podglądzie schowka.
         */
        @JavascriptInterface
        public void copy(final String text, final boolean sensitive) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    ClipData clip = ClipData.newPlainText(sensitive ? "Hasło" : "Login", text);
                    if (sensitive) {
                        PersistableBundle extras = new PersistableBundle();
                        // ClipDescription.EXTRA_IS_SENSITIVE (API 33); starsze wersje ignorują
                        extras.putBoolean("android.content.extra.IS_SENSITIVE", true);
                        clip.getDescription().setExtras(extras);
                    }
                    clipboard.setPrimaryClip(clip);
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        // Najpierw pytamy aplikację: z otwartej notatki wracamy do listy,
        // a dopiero na liście „wstecz” zamyka aplikację.
        webView.evaluateJavascript(
                "window.notatki ? window.notatki.handleBack() : false",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String handled) {
                        if (!"true".equals(handled)) finish();
                    }
                });
    }

    @Override
    protected void onPause() {
        webView.evaluateJavascript("window.notatki && window.notatki.flush()", null);
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
