// components/PrinterSetupCard.jsx  (pure JS/.jsx-safe)
import React, { useEffect, useState } from 'react';
import { printUniversal } from '../utils/printGateway';


export default function PrinterSetupCard() {
  // Wired (Windows helper)
  const [listUrl, setListUrl] = useState(localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers');
  const [postUrl, setPostUrl] = useState(localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw');
  const [printers, setPrinters] = useState([]);        // removed <string[]>
  const [pick, setPick] = useState(localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '');
  const [msg, setMsg] = useState('');

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


// components/PrinterSetupCard.jsx (grant under user gesture; leave other code as-is)
const chooseUsbOrSerial = async () => {
  try {
    if ('serial' in navigator) {
      await navigator.serial.requestPort({});  // user gesture required
      localStorage.setItem('PRINTER_READY', '1');
      setMsg('✓ Bluetooth/Serial saved for silent printing');
      return;
    }
    setMsg('✗ Web Serial not supported in this browser');
  } catch {
    setMsg('✗ Selection cancelled or failed');
  }
};

  async function selectUsbWebUSB() {
    try {
      if (navigator && 'usb' in navigator) {
        await navigator.usb.requestDevice({ filters: [] });  // removed "as any"
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
      setMsg('Cannot reach the local Print Hub. Start the helper and try again.');
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

  useEffect(() => { detect(); }, []);



  return (
    <div className="card">
      <h3>Printing</h3>

      <h4>Bluetooth method</h4>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
        <button onClick={selectBluetoothSerial}>Select Bluetooth (Serial)</button>
        <button onClick={() => { localStorage.setItem('PRINTER_MODE','bt-android'); localStorage.setItem('PRINTER_READY','1'); setMsg('✓ Android app link enabled'); }}>
          Use Android app (Thermer/RawBT)
        </button>
      </div>

      <h4>Wired / USB (Windows)</h4>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <input value={listUrl} onChange={e=>setListUrl(e.target.value)} style={{flex:1}}/>
        <button onClick={detect}>Load printers</button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <select value={pick} onChange={e=>setPick(e.target.value)} style={{flex:1}}>
          <option value="">— Select queue —</option>
          {printers.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <input value={postUrl} onChange={e=>setPostUrl(e.target.value)} style={{flex:1}}/>
        <button onClick={saveWired}>Save</button>
        <button onClick={selectUsbWebUSB}>Select USB (WebUSB)</button>
      </div>

      <div style={{display:'flex',gap:8}}>
        <button onClick={testClientSide}>Test print</button>
      </div>

      {msg && <div style={{marginTop:8}}>{msg}</div>}
    </div>
  );
}
