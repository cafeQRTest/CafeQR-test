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
  // prevent concurrent prints from racing the port
  if (inFlight) return { via: 'locked' as const };
  inFlight = true;
  const release = () => setTimeout(() => { inFlight = false; }, 800);

  const payload = textToEscPos(opts.text, {
    codepage: opts.codepage,
    feed: 4,
    cut: 'full'
  });
  const base64 = btoa(String.fromCharCode(...payload));

  // --- Windows helper config (PRINT_WIN_*) ---
  const winCfg = () => ({
    url:
      localStorage.getItem('PRINT_WIN_URL') ||
      'http://127.0.0.1:3333/printRaw',
    name: localStorage.getItem('PRINT_WIN_PRINTER_NAME') || ''
  });

  const hasWinHelper =
    !!localStorage.getItem('PRINT_WIN_URL') &&
    !!localStorage.getItem('PRINT_WIN_PRINTER_NAME');

  const mode = localStorage.getItem('PRINTER_MODE') || '';

// utils/printGateway.ts
async function printWinspool(opts: Options) {
  const { url, name } = winCfg();
  if (!name) throw new Error('NO_WIN_PRINTER');

  // Convert the *actual* receipt text to plain bytes for Windows.
  const enc = new TextEncoder();
  const raw = enc.encode(
    (opts.text || '').replace(/\r?\n/g, '\r\n') + '\r\n\r\n\r\n'
  );
  const base64Plain = btoa(String.fromCharCode(...raw));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      printerName: name,
      dataBase64: base64Plain
    }),
    signal: ctrl.signal
  });

  clearTimeout(t);

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('WIN_SPOOL_FAILED ' + text);
  }

  return { via: 'winspool' as const };
}


  try {
    // 1) Native Android → use DevicePrinter (no web fallbacks)
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      // @ts-ignore
      const { DevicePrinter } = (window as any).Capacitor.Plugins;
      await DevicePrinter.ensurePermissions();

      let addr = localStorage.getItem('BT_PRINTER_ADDR') || undefined;
      if (!addr) {
        const pick = await DevicePrinter.pickPrinter();
        addr = pick?.address;
        if (!addr) throw new Error('No printer selected');
        try {
          await DevicePrinter.pairDevice({ address: addr });
        } catch {}
        localStorage.setItem('BT_PRINTER_ADDR', addr);
        if (pick?.name) localStorage.setItem('BT_PRINTER_NAME_HINT', pick.name);
      }

      const nameHint =
        localStorage.getItem('BT_PRINTER_NAME_HINT') || 'pos';
      const res = await DevicePrinter.printRaw({
        base64,
        address: addr,
        nameContains: nameHint
      });
      return { via: res?.via || 'android-pos' };
    }

    const n: any = navigator as any;

    // 1b) Windows helper (raw bytes to Windows spooler) if configured
    //     This runs before WebUSB / Web Serial when PRINTER_MODE === 'winspool'.
    if (hasWinHelper && mode === 'winspool') {
  try {
    return await printWinspool(opts);
  } catch (e) {
    console.warn('[print] winspool failed, falling back to browser/device APIs', e);
  }
}


    // 2) WebUSB (remembered device, then chooser if allowPrompt)
    if (n.usb) {
      try {
        const list: USBDevice[] = await n.usb.getDevices();
        if (list && list.length) {
          const device = list[0];
          await device.open();
          if (device.configuration == null) {
            await device.selectConfiguration(1);
          }
          const iface = device.configuration!.interfaces.find(i =>
            i.alternates.some(a =>
              a.endpoints.some(e => e.direction === 'out')
            )
          );
          if (!iface) throw new Error('No USB OUT endpoint');
          await device.claimInterface(iface.interfaceNumber);
          const outEp = iface.alternates[0].endpoints.find(
            e => e.direction === 'out'
          )!;
          await device.transferOut(outEp.endpointNumber, payload);
          await device.close();
          return { via: 'webusb' as const };
        }
      } catch {
        // fall through to prompt or next transport
      }

      if (opts.allowPrompt) {
        try {
          const filters =
            opts.vendorId && opts.productId
              ? [{ vendorId: opts.vendorId, productId: opts.productId }]
              : [{}];
          const device: USBDevice = await n.usb.requestDevice({ filters }); // user gesture required
          await device.open();
          if (device.configuration == null) {
            await device.selectConfiguration(1);
          }
          const iface = device.configuration!.interfaces.find(i =>
            i.alternates.some(a =>
              a.endpoints.some(e => e.direction === 'out')
            )
          );
          if (!iface) throw new Error('No USB OUT endpoint');
          await device.claimInterface(iface.interfaceNumber);
          const alt = iface.alternates[0];
          const outEp = alt.endpoints.find(e => e.direction === 'out')!;
          await device.transferOut(outEp.endpointNumber, payload);
          await device.close();
          return { via: 'webusb' as const };
        } catch {
          // continue to Web Serial / relay
        }
      }
    }

    // 3) Web Serial (remembered port, then chooser if allowPrompt)
    if (n.serial) {
      try {
        const ports: SerialPort[] = await n.serial.getPorts();
        if (ports && ports.length) {
          const port = ports[0];
          await port.open({ baudRate: 9600 });
          const w = port.writable!.getWriter();
          await w.write(payload);
          w.releaseLock();
          await port.close();
          return { via: 'webserial' as const };
        }
      } catch {
        // fall through to prompt or next transport
      }

      if (opts.allowPrompt) {
        try {
          const port: SerialPort = await n.serial.requestPort({}); // user gesture required
          await port.open({ baudRate: 9600 });
          const writer = port.writable!.getWriter();
          await writer.write(payload);
          writer.releaseLock();
          await port.close();
          return { via: 'webserial' as const };
        } catch {
          // continue
        }
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
          dataBase64: base64
        })
      });
      return { via: 'relay' as const };
    }

    // If system dialog is not allowed (desktop PWA silent mode),
    // stop here and let caller handle the failure.
    if (!opts.allowSystemDialog) {
      throw new Error('NO_PRINTER_CONFIGURED');
    }

    // 5) Browser UI fallbacks (print dialog or Web Share)
    const w = window.open('', '_blank', 'width=480,height=640');
    if (w) {
      w.document.write(
        `<pre style="font:14px/1.4 monospace; white-space:pre-wrap">${opts.text.replace(
          /</g,
          '&lt;'
        )}</pre>`
      );
      w.document.close();
      w.focus();
      w.print();
      w.close();
      return { via: 'system' as const };
    }

    if (navigator.canShare && navigator.canShare({ text: opts.text })) {
      await navigator.share({ title: 'Receipt', text: opts.text });
      return { via: 'share' as const };
    }

    // Force caller (KotPrint) to do its own last‑resort handling
    throw new Error('NO_SILENT_PATH');
  } finally {
    release();
  }
}
