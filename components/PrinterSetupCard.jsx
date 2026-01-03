// components/PrinterSetupCard.jsx
import React, { useEffect, useState } from 'react';
import { printUniversal } from '../utils/printGateway';

export default function PrinterSetupCard() {

// top state
const [paperMm, setPaperMm] = useState(() => {
  if (typeof window === 'undefined') return '58';
  return localStorage.getItem('PRINT_PAPER_MM') || '58';
});

const [leftDots, setLeftDots] = useState(() => {
  if (typeof window === 'undefined') return '12';
  return localStorage.getItem('PRINT_LEFT_MARGIN_DOTS') || '12';
});

const [rightDots, setRightDots] = useState(() => {
  if (typeof window === 'undefined') return '12';
  return localStorage.getItem('PRINT_RIGHT_MARGIN_DOTS') || '12';
});

const persistPaperSettings = () => {
  localStorage.setItem('PRINT_PAPER_MM', paperMm);
  localStorage.setItem('PRINT_WIDTH_COLS', cols);
  localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', leftDots);
  localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', rightDots);
};

  // Wired (Windows helper)
  const [listUrl, setListUrl] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers'
      : 'http://127.0.0.1:3333/printers'
  );
  const [postUrl, setPostUrl] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw'
      : 'http://127.0.0.1:3333/printRaw'
  );
  const [printers, setPrinters] = useState([]);

  // Separate picks for Bill vs KOT
  const [pickBill, setPickBill] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('PRINT_WIN_PRINTER_NAME') || ''
      : ''
  );
  const [pickKot, setPickKot] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('PRINT_WIN_PRINTER_NAME_KOT') || ''
      : ''
  );

  const [msg, setMsg] = useState('');
  const WIN_HELPER_URL = '/desktop/Windows/CafeQR-PrintHub-Win.zip';

  // Receipt width + autocut
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return '32';
    return localStorage.getItem('PRINT_WIDTH_COLS') || '32';
  });
  const [autoCut, setAutoCut] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('PRINT_WIN_AUTOCUT') === '1';
  });

  // --- handlers -------------------------------------------------------------

  async function selectBluetoothSerial() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (!nav || !('serial' in nav)) {
        setMsg('✗ Web Serial not supported in this browser');
        return;
      }
      // One-time chooser – must be called from a click
      // @ts-ignore (safe in JS, TS hint only)
      await nav.serial.requestPort({});
      localStorage.setItem('PRINTER_MODE', 'bt-serial');
      localStorage.setItem('PRINTER_READY', '1');
      persistPaperSettings();
      // clear Windows helper config when switching modes
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME_KOT');
      localStorage.removeItem('PRINT_WIN_URL');
      setMsg('✓ Bluetooth/Serial saved for silent printing');
    } catch (err) {
      setMsg('✗ Selection cancelled');
    }
  }

  const forgetBtPrinter = () => {
    localStorage.removeItem('BT_PRINTER_ADDR');
    localStorage.removeItem('BT_PRINTER_NAME_HINT');
    localStorage.removeItem('BT_PRINTER_ADDR_KOT');
    localStorage.removeItem('BT_PRINTER_NAME_HINT_KOT');
    setMsg(
      'Saved Bluetooth printers cleared. Next Android bill/KOT print will ask you to select again.'
    );
  };

  async function selectUsbWebUSB() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && 'usb' in nav) {
        // one‑time chooser
        // @ts-ignore
        await nav.usb.requestDevice({ filters: [] });
        localStorage.setItem('PRINTER_MODE', 'webusb');
        localStorage.setItem('PRINTER_READY', '1');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME_KOT');
        localStorage.removeItem('PRINT_WIN_URL');
        persistPaperSettings();

        setMsg('✓ USB printer saved for silent printing');
        return;
      }
      setMsg('✗ WebUSB not supported in this browser');
    } catch (err) {
      setMsg('✗ Selection cancelled');
    }
  }

  const detect = async () => {
    try {
      const r = await fetch(listUrl);
      const names = await r.json();
      const arr = Array.isArray(names) ? names : [];
      setPrinters(arr);
      // If no bill printer saved yet, default to the first queue
      if (!pickBill && arr.length) setPickBill(arr[0]);
      setMsg(`Found ${arr.length} printers`);
    } catch (err) {
      setMsg(
        'Cannot reach the local Print Hub. Start the helper on this Windows machine and try again.'
      );
    }
  };

  const saveWired = () => {
    localStorage.setItem('PRINT_WIN_LIST_URL', listUrl.trim());
    localStorage.setItem('PRINT_WIN_URL', postUrl.trim());
    localStorage.setItem('PRINT_WIN_PRINTER_NAME', (pickBill || '').trim());
    localStorage.setItem('PRINT_WIN_PRINTER_NAME_KOT', (pickKot || '').trim());
    localStorage.setItem('PRINTER_MODE', 'winspool');
    localStorage.setItem('PRINTER_READY', '1');
    localStorage.setItem('PRINT_WIN_AUTOCUT', autoCut ? '1' : '0');
    localStorage.setItem('PRINT_PAPER_MM', paperMm);
    localStorage.setItem('PRINT_WIDTH_COLS', cols);
    localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', leftDots);
    localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', rightDots);

    setMsg(
      pickBill
        ? `Saved bill printer${pickKot ? ' and kitchen KOT printer' : ''}.`
        : 'Pick at least a bill printer queue first.'
    );
  };

  // Test both printers through the same pipeline
