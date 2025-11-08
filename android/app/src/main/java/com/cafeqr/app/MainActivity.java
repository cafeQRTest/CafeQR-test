// android/app/src/main/java/com/cafeqr/app/MainActivity.java
package com.cafeqr.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(DevicePrinterPlugin.class);  // register local plugin
  }
}
