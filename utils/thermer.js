// utils/thermer.js
function isAndroid() { return /Android/i.test(navigator.userAgent); }

function assertUserGesture() {
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    throw new Error('User gesture required');
  }
}

// Thermer (Bluetooth Print)
export function openThermerWithText(text) {
  if (!isAndroid()) throw new Error('Not Android');
  assertUserGesture();
  const u = `${window.location.origin}/api/thermer/receipt?t=${encodeURIComponent(text)}`;
  // 1) try custom scheme exactly as Thermer docs show
  const schemeUrl = `my.bluetoothprint.scheme://${u}`;
  window.location.href = schemeUrl;
  // 2) fallback to Chrome intent after a short delay
  setTimeout(() => {
    const intent = `intent://${u}#Intent;scheme=my.bluetoothprint.scheme;package=mate.bluetoothprint;end`;
    window.location.href = intent;
  }, 150);
}

// RawBT (optional)
export function openRawBTWithText(text) {
  if (!isAndroid()) throw new Error('Not Android');
  assertUserGesture();
  // RawBT supports intent deep links; see RawBT Intents reference
  const intent = `intent://${encodeURIComponent(text)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end`;
  window.location.href = intent;
}
