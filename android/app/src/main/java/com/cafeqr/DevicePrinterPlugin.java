// android/app/src/main/java/com/cafeqr/DevicePrinterPlugin.java (skeleton)
@CapacitorPlugin(name = "DevicePrinter")
public class DevicePrinterPlugin extends Plugin {
  @PluginMethod
  public void printRaw(PluginCall call) {
    String base64 = call.getString("base64");
    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
    try {
      if (isSunmi()) SunmiBridge.print(data);
      else if (isPax()) PaxBridge.print(data);
      else throw new Exception("No vendor SDK");
      call.resolve();
    } catch (Exception e) { call.reject(e.getMessage()); }
  }
}
