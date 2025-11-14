// components/PrinterSetupCard.jsx
import React, { useState } from 'react';
import { printUniversal } from '../utils/printGateway';

export default function PrinterSetupCard() {
  const [saving, setSaving] = useState(false);
  const [relayUrl, setRelayUrl] = useState(localStorage.getItem('PRINT_RELAY_URL') || '');
  const [ip, setIp] = useState(localStorage.getItem('PRINTER_IP') || '');
  const [port, setPort] = useState(localStorage.getItem('PRINTER_PORT') || '9100');
  const [msg, setMsg] = useState('');

  const chooseUsbOrSerial = async () => {
  setSaving(true);
  try {
    const n = navigator;
    
    // Try WebUSB first
    if (n.usb) {
      try {
        const device = await n.usb.requestDevice({ filters: [] });
        localStorage.setItem('PRINTER_READY', '1');
        localStorage.setItem('PRINTER_TYPE', 'usb');
        setMsg('✓ USB printer saved for silent printing');
        setSaving(false);
        return;
      } catch (e) {
        console.log('USB selection cancelled or failed');
      }
    }
    
    // Try Web Serial
    if (n.serial) {
      try {
        const port = await n.serial.requestPort();
        localStorage.setItem('PRINTER_READY', '1');
        localStorage.setItem('PRINTER_TYPE', 'serial');
        setMsg('✓ Serial printer saved for silent printing');
        setSaving(false);
        return;
      } catch (e) {
        console.log('Serial selection cancelled');
      }
    }
    
    setMsg('✗ No compatible printer interface found');
  } catch (e) {
    setMsg('✗ Selection cancelled or failed');
  } finally {
    setSaving(false);
  }
};


  return (
    <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff' }}>
      <h3 style={{ marginTop:0 }}>Printer Setup</h3>
      <p style={{ marginTop:8 }}>Select a USB/Serial printer once or configure a network relay for silent prints.</p>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button disabled={saving} onClick={chooseUsbOrSerial} style={{ padding:'10px 12px', borderRadius:8 }}>
          {saving ? 'Opening chooser…' : 'Select USB/Serial'}
        </button>
      </div>
      <div style={{ marginTop:12 }}>
        <div style={{ fontWeight:600, marginBottom:6 }}>Or use local network relay</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <input value={relayUrl} onChange={e=>setRelayUrl(e.target.value)} placeholder="http://127.0.0.1:3333/print" style={{ padding:8, border:'1px solid #ddd', borderRadius:6, minWidth:240 }} />
          <input value={ip} onChange={e=>setIp(e.target.value)} placeholder="Printer IP (e.g., 192.168.1.50)" style={{ padding:8, border:'1px solid #ddd', borderRadius:6 }} />
          <input value={port} onChange={e=>setPort(e.target.value)} placeholder="9100" style={{ padding:8, border:'1px solid #ddd', borderRadius:6, width:100 }} />
          <button onClick={saveRelay} style={{ padding:'10px 12px', borderRadius:8 }}>Save Relay</button>
        </div>
      </div>
      {msg ? <div style={{ marginTop:10, color: msg.startsWith('✓') ? '#065f46' : '#991b1b' }}>{msg}</div> : null}
    </div>
  );
}
