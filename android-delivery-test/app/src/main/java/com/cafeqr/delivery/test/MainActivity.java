// android/app/src/main/java/com/cafeqr/app/MainActivity.java
package com.cafeqr.delivery.test;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cafeqr.delivery.test.DevicePrinterPlugin;   // add this import

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DevicePrinterPlugin.class);   // or: registerPlugin(com.cafeqr.app.DevicePrinterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
