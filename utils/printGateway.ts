// utils/printGateway.ts
import { Capacitor } from '@capacitor/core';
import { textToEscPos } from './escpos';

type Options = {
  text: string;               // Your 32/48-col receipt from printUtils
  vendorId?: number;          // Optional USB filter
  productId?: number;         // Optional USB filter
  relayUrl?: string;          // http://127.0.0.1:3333/print (Windows/Mac/Linux relay)
  ip?: string;                // Network printer fallback (used by relay)
  port?: number;              // Default 9100
  codepage?: number;          // ESC/POS codepage
};

export async function printUniversal(opts: Options) {
  const payload = textToEscPos(opts.text, { codepage: opts.codepage, feed: 4, cut: 'full' });

  // 1) Native Android POS (Capacitor plugin)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      // @ts-ignore custom plugin wired later
      const { DevicePrinter } = (window as any).Capacitor.Plugins;
      await DevicePrinter.printRaw({ base64: btoa(String.fromCharCode(...payload)) });
      return { via: 'android-pos' };
    } catch (e) { /* continue */ }
  }

  // 2) WebUSB (Chrome/Edge over HTTPS)
  // User gesture required: call this from a click handler
  if ('usb' in navigator) {
    try {
      // @ts-ignore
      const device: USBDevice = await (navigator as any).usb.requestDevice({
        filters: opts.vendorId && opts.productId ? [{ vendorId: opts.vendorId, productId: opts.productId }] : [{ }]
      });
      await device.open();
      if (device.configuration == null) await device.selectConfiguration(1);
      // claim first interface with OUT endpoint
      const iface = device.configuration!.interfaces.find(i => i.alternates.some(a => a.endpoints.some(e => e.direction === 'out')));
      if (!iface) throw new Error('No USB OUT endpoint');
      await device.claimInterface(iface.interfaceNumber);
      const alt = iface.alternates[0];
      const outEp = alt.endpoints.find(e => e.direction === 'out')!;
      await device.transferOut(outEp.endpointNumber, payload);
      await device.close();
      return { via: 'webusb' };
    } catch (e) { /* continue */ }
  }

  // 3) Web Serial (USB‑COM / RS232 bridges)
  if ('serial' in navigator) {
    try {
      // @ts-ignore
      const port: SerialPort = await (navigator as any).serial.requestPort({});
      await port.open({ baudRate: 9600 });
      const writer = port.writable!.getWriter();
      await writer.write(payload);
      writer.releaseLock();
      await port.close();
      return { via: 'webserial' };
    } catch (e) { /* continue */ }
  }

  // 4) Local/Network relay (Node “Print Hub”)
  if (opts.relayUrl && opts.ip) {
    await fetch(opts.relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: opts.ip, port: opts.port ?? 9100,
        dataBase64: btoa(String.fromCharCode(...payload))
      })
    });
    return { via: 'relay' };
  }

  // 5) System print dialog / share
  // Fallback: open printable window
  const w = window.open('', '_blank', 'width=480,height=640');
  if (w) {
    w.document.write(`<pre style="font:14px/1.4 monospace; white-space:pre-wrap">${opts.text.replace(/</g,'&lt;')}</pre>`);
    w.document.close(); w.focus(); w.print(); w.close();
    return { via: 'system' };
  }

  // last-resort: share text (your existing flow)
  if (navigator.canShare && navigator.canShare({ text: opts.text })) {
    await navigator.share({ title: 'Receipt', text: opts.text });
    return { via: 'share' };
  }
  throw new Error('No printing path available');
}
