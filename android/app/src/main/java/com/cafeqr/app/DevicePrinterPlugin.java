// android/app/src/main/java/com/cafeqr/app/DevicePrinterPlugin.java
package com.cafeqr.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "DevicePrinter")
public class DevicePrinterPlugin extends Plugin {

  private static final int REQ_BT = 901;
  private String pendingPermCallbackId = null;

  // Ask runtime permissions (Android 12+ uses BLUETOOTH_CONNECT/SCAN)
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
public void printUsbRaw(PluginCall call) {
  try {
    String b64 = call.getString("base64");
    if (b64 == null) { call.reject("base64 required"); return; }
    byte[] data = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
    UsbManager mgr = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    for (UsbDevice dev : mgr.getDeviceList().values()) {
      for (int i=0;i<dev.getInterfaceCount();i++) {
        UsbInterface intf = dev.getInterface(i);
        for (int j=0;j<intf.getEndpointCount();j++) {
          UsbEndpoint ep = intf.getEndpoint(j);
          if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), 0, new Intent("USB_PERMISSION"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            if (!mgr.hasPermission(dev)) { mgr.requestPermission(dev, pi); /* return and ask user once */ }
            UsbDeviceConnection conn = mgr.openDevice(dev);
            conn.claimInterface(intf, true);
            conn.bulkTransfer(ep, data, data.length, 5000);
            conn.close();
            call.resolve();
            return;
          }
        }
      }
    }
    call.reject("No USB OUT endpoint");
  } catch (Exception e) { call.reject(e.getMessage()); }
}

