// utils/thermer.js
function isAndroid() { return /Android/i.test(navigator.userAgent); }

// Thermer (custom scheme → intent fallback)
export function openThermerWithText(text) {
  if (!isAndroid()) throw new Error('Not Android');
  const u = `${window.location.origin}/api/thermer/receipt?t=${encodeURIComponent(text)}`;
  const scheme = `my.bluetoothprint.scheme://${u}`;

  // try custom scheme via a synthetic anchor click (best for PWAs)
  const a = document.createElement('a');
  a.href = scheme;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // fallback to Chrome intent after a short delay
  setTimeout(() => {
    const intent = `intent://${u}#Intent;scheme=my.bluetoothprint.scheme;package=mate.bluetoothprint;end`;
    window.location.href = intent;
  }, 150);
}

// RawBT (intent)
export function openRawBTWithText(text) {
  if (!isAndroid()) throw new Error('Not Android');
  const intent = `intent://${encodeURIComponent(text)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end`;
  window.location.href = intent;
}
