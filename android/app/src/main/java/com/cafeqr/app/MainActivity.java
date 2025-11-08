// android/app/src/main/java/com/cafeqr/app/MainActivity.java
package com.cafeqr.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cafeqr.app.DevicePrinterPlugin;   // add this import

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DevicePrinterPlugin.class);   // or: registerPlugin(com.cafeqr.app.DevicePrinterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