@PluginMethod()
public void printSunmiText(PluginCall call) {
  try {
    String text = call.getString("text", "");
    // SunmiPrinterService via AIDL; bind and print
    // ... bind service and send text with line feeds + cut
    call.resolve();
  } catch (Exception e) { call.reject(e.getMessage()); }
}

  // One‑time picker dialog: short discovery, list bonded + found, return {name,address}
  @PluginMethod()
  public void pickPrinter(PluginCall call) {
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null || !adapter.isEnabled()) { call.reject("Bluetooth disabled"); return; }

    ArrayList<BluetoothDevice> devices = new ArrayList<>();
    ArrayList<String> labels = new ArrayList<>();

    try {
      Set<BluetoothDevice> bonded = adapter.getBondedDevices();
      if (bonded != null) {
        for (BluetoothDevice d : bonded) {
          devices.add(d);
          String n = (d.getName() == null ? "Unknown" : d.getName());
          labels.add("Paired • " + n + " (" + d.getAddress() + ")");
        }
      }
    } catch (Exception ignored) {}

    BroadcastReceiver receiver = new BroadcastReceiver() {
      @Override public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (BluetoothDevice.ACTION_FOUND.equals(action)) {
          BluetoothDevice d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
          if (d == null) return;
          for (BluetoothDevice e : devices) { if (e.getAddress().equals(d.getAddress())) return; }
          devices.add(d);
          String n = (d.getName() == null ? "Unknown" : d.getName());
          labels.add(n + " (" + d.getAddress() + ")");
        } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
          try { getContext().unregisterReceiver(this); } catch (Exception ignored) {}
        }
      }
    };

    try {
      IntentFilter f = new IntentFilter();
      f.addAction(BluetoothDevice.ACTION_FOUND);
      f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
      getContext().registerReceiver(receiver, f);
      try { adapter.cancelDiscovery(); } catch (Exception ignored) {}
      adapter.startDiscovery();
    } catch (Exception e) {
      call.reject("Discovery error: " + e.getMessage());
      return;
    }

    new Handler(Looper.getMainLooper()).postDelayed(() -> {
      try { adapter.cancelDiscovery(); } catch (Exception ignored) {}
      try {
        AlertDialog.Builder b = new AlertDialog.Builder(getActivity());
        b.setTitle("Select printer");
        if (labels.isEmpty()) labels.add("No devices found");
        CharSequence[] items = labels.toArray(new CharSequence[0]);
        b.setItems(items, (DialogInterface dialog, int which) -> {
          if (devices.isEmpty()) { call.reject("No devices"); return; }
          int idx = Math.max(0, Math.min(which, devices.size()-1));
          BluetoothDevice chosen = devices.get(idx);
          JSObject out = new JSObject();
          out.put("name", chosen.getName());
          out.put("address", chosen.getAddress());
          call.resolve(out);
        });
        b.setOnCancelListener(d -> call.reject("Picker cancelled"));
        b.show();
      } catch (Exception ex) {
        call.reject("Dialog error: " + ex.getMessage());
      } finally {
        try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
      }
    }, 3500);
  }

  // Optional: trigger system pairing (PIN often 0000/1234 on POS printers)
  @PluginMethod()
  public void pairDevice(PluginCall call) {
    String addr = call.getString("address");
    if (addr == null || addr.isEmpty()) { call.reject("address required"); return; }
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null || !adapter.isEnabled()) { call.reject("bluetooth disabled"); return; }
    try {
      BluetoothDevice d = adapter.getRemoteDevice(addr);
      boolean started = d.createBond();
      JSObject out = new JSObject();
      out.put("started", started);
      call.resolve(out);
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  // List currently bonded devices (debug/diagnostics)
  @PluginMethod()
  public void listBonded(PluginCall call) {
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    JSObject out = new JSObject();
    try {
      if (adapter != null && adapter.isEnabled()) {
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        int i = 0;
        for (BluetoothDevice d : bonded) {
          JSObject o = new JSObject();
          o.put("name", d.getName());
          o.put("address", d.getAddress());
          out.put(String.valueOf(i++), o);
        }
      }
      call.resolve(out);
    } catch (Exception e) { call.reject(e.getMessage()); }
  }

  // Print raw ESC/POS (runs on a worker thread)
  @PluginMethod()
  public void printRaw(PluginCall call) {
    String base64 = call.getString("base64");
    String btAddress = call.getString("address");
    String nameContains = call.getString("nameContains");
    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);

    new Thread(() -> {
      try {
        if (tryUsb(getContext(), data)) { call.resolve(new JSObject().put("via", "usb")); return; }
        if (tryBluetooth(getContext(), data, btAddress, nameContains)) { call.resolve(new JSObject().put("via", "bt")); return; }
        call.reject("No USB/Bluetooth path");
      } catch (Exception e) {
        call.reject(e.getMessage());
      }
    }).start();
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

    try { adapter.cancelDiscovery(); } catch (Exception ignored) {} // recommended before connect [docs]

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

    if (nameContains != null && !nameContains.isEmpty()) {
      for (BluetoothDevice d : bonded) {
        String n = d.getName() == null ? "" : d.getName();
        if (n.toLowerCase().contains(nameContains.toLowerCase())) { chosen = d; break; }
      }
      if (chosen != null) return connectAndWrite(chosen, data);
      return false;
    }

    BluetoothDevice[] arr = bonded.toArray(new BluetoothDevice[0]);
    if (arr.length == 0) return false;
    return connectAndWrite(arr[0], data);
  }

  private boolean connectAndWrite(BluetoothDevice dev, byte[] data) {
    try {
      try { BluetoothAdapter.getDefaultAdapter().cancelDiscovery(); } catch (Exception ignored) {}
      BluetoothSocket sock;
      try {
        sock = dev.createInsecureRfcommSocketToServiceRecord(
          UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"));
      } catch (Exception e) {
        sock = dev.createRfcommSocketToServiceRecord(
          UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"));
      }
      // Blocking call (~12s timeout if peer doesn’t respond)
      sock.connect();
      OutputStream os = sock.getOutputStream();
      os.write(data);
      os.flush();
      sock.close();
      return true;
    } catch (Exception ex) {
      try {
        BluetoothSocket alt = (BluetoothSocket) dev.getClass()
          .getMethod("createRfcommSocket", int.class).invoke(dev, 1);
        alt.connect();
        OutputStream os = alt.getOutputStream();
        os.write(data); os.flush(); alt.close();
        return true;
      } catch (Exception ignored) {}
      return false;
    }
  }
}
