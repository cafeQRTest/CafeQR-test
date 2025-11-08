// android/app/src/main/java/com/cafeqr/app/DevicePrinterPlugin.java
package com.cafeqr.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "DevicePrinter")
public class DevicePrinterPlugin extends Plugin {

  private static final int REQ_BT = 901;
  private String pendingPermCallbackId = null;

  @PluginMethod()
  public void ensurePermissions(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      boolean connectOk = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
      boolean scanOk = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
      if (!connectOk || !scanOk) {
        bridge.saveCall(call);
        pendingPermCallbackId = call.getCallbackId();
        ActivityCompat.requestPermissions(
          getActivity(),
          new String[]{ Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN },
          REQ_BT
        );
        return;
      }
    }
    call.resolve();
  }

  @Override
  public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQ_BT) return;

    PluginCall saved = null;
    if (pendingPermCallbackId != null) {
      saved = bridge.getSavedCall(pendingPermCallbackId);
      pendingPermCallbackId = null;
    }
    if (saved == null) return;

    boolean granted = true;
    for (int r : grantResults) { if (r != PackageManager.PERMISSION_GRANTED) { granted = false; break; } }
    if (granted) saved.resolve(); else saved.reject("Bluetooth permission denied");
  }

  @PluginMethod()
  public void printRaw(PluginCall call) {
    String base64 = call.getString("base64");
    String btAddress = call.getString("address");          // optional
    String nameContains = call.getString("nameContains");  // optional
    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);

    bridge.executeOnMainThread(() -> {}); // no UI work; keep method lightweight [runs on plugin thread]

    try {
      if (tryUsb(getContext(), data)) { call.resolve(new JSObject().put("via", "usb")); return; }
      if (tryBluetooth(getContext(), data, btAddress, nameContains)) { call.resolve(new JSObject().put("via", "bt")); return; }
      call.reject("No USB/Bluetooth path");
    } catch (Exception e) {
      call.reject(e.getMessage());
    }
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
      for (int i = 0; i < dev.getInterfaceCount(); i++) {
        UsbInterface cand = dev.getInterface(i);
        for (int a = 0; a < cand.getEndpointCount(); a++) {
          if (cand.getEndpoint(a).getDirection() == UsbConstants.USB_DIR_OUT) { iface = cand; break; }
        }
        if (iface != null) break;
      }
      if (iface == null) continue;
      UsbDeviceConnection conn = mgr.openDevice(dev);
      if (conn == null) continue;
      if (!conn.claimInterface(iface, true)) { conn.close(); continue; }
      UsbEndpoint out = null;
      for (int a = 0; a < iface.getEndpointCount(); a++) {
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

  private boolean tryBluetooth(Context ctx, byte[] data, String targetAddress, String nameContains) throws Exception {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
        throw new SecurityException("BLUETOOTH_CONNECT not granted");
      }
    }
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null || !adapter.isEnabled()) return false;

    // Cancel discovery for faster connect as per docs
    try { adapter.cancelDiscovery(); } catch (Exception ignored) {} // speeds up RFCOMM connect [docs]

    Set<BluetoothDevice> bonded = adapter.getBondedDevices();
    if (bonded == null || bonded.isEmpty()) return false;

    BluetoothDevice chosen = null;
    if (targetAddress != null && !targetAddress.isEmpty()) {
      for (BluetoothDevice d : bonded) {
        if (d.getAddress() != null && d.getAddress().equalsIgnoreCase(targetAddress)) { chosen = d; break; }
      }
      if (chosen == null) return false;
      return connectAndWrite(chosen, data);
    }

    // Fallback: pick first device matching friendly name to avoid looping all devices
    if (nameContains != null && !nameContains.isEmpty()) {
      for (BluetoothDevice d : bonded) {
        String n = d.getName() == null ? "" : d.getName();
        if (n.toLowerCase().contains(nameContains.toLowerCase())) {
          chosen = d; break;
        }
      }
      if (chosen != null) return connectAndWrite(chosen, data);
      return false;
    }

    // Last resort: only try the first bonded device to avoid long blocking loops
    BluetoothDevice[] arr = bonded.toArray(new BluetoothDevice[0]);
    if (arr.length == 0) return false;
    return connectAndWrite(arr[0], data);
  }

  private boolean connectAndWrite(BluetoothDevice dev, byte[] data) {
    // RFCOMM connect is blocking (~12s timeout), so try a single target only as per docs
    try {
      BluetoothSocket sock = dev.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"));
      sock.connect();
      OutputStream os = sock.getOutputStream();
      os.write(data);
      os.flush();
      sock.close();
      return true;
    } catch (Exception ex) {
      try { Thread.sleep(50); } catch (InterruptedException ignored) {}
      try { dev.getClass().getMethod("createRfcommSocket", int.class).invoke(dev, 1); } catch (Exception ignored) {}
      return false;
    }
  }
}
