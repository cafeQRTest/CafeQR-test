// components/PrinterSetupCard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { printUniversal } from '../utils/printGateway';
import { getSupabase } from '../services/supabase';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map(s => String(s || '').trim()).filter(Boolean)));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function PrinterSetupCard({ restaurantId }) {
  // ---------- Paper settings ----------
  const [paperMm, setPaperMm] = useState(() => localStorage.getItem('PRINT_PAPER_MM') || '58');
  const [cols, setCols] = useState(() => localStorage.getItem('PRINT_WIDTH_COLS') || '32');
  const [leftDots, setLeftDots] = useState(() => localStorage.getItem('PRINT_LEFT_MARGIN_DOTS') || '0');
  const [rightDots, setRightDots] = useState(() => localStorage.getItem('PRINT_RIGHT_MARGIN_DOTS') || '0');
  const [autoCut, setAutoCut] = useState(() => localStorage.getItem('PRINT_WIN_AUTOCUT') === '1');

  const persistPaperSettings = () => {
    localStorage.setItem('PRINT_PAPER_MM', String(paperMm));
    localStorage.setItem('PRINT_WIDTH_COLS', String(cols));
    localStorage.setItem('PRINT_LEFT_MARGIN_DOTS', String(leftDots));
    localStorage.setItem('PRINT_RIGHT_MARGIN_DOTS', String(rightDots));
  };

  // ---------- Windows helper ----------
  const [listUrl, setListUrl] = useState(localStorage.getItem('PRINT_WIN_LIST_URL') || 'http://127.0.0.1:3333/printers');
  const [postUrl, setPostUrl] = useState(localStorage.getItem('PRINT_WIN_URL') || 'http://127.0.0.1:3333/printRaw');
  const [printers, setPrinters] = useState([]);

  // NEW: multi printer arrays
  const [billPrinters, setBillPrinters] = useState(() =>
    uniq(readJson('PRINT_WIN_PRINTER_NAMES_BILL', []))
  );
  const [kotPrinters, setKotPrinters] = useState(() =>
    uniq(readJson('PRINT_WIN_PRINTER_NAMES_KOT', []))
  );

  // Keep old single values for display fallback (optional)
  const billSingleFallback = localStorage.getItem('PRINT_WIN_PRINTER_NAME') || '';
  const kotSingleFallback = localStorage.getItem('PRINT_WIN_PRINTER_NAME_KOT') || '';

  // ---------- KOT routing ----------
  const [routingEnabled, setRoutingEnabled] = useState(
    () => localStorage.getItem('PRINT_KOT_CATEGORY_ROUTING') === '1'
  );

  const [routes, setRoutes] = useState(() => {
    const raw = readJson('PRINT_KOT_ROUTES_V1', []);
    if (!Array.isArray(raw)) return [];
    return raw.map(r => ({
      id: r?.id || uid(),
      label: r?.label || 'Route',
      enabled: r?.enabled !== false,
      printerNames: uniq(r?.printerNames || []),
      categories: uniq(r?.categories || []),
    }));
  });

  const [categories, setCategories] = useState([]);
  const [msg, setMsg] = useState('');
  const WIN_HELPER_URL = '/desktop/Windows/CafeQR-PrintHub-Win.zip';

  const canEditRouting = routingEnabled; // simple switch; you can relax this later

  // ---------- helpers ----------
  function updateMultiSelect(e, setter) {
    const next = Array.from(e.target.selectedOptions).map(o => o.value);
    setter(uniq(next));
  }

  const allPrintersForRouting = useMemo(() => {
    // You can allow any installed printer; not just kotPrinters.
    return printers;
  }, [printers]);

  // ---------- load printers ----------
  const detectPrinters = async () => {
    try {
      const r = await fetch(listUrl);
      const names = await r.json();
      const arr = Array.isArray(names) ? names : [];
      setPrinters(arr);

      // If nothing picked yet, seed something sensible
      if (!billPrinters.length) {
        const seed = billSingleFallback ? [billSingleFallback] : (arr[0] ? [arr[0]] : []);
        if (seed.length) setBillPrinters(seed);
      }
      if (!kotPrinters.length) {
        const seed = kotSingleFallback ? [kotSingleFallback] : [];
        if (seed.length) setKotPrinters(seed);
      }

      setMsg(`Found ${arr.length} printers`);
    } catch {
      setMsg('Cannot reach the local Print Hub. Start the helper on this Windows machine and try again.');
    }
  };

  // ---------- load categories (from menu_items.category) ----------
const loadCategories = async () => {
  if (!restaurantId) return;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('categories')
      .select('name')
      .or(`is_global.eq.true,restaurant_id.eq.${restaurantId}`)
      .order('name');

    if (error) throw error;

    const cats = uniq((data || []).map(r => r?.name));
    setCategories(cats);
  } catch {
    setCategories([]);
  }
};

  // ---------- mode switching helpers ----------
  async function selectBluetoothSerial() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (!nav || !('serial' in nav)) {
        setMsg('✗ Web Serial not supported in this browser');
        return;
      }
      // @ts-ignore
      await nav.serial.requestPort({});

      localStorage.setItem('PRINTER_MODE', 'bt-serial');
      localStorage.setItem('PRINTER_READY', '1');
      persistPaperSettings();

      // clear winspool config when switching
      localStorage.removeItem('PRINT_WIN_URL');
      localStorage.removeItem('PRINT_WIN_LIST_URL');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAME_KOT');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_BILL');
      localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_KOT');

      setMsg('✓ Bluetooth/Serial saved for silent printing');
    } catch {
      setMsg('✗ Selection cancelled');
    }
  }

  async function selectUsbWebUSB() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && 'usb' in nav) {
        // @ts-ignore
        await nav.usb.requestDevice({ filters: [] });

        localStorage.setItem('PRINTER_MODE', 'webusb');
        localStorage.setItem('PRINTER_READY', '1');
        persistPaperSettings();

        // clear winspool config when switching
        localStorage.removeItem('PRINT_WIN_URL');
        localStorage.removeItem('PRINT_WIN_LIST_URL');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAME_KOT');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_BILL');
        localStorage.removeItem('PRINT_WIN_PRINTER_NAMES_KOT');

        setMsg('✓ USB printer saved for silent printing');
        return;
      }
      setMsg('✗ WebUSB not supported in this browser');
    } catch {
      setMsg('✗ Selection cancelled');
    }
  }

  const forgetBtPrinter = () => {
    localStorage.removeItem('BT_PRINTER_ADDR');
    localStorage.removeItem('BT_PRINTER_NAME_HINT');
    localStorage.removeItem('BT_PRINTER_ADDR_KOT');
    localStorage.removeItem('BT_PRINTER_NAME_HINT_KOT');

    // Optional (if you implement multi BT arrays):
    localStorage.removeItem('BT_PRINTER_ADDRS_BILL');
    localStorage.removeItem('BT_PRINTER_ADDRS_KOT');

    setMsg('Saved Bluetooth printers cleared. Next Android bill/KOT print will ask you to select again.');
  };

  // ---------- SAVE ----------
  const saveWired = () => {
    const bill = uniq(billPrinters);
    const kot = uniq(kotPrinters);

    localStorage.setItem('PRINT_WIN_LIST_URL', listUrl.trim());
    localStorage.setItem('PRINT_WIN_URL', postUrl.trim());
    localStorage.setItem('PRINTER_MODE', 'winspool');
    localStorage.setItem('PRINTER_READY', '1');
    localStorage.setItem('PRINT_WIN_AUTOCUT', autoCut ? '1' : '0');

    persistPaperSettings();

    // NEW multi keys
    writeJson('PRINT_WIN_PRINTER_NAMES_BILL', bill);
    writeJson('PRINT_WIN_PRINTER_NAMES_KOT', kot);

    // Backward compatible single keys (first item)
    localStorage.setItem('PRINT_WIN_PRINTER_NAME', bill[0] || '');
    localStorage.setItem('PRINT_WIN_PRINTER_NAME_KOT', kot[0] || '');

    // routing
    localStorage.setItem('PRINT_KOT_CATEGORY_ROUTING', routingEnabled ? '1' : '0');
    writeJson('PRINT_KOT_ROUTES_V1', routes);

    setMsg(bill.length ? `Saved ${bill.length} bill printer(s) and ${kot.length} KOT printer(s).` : 'Pick at least one bill printer first.');
  };

  // ---------- tests ----------
  const testBillPrinter = async () => {
    try {
      const ruler48 = '|' + '-'.repeat(46) + '|';
      const txt =
        '*** TEST BILL PRINTER (MULTI) ***\n' +
        ruler48 + '\n' +
        '123456789012345678901234567890123456789012345678\n';

      const res = await printUniversal({
        text: txt,
        allowPrompt: true,
        allowSystemDialog: false,
        jobKind: 'bill',
        winPrinterNames: billPrinters, // NEW: print to all selected bill printers
      });

      setMsg(`✓ Bill test via ${res?.via || 'unknown'}`);
    } catch (e) {
      setMsg(`✗ Bill test failed: ${e?.message || String(e)}`);
    }
  };

  const testKotPrinter = async () => {
    try {
      const res = await printUniversal({
        text: '*** TEST KOT PRINTER (MULTI) ***\nKitchen Ticket\n',
        allowPrompt: true,
        allowSystemDialog: false,
        jobKind: 'kot',
        winPrinterNames: kotPrinters, // NEW: print to all selected KOT printers
      });
      setMsg(`✓ KOT test via ${res?.via || 'unknown'}`);
    } catch (e) {
      setMsg(`✗ KOT test failed: ${e?.message || String(e)}`);
    }
  };

  // ---------- routing editor actions ----------
  const addRoute = () => {
    setRoutes(prev => [
      ...prev,
      { id: uid(), label: 'New Route', enabled: true, printerNames: [], categories: [] },
    ]);
  };

  const updateRoute = (id, patch) => {
    setRoutes(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const deleteRoute = (id) => {
    setRoutes(prev => prev.filter(r => r.id !== id));
  };

  // ---------- effects ----------
  useEffect(() => {
    detectPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // ---------- UI ----------
  return (
    <div className="card" style={{ maxWidth: 900, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
      <h3 style={{ marginTop: 0 }}>Printers & Hardware</h3>

      {/* Windows section */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ margin: 0 }}>Windows (Chrome / PWA)</h4>

        <div style={{ borderRadius: 6, border: '1px solid #e5e7eb', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Wired (USB / Windows helper)</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input value={listUrl} onChange={e => setListUrl(e.target.value)} style={{ flex: 1, minWidth: 260, padding: 6, fontSize: 13 }} />
            <button onClick={detectPrinters} style={{ padding: '6px 10px', fontSize: 13 }}>Load printers</button>
          </div>

          {/* Multi Bill printers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Bill printers (multi)</label>
            <select
              multiple
              value={billPrinters}
              onChange={e => updateMultiSelect(e, setBillPrinters)}
              size={Math.min(6, Math.max(3, printers.length))}
              style={{ width: '100%', minHeight: 90, padding: 6, fontSize: 13 }}
            >
              {printers.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Hold Ctrl (Windows) to select multiple.</div>
          </div>

          {/* Multi KOT printers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>KOT printers (multi)</label>
            <select
              multiple
              value={kotPrinters}
              onChange={e => updateMultiSelect(e, setKotPrinters)}
              size={Math.min(6, Math.max(3, printers.length))}
              style={{ width: '100%', minHeight: 90, padding: 6, fontSize: 13 }}
            >
              {printers.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input value={postUrl} onChange={e => setPostUrl(e.target.value)} style={{ flex: 1, minWidth: 260, padding: 6, fontSize: 13 }} />
            <button onClick={selectUsbWebUSB} style={{ padding: '6px 10px', fontSize: 13 }}>Select USB (WebUSB)</button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={autoCut} onChange={e => setAutoCut(e.target.checked)} />
            Enable auto‑cut (ESC/POS)
          </label>

          {/* Paper */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span>Paper width:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={paperMm === '58'} onChange={() => { setPaperMm('58'); setCols('32'); }} />
              58mm (32 cols)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={paperMm === '80' && cols === '48'} onChange={() => { setPaperMm('80'); setCols('48'); }} />
              80mm (48 cols)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={paperMm === '80' && cols === '42'} onChange={() => { setPaperMm('80'); setCols('42'); }} />
              80mm (42 cols)
            </label>
          </div>

          {/* Margins */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span>Side margins (dots):</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Left
              <input
                value={leftDots}
                onChange={(e) => setLeftDots(e.target.value.replace(/[^\d]/g, ''))}
                style={{ width: 80, padding: 6, fontSize: 13 }}
                inputMode="numeric"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Right
              <input
                value={rightDots}
                onChange={(e) => setRightDots(e.target.value.replace(/[^\d]/g, ''))}
                style={{ width: 80, padding: 6, fontSize: 13 }}
                inputMode="numeric"
              />
            </label>
            <button
              onClick={() => {
                if (paperMm === '80') { setLeftDots('12'); setRightDots('12'); }
                else { setLeftDots('8'); setRightDots('8'); }
                setMsg('Margin dots preset applied. Click Save to persist.');
              }}
              style={{ padding: '6px 10px', fontSize: 13 }}
            >
              Preset
            </button>
          </div>

          <a href={WIN_HELPER_URL} download="CafeQR-PrintHub-Win.zip" className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13 }}>
            Download CafeQR Print Hub (Windows)
          </a>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={saveWired} style={{ padding: '6px 10px', fontSize: 13 }}>Save</button>
            <button onClick={testBillPrinter} style={{ padding: '6px 10px', fontSize: 13 }}>Test bill printers</button>
            <button onClick={testKotPrinter} style={{ padding: '6px 10px', fontSize: 13 }}>Test KOT printers</button>
          </div>
        </div>

        {/* Bluetooth serial */}
        <div style={{ borderRadius: 6, border: '1px solid #e5e7eb', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Wireless (Bluetooth serial)</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            If your printer appears as a Bluetooth COM port on Windows, grant this site access once using Web Serial.
          </p>
          <button onClick={selectBluetoothSerial} style={{ padding: '6px 10px', fontSize: 13, width: 'fit-content' }}>
            Select Bluetooth (Serial)
          </button>
        </div>
      </div>

      {/* KOT routing */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h4 style={{ margin: 0 }}>KOT category routing</h4>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={routingEnabled}
            onChange={(e) => setRoutingEnabled(e.target.checked)}
          />
          Enable category-wise KOT printing (routes)
        </label>

        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Categories are read from <code>menu_items.category</code>. If routing is OFF, normal single KOT prints. If routing is ON, KOT is split per route and sent to the selected printer(s).  
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={addRoute} disabled={!canEditRouting} style={{ padding: '6px 10px', fontSize: 13 }}>
            Add route
          </button>
          <button
            onClick={() => {
              // quick safe save of routing only
              localStorage.setItem('PRINT_KOT_CATEGORY_ROUTING', routingEnabled ? '1' : '0');
              writeJson('PRINT_KOT_ROUTES_V1', routes);
              setMsg('✓ Routing saved');
            }}
            style={{ padding: '6px 10px', fontSize: 13 }}
          >
            Save routing
          </button>
        </div>

        {routes.map((r) => (
          <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={!canEditRouting}
                  onChange={(e) => updateRoute(r.id, { enabled: e.target.checked })}
                />
                Enabled
              </label>

              <input
                value={r.label}
                disabled={!canEditRouting}
                onChange={(e) => updateRoute(r.id, { label: e.target.value })}
                style={{ flex: 1, minWidth: 220, padding: 6, fontSize: 13 }}
                placeholder="Route name (e.g., Juice/Chai)"
              />

              <button
                onClick={() => deleteRoute(r.id)}
                disabled={!canEditRouting}
                style={{ padding: '6px 10px', fontSize: 13 }}
              >
                Delete
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Route printers</div>
                <select
                  multiple
                  disabled={!canEditRouting}
                  value={r.printerNames}
                  onChange={(e) => {
                    const next = uniq(Array.from(e.target.selectedOptions).map(o => o.value));
                    updateRoute(r.id, { printerNames: next });
                  }}
                  size={Math.min(6, Math.max(3, allPrintersForRouting.length))}
                  style={{ width: '100%', minHeight: 90, padding: 6, fontSize: 13 }}
                >
                  {allPrintersForRouting.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Categories</div>
                <select
                  multiple
                  disabled={!canEditRouting}
                  value={r.categories}
                  onChange={(e) => {
                    const next = uniq(Array.from(e.target.selectedOptions).map(o => o.value));
                    updateRoute(r.id, { categories: next });
                  }}
                  size={Math.min(6, Math.max(3, categories.length || 3))}
                  style={{ width: '100%', minHeight: 90, padding: 6, fontSize: 13 }}
                >
                  {(categories.length ? categories : ['main']).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Make sure category spelling matches exactly what you saved on menu items.
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Android section */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ margin: 0 }}>Android (App / PWA)</h4>

        <div style={{ borderRadius: 6, border: '1px solid #e5e7eb', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Android browser / PWA</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            On Android Chrome / PWA, Cafe QR can forward receipts to Thermer or RawBT for Bluetooth printing.
          </p>
          <button
            onClick={() => {
              localStorage.setItem('PRINTER_MODE', 'bt-android');
              localStorage.setItem('PRINTER_READY', '1');
              setMsg('✓ Android app link enabled (Thermer / RawBT)');
            }}
            style={{ padding: '6px 10px', fontSize: 13, width: 'fit-content' }}
          >
            Use Android app (Thermer/RawBT)
          </button>
        </div>

        <div style={{ borderRadius: 6, border: '1px solid #e5e7eb', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Android Cafe QR app</div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Use “Forget Bluetooth printers” to force re-pairing for Bill/KOT printers.
          </p>
          <button onClick={forgetBtPrinter} style={{ padding: '6px 10px', fontSize: 13, width: 'fit-content' }}>
            Forget Bluetooth printers
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ marginTop: 12, fontSize: 13, color: msg.startsWith('✗') ? '#b91c1c' : '#166534' }}>
          {msg}
        </div>
      )}
    </div>
  );
}
