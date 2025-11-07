// utils/thermer.js
export function openThermerWithText(text) {
  const u = `${window.location.origin}/api/thermer/receipt?t=${encodeURIComponent(text)}`;
  // Some devices accept raw URL, others prefer encodeURI — raw usually works as per Thermer docs
  const deeplink = `my.bluetoothprint.scheme://${u}`;
  window.location.href = deeplink;
}
