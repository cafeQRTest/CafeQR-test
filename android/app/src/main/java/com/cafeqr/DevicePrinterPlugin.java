// android/app/src/main/java/com/cafeqr/app/DevicePrinterPlugin.java
package com.cafeqr.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;              // ← correct import
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.hardware.usb.*;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "DevicePrinter")
public class DevicePrinterPlugin extends Plugin {

  @PluginMethod()                               // ← stays the same
  public void printRaw(PluginCall call) {
    String base64 = call.getString("base64");
    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
    try {
      if (tryUsb(getContext(), data)) { call.resolve(new JSObject().put("via", "usb")); return; }
      if (tryBluetooth(getContext(), data)) { call.resolve(new JSObject().put("via", "bt")); return; }
      call.reject("No USB/Bluetooth path");
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  private boolean tryUsb(Context ctx, byte[] data) throws Exception {
    UsbManager mgr = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
    if (mgr == null) return false;
    for (UsbDevice dev : mgr.getDeviceList().values()) {
      if (!mgr.hasPermission(dev)) {
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, new Intent("USB_PERMISSION"), PendingIntent.FLAG_IMMUTABLE);
        mgr.requestPermission(dev, pi);
        continue;
      }
      UsbInterface iface = null;
      for (int i=0;i<dev.getInterfaceCount();i++) {
        UsbInterface cand = dev.getInterface(i);
        for (int a=0;a<cand.getEndpointCount();a++) {
          if (cand.getEndpoint(a).getDirection() == UsbConstants.USB_DIR_OUT) { iface = cand; break; }
        }
        if (iface != null) break;
      }
      if (iface == null) continue;
      UsbDeviceConnection conn = mgr.openDevice(dev);
      if (conn == null) continue;
      if (!conn.claimInterface(iface, true)) { conn.close(); continue; }
      UsbEndpoint out = null;
      for (int a=0;a<iface.getEndpointCount();a++) {
        UsbEndpoint ep = iface.getEndpoint(a);
        if (ep.getDirection() == UsbConstants.USB_DIR_OUT) { out = ep; break; }
      }
      if (out == null) { conn.releaseInterface(iface); conn.close(); continue; }
      int sent = conn.bulkTransfer(out, data, data.length, 5000);
      conn.releaseInterface(iface);
      conn.close();
      if (sent > 0) return true;
    }
    return false;
  }

  private boolean tryBluetooth(Context ctx, byte[] data) throws Exception {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (ctx.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        throw new SecurityException("BLUETOOTH_CONNECT not granted");
      }
    }
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null || !adapter.isEnabled()) return false;
    for (BluetoothDevice d : adapter.getBondedDevices()) {
      // Many ESC/POS BT printers accept SPP RFCOMM with this UUID
      BluetoothSocket sock = d.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"));
      try {
        sock.connect();
        OutputStream os = sock.getOutputStream();
        os.write(data);
        os.flush();
        sock.close();
        return true;
      } catch (Exception ex) {
        try { sock.close(); } catch (Exception ignored) {}
      }
    }
    return false;
  }
}
