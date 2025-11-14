// utils/printGateway.ts
import { Capacitor } from '@capacitor/core';
import { textToEscPos } from './escpos';

type Options = {
  text: string;
  vendorId?: number;
  productId?: number;
  relayUrl?: string;
  ip?: string;
  port?: number;
  codepage?: number;
  allowPrompt?: boolean;
  allowSystemDialog?: boolean;
};

let inFlight = false;

export async function printUniversal(opts: Options) {
  if (inFlight) return { via: 'locked' };
  inFlight = true;
  const release = () => setTimeout(() => { inFlight = false; }, 800);

  const payload = textToEscPos(opts.text, { codepage: opts.codepage, feed: 4, cut: 'full' });
  const base64 = btoa(String.fromCharCode(...payload));

  try {
    // 1) Native Android → single fast attempt, no web fallbacks
    // utils/printGateway.ts (inside the native Android branch)
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  // @ts-ignore
  const { DevicePrinter } = (window as any).Capacitor.Plugins;
  await DevicePrinter.ensurePermissions();

  let addr = localStorage.getItem('BT_PRINTER_ADDR') || undefined;
  if (!addr) {
    // 1) Let the user pick a device (short scan + dialog)
    const pick = await DevicePrinter.pickPrinter();
    addr = pick?.address;
    if (!addr) throw new Error('No printer selected');

    // 2) Try to start pairing once (some printers work without pairing via insecure RFCOMM)
    try { await DevicePrinter.pairDevice({ address: addr }); } catch {}

    // 3) Persist for next time (instant connects)
    localStorage.setItem('BT_PRINTER_ADDR', addr);
    if (pick?.name) localStorage.setItem('BT_PRINTER_NAME_HINT', pick.name);
  }

  const nameHint = localStorage.getItem('BT_PRINTER_NAME_HINT') || 'pos';
  const res = await DevicePrinter.printRaw({ base64, address: addr, nameContains: nameHint });
  return { via: res?.via || 'android-pos' };
}



    // 2) WebUSB (reopen previously granted device only)
    const n: any = navigator as any;
    if (n.usb) {
      try {
        const list: USBDevice[] = await n.usb.getDevices();
        if (list && list.length) {
          const device = list[0];
          await device.open();
          if (device.configuration == null) await device.selectConfiguration(1);
          const iface = device.configuration!.interfaces.find(i => i.alternates.some(a => a.endpoints.some(e => e.direction === 'out')));
          await device.claimInterface(iface!.interfaceNumber);
          const outEp = iface!.alternates[0].endpoints.find(e => e.direction === 'out')!;
          await device.transferOut(outEp.endpointNumber, payload);
          await device.close();
          return { via: 'webusb' };
        }
      } catch { /* fall through */ }

      if (opts.allowPrompt) {
        try {
          const filters = (opts.vendorId && opts.productId) ? [{ vendorId: opts.vendorId, productId: opts.productId }] : [{}];
          const device: USBDevice = await n.usb.requestDevice({ filters }); // user gesture required
          await device.open();
          if (device.configuration == null) await device.selectConfiguration(1);
          const iface = device.configuration!.interfaces.find(i => i.alternates.some(a => a.endpoints.some(e => e.direction === 'out')));
          if (!iface) throw new Error('No USB OUT endpoint');
          await device.claimInterface(iface.interfaceNumber);
          const alt = iface.alternates[0];
          const outEp = alt.endpoints.find(e => e.direction === 'out')!;
          await device.transferOut(outEp.endpointNumber, payload);
          await device.close();
          return { via: 'webusb' };
        } catch { /* continue */ }
      }
    }

    // 3) Web Serial (reopen previously granted port only)
    if ((navigator as any).serial) {
      try {
        const ports: SerialPort[] = await (navigator as any).serial.getPorts();
        if (ports && ports.length) {
          const port = ports[0];
          await port.open({ baudRate: 9600 });
          const w = port.writable!.getWriter();
          await w.write(payload);
          w.releaseLock();
          await port.close();
          return { via: 'webserial' };
        }
      } catch { /* fall through */ }

      if (opts.allowPrompt) {
        try {
          const port: SerialPort = await (navigator as any).serial.requestPort({}); // user gesture required
          await port.open({ baudRate: 9600 });
          const writer = port.writable!.getWriter();
          await writer.write(payload);
          writer.releaseLock();
          await port.close();
          return { via: 'webserial' };
        } catch { /* continue */ }
      }
    }

    // 4) Local/Network relay (raw TCP 9100)
    if (opts.relayUrl && opts.ip) {
      await fetch(opts.relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: opts.ip,
          port: opts.port ?? 9100,
          dataBase64: btoa(String.fromCharCode(...payload)),
        }),
      });
      return { via: 'relay' };
    }
    
    if (!opts.allowSystemDialog) {
  // For desktop PWA, don't fall back to system dialog or share
  throw new Error('NO_PRINTER_CONFIGURED');
}
    // 5) Browser UI fallbacks (only if allowed)
    if (opts.allowSystemDialog !== false) {
      const w = window.open('', '_blank', 'width=480,height=640');
      if (w) {
        w.document.write(`<pre style="font:14px/1.4 monospace; white-space:pre-wrap">${opts.text.replace(/</g,'&lt;')}</pre>`);
        w.document.close(); w.focus(); w.print(); w.close();
        return { via: 'system' };
      }
      if (navigator.canShare && navigator.canShare({ text: opts.text })) {
        await navigator.share({ title: 'Receipt', text: opts.text });
        return { via: 'share' };
      }
    }

    // Force caller to handle app‑link fallback
    throw new Error('NO_SILENT_PATH');
  } finally {
    release();
  }
}
