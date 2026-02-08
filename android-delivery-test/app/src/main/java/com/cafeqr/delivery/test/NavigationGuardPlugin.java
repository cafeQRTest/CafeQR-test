package com.cafeqr.delivery.test;

import android.net.Uri;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NavigationGuard")
public class NavigationGuardPlugin extends Plugin {

  private static final String ALLOWED_HOST = "test-cafeqr.vercel.app";
  private static final String SAFE_URL = "https://test-cafeqr.vercel.app/app/";

  @Override
  public Boolean shouldOverrideLoad(Uri url) {
    if (url == null) return null;

    String scheme = url.getScheme() == null ? "" : url.getScheme();
    if (!scheme.equals("https") && !scheme.equals("http")) {
      // Let Capacitor handle non-http(s) schemes like tel:, intent:, etc.
      return null;
    }

    String host = url.getHost() == null ? "" : url.getHost();
    String path = url.getPath() == null ? "/" : url.getPath();

    boolean okHost = host.equalsIgnoreCase(ALLOWED_HOST);
    boolean okPath = path.equals("/app") || path.startsWith("/app/");

    if (okHost && okPath) return null; // allow

    // Block and force back to SAFE_URL
    final WebView wv = getBridge().getWebView();
    wv.post(() -> {
      String current = wv.getUrl();
      if (current == null || !current.startsWith(SAFE_URL)) {
        wv.loadUrl(SAFE_URL);
        wv.clearHistory(); // prevents back into blocked pages
      }
    });

    return true; // block this navigation
  }
}