const testBillPrinter = async () => {
  try {
    const ruler48 = '|' + '-'.repeat(46) + '|'; // visual edges
    const txt =
      '*** TEST BILL PRINTER ***\n' +
      'Shreyans 80mm alignment\n' +
      ruler48 + '\n' +
      '123456789012345678901234567890123456789012345678\n';

    const res = await printUniversal({
      text: txt,
      allowPrompt: true,
      allowSystemDialog: false,
      jobKind: 'bill'
    });

    setMsg(`✓ Bill printer test via ${res && res.via ? res.via : 'unknown'}`);
  } catch (e) {
    setMsg(`✗ Bill printer test failed: ${e && e.message ? e.message : e}`);
  }
};

  const testKotPrinter = async () => {
    try {
      const res = await printUniversal({
        text: '*** TEST KOT PRINTER ***\nKitchen Ticket\n',
        allowPrompt: true,
        allowSystemDialog: false,
        jobKind: 'kot'
      });
      setMsg(`✓ KOT printer test via ${res && res.via ? res.via : 'unknown'}`);
    } catch (e) {
      setMsg(`✗ KOT printer test failed: ${e && e.message ? e.message : e}`);
    }
  };

  useEffect(() => {
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- layout ---------------------------------------------------------------

  return (
    <div
      className="card"
      style={{
        maxWidth: 800,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}
    >
      {/* Windows section */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: 12,
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <h4 style={{ margin: 0 }}>Windows (Chrome / PWA)</h4>
        <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
          Configure how this Windows device prints silently to your thermal printers.
          You can use one printer for both or dedicate a separate KOT printer for the kitchen.
        </p>

        {/* Wired / USB / Network via helper */}
        <div
          style={{
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>Wired (USB / Windows helper)</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Use the Cafe QR Print Hub on this PC to send raw data to any installed printer
            (USB, Bluetooth, or network). Start the helper, then load printers and save queues.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input
              value={listUrl}
              onChange={e => setListUrl(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 6, fontSize: 13 }}
            />
            <button onClick={detect} style={{ padding: '6px 10px', fontSize: 13 }}>
              Load printers
            </button>
          </div>

          {/* Bill printer select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Bill printer (Counter)</label>
            <select
              value={pickBill}
              onChange={e => setPickBill(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 6, fontSize: 13 }}
            >
              <option value="">— Select bill printer —</option>
              {printers.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* KOT printer select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>
              Kitchen KOT printer (optional)
            </label>
            <select
              value={pickKot}
              onChange={e => setPickKot(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 6, fontSize: 13 }}
            >
              <option value="">— Use bill printer for KOT —</option>
              {printers.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input
              value={postUrl}
              onChange={e => setPostUrl(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 6, fontSize: 13 }}
            />
            <button onClick={selectUsbWebUSB} style={{ padding: '6px 10px', fontSize: 13 }}>
              Select USB (WebUSB)
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={autoCut}
                onChange={e => setAutoCut(e.target.checked)}
              />
              Enable auto‑cut (ESC/POS) on this printer
            </label>
          </div>

<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13 }}>
  <span>Paper width:</span>

  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="radio"
      checked={paperMm === '58'}
      onChange={() => { setPaperMm('58'); setCols('32'); }}
    />
    2" / 58 mm (32 cols)
  </label>

  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="radio"
      checked={paperMm === '80' && cols === '48'}
      onChange={() => { setPaperMm('80'); setCols('48'); }}
    />
    3" / 80 mm (48 cols)
  </label>

  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="radio"
      checked={paperMm === '80' && cols === '42'}
      onChange={() => { setPaperMm('80'); setCols('42'); }}
    />
    3" / 80 mm (42 cols)
  </label>

<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13 }}>
  <span>Side margins (dots):</span>

  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    Left
    <input
      value={leftDots}
      onChange={(e) => setLeftDots(e.target.value.replace(/[^\d]/g, ''))}
      style={{ width: 70, padding: 6, fontSize: 13 }}
      inputMode="numeric"
    />
  </label>

  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    Right
    <input
      value={rightDots}
      onChange={(e) => setRightDots(e.target.value.replace(/[^\d]/g, ''))}
      style={{ width: 70, padding: 6, fontSize: 13 }}
      inputMode="numeric"
    />
  </label>

  <button
    onClick={() => {
      // quick presets
      if (paperMm === '80') { setLeftDots('12'); setRightDots('12'); }
      else { setLeftDots('8'); setRightDots('8'); }
      setMsg('Margin dots preset applied. Click Save (or re-select WebUSB/Serial) to persist.');
    }}
    style={{ padding: '6px 10px', fontSize: 13 }}
  >
    Preset
  </button>
</div>

</div>



          <a
            href={WIN_HELPER_URL}
            download="CafeQR-PrintHub-Win.zip"
            className="btn btn-primary"
            style={{ padding: '6px 10px', fontSize: 13 }}
          >
            Download CafeQR Print Hub (Windows)
          </a>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <button onClick={saveWired} style={{ padding: '6px 10px', fontSize: 13 }}>
              Save
            </button>
          </div>
        </div>

        {/* Wireless via Bluetooth serial */}
        <div
          style={{
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>Wireless (Bluetooth serial)</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            If your printer appears as a Bluetooth COM port on Windows, grant this site
            access once using Web Serial.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={selectBluetoothSerial}
              style={{ padding: '6px 10px', fontSize: 13, flexShrink: 0 }}
            >
              Select Bluetooth (Serial)
            </button>
          </div>
        </div>
      </div>

      {/* Android section */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: 12,
          marginTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <h4 style={{ margin: 0 }}>Android (App / PWA)</h4>

        {/* Android PWA / browser */}
        <div
          style={{
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>Android browser / PWA</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            On Android Chrome / PWA, Cafe QR can forward receipts to Thermer or RawBT for
            Bluetooth printing.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={() => {
                localStorage.setItem('PRINTER_MODE', 'bt-android');
                localStorage.setItem('PRINTER_READY', '1');
                setMsg('✓ Android app link enabled (Thermer / RawBT)');
              }}
              style={{ padding: '6px 10px', fontSize: 13 }}
            >
              Use Android app (Thermer/RawBT)
            </button>
          </div>
        </div>

        {/* Android APK native plugin helper */}
        <div
          style={{
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>Android Cafe QR app</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            The APK uses the built‑in Bluetooth driver. Configure separate bill and kitchen
            printers by printing once from each kind of ticket (bill vs KOT) on this device.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={forgetBtPrinter} style={{ padding: '6px 10px', fontSize: 13 }}>
              Forget Bluetooth printers
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: separate tests + status */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8
        }}
      >
        <button onClick={testBillPrinter} style={{ padding: '6px 10px', fontSize: 13 }}>
          Test bill printer
        </button>
        <button onClick={testKotPrinter} style={{ padding: '6px 10px', fontSize: 13 }}>
          Test KOT printer
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: msg.startsWith('✗') ? '#b91c1c' : '#166534'
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
