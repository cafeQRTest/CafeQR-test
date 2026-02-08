package com.cafeqr.delivery.test;

import android.os.Bundle;
import android.net.Uri;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  private static final String SAFE_URL = "https://test-cafeqr.vercel.app/app/";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(NavigationGuardPlugin.class);
  }

  @Override
  public void onBackPressed() {
    // If user is at /app or /app/, send app to background instead of
    // exiting into the previous app (often POS).
    String current = getBridge().getWebView().getUrl();
    if (current != null && current.startsWith(SAFE_URL)) {
      Uri u = Uri.parse(current);
      String p = u.getPath() == null ? "" : u.getPath();
      if (p.equals("/app") || p.equals("/app/")) {
        moveTaskToBack(true);
        return;
      }
    }
    super.onBackPressed();
  }
}
