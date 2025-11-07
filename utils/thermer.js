// utils/thermer.js
function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

// Launch Thermer (Bluetooth Print) via Android Intent syntax
export function openThermerWithText(text) {
  if (!isAndroid()) throw new Error('Not Android');
  const u = `${window.location.origin}/api/thermer/receipt?t=${encodeURIComponent(text)}`;
  // Chrome intent to open: my.bluetoothprint.scheme://<RESPONSE_URL>
  const intent = `intent://${encodeURIComponent(u)}#Intent;scheme=my.bluetoothprint.scheme;package=mate.bluetoothprint;end`;
  window.location.href = intent; // must be invoked from a user gesture
}

// Optional: RawBT deep link (prints plain text)
export function openRawBTWithText(text) {
  if (!isAndroid()) throw new Error('Not Android');
  const path = encodeURI(text);
  // Chrome intent: rawbt:<TEXT>
  const intent = `intent://${path}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end`;
  window.location.href = intent;
}
