// components/PrinterSetupCard.jsx
import React, { useEffect, useState } from 'react';
import { printUniversal } from '../utils/printGateway';

export default function PrinterSetupCard() {
  // Wired (Windows helper)
  const [listUrl, setListUrl] = useState(
    localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers'
  );
  const [postUrl, setPostUrl] = useState(
    localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw'
  );
  const [printers, setPrinters] = useState([]);
  const [pick, setPick] = useState(localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '');
  const [msg, setMsg] = useState('');
  const WIN_HELPER_URL = '/desktop/Windows/CafeQR-PrintHub-Win.zip';


  // --- existing handlers (unchanged behaviour) ------------------------------

  async function selectBluetoothSerial() {
    try {
      if (!('serial' in navigator)) {
        setMsg('✗ Web Serial not supported in this browser');
        return;
      }
      // One-time chooser – must be called from a click
      await navigator.serial.requestPort({});
      localStorage.setItem('PRINTER_MODE', 'bt-serial');
      localStorage.setItem('PRINTER_READY', '1');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
      localStorage.removeItem('PRINT_WIN_URL');
      setMsg('✓ Bluetooth/Serial saved for silent printing');
    } catch {
      setMsg('✗ Selection cancelled');
    }
  }

  const forgetBtPrinter = () => {
    localStorage.removeItem('BT_PRINTER_ADDR');
    localStorage.removeItem('BT_PRINTER_NAME_HINT');
    setMsg(
      'Saved Bluetooth printer cleared. Next Android print will ask you to select again.'
    );
  };

  async function selectUsbWebUSB() {
    try {
      if (navigator && 'usb' in navigator) {
        await navigator.usb.requestDevice({ filters: [] });
        localStorage.setItem('PRINTER_MODE', 'webusb');
        localStorage.setItem('PRINTER_READY', '1');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
        localStorage.removeItem('PRINT_WIN_URL');
        setMsg('✓ USB printer saved for silent printing');
        return;
      }
      setMsg('✗ WebUSB not supported in this browser');
    } catch {
      setMsg('✗ Selection cancelled');
    }
  }

  const detect = async () => {
    try {
      const r = await fetch(listUrl);
      const names = await r.json();
      const arr = Array.isArray(names) ? names : [];
      setPrinters(arr);
      if (!pick && arr.length) setPick(arr[0]);
      setMsg(`Found ${arr.length} printers`);
    } catch {
      setMsg(
        'Cannot reach the local Print Hub. Start the helper on this Windows machine and try again.'
      );
    }
  };

  const saveWired = () => {
    localStorage.setItem('PRINT_WIN_LIST_URL', listUrl.trim());
    localStorage.setItem('PRINT_WIN_URL', postUrl.trim());
    localStorage.setItem('PRINT_WIN_PRINTER_NAME', (pick || '').trim());
    localStorage.setItem('PRINTER_MODE', 'winspool');
    localStorage.setItem('PRINTER_READY', '1');
    setMsg(pick ? `Saved: ${pick}` : 'Pick a printer first');
  };

  const testClientSide = async () => {
    try {
      const res = await printUniversal({
        text: '*** TEST PRINT ***\nCafe QR\n',
        allowPrompt: true,
        allowSystemDialog: false
      });
      setMsg(`✓ Test via ${res?.via || 'unknown'}`);
    } catch (e) {
      setMsg(`✗ Test failed: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    detect();
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
          Configure how this Windows device prints silently to your thermal printer.
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
            (USB, Bluetooth, or network). Start the helper, then load printers and save a
            queue.
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            <input
              value={listUrl}
              onChange={e => setListUrl(e.target.value)}
              style={{
                flex: 1,
                minWidth: 180,
                padding: 6,
                fontSize: 13
              }}
            />
            <button onClick={detect} style={{ padding: '6px 10px', fontSize: 13 }}>
              Load printers
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            <select
              value={pick}
              onChange={e => setPick(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 6, fontSize: 13 }}
            >
              <option value="">— Select printer queue —</option>
              {printers.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            <input
              value={postUrl}
              onChange={e => setPostUrl(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: 6, fontSize: 13 }}
            />
            <button onClick={saveWired} style={{ padding: '6px 10px', fontSize: 13 }}>
              Save
            </button>
            <button onClick={selectUsbWebUSB} style={{ padding: '6px 10px', fontSize: 13 }}>
              Select USB (WebUSB)
            </button>
          </div>
<a
  href={WIN_HELPER_URL}
  download="CafeQR-PrintHub-Win.zip"
  className="btn btn-primary"
>
  Download CafeQR Print Hub (Windows)
</a>
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
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
            The APK uses the built‑in Bluetooth driver. If you change printers on this
            device, clear the saved address so the app asks you to pick again.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            <button onClick={forgetBtPrinter} style={{ padding: '6px 10px', fontSize: 13 }}>
              Forget Bluetooth printer
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: test + status */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8
        }}
      >
        <button onClick={testClientSide} style={{ padding: '6px 10px', fontSize: 13 }}>
          Test print
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 8, fontSize: 13, color: msg.startsWith('✗') ? '#b91c1c' : '#166534' }}>
          {msg}
        </div>
      )}
    </div>
  );
}
