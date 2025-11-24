// utils/escpos.ts
export function textToEscPos(
  text: string,
  opts?: {
    codepage?: number;
    feed?: number;
    cut?: 'full' | 'partial';
    scale?: 'normal' | 'large';
  }
) {
  const ESC = 0x1b;
  const GS  = 0x1d;
  const bytes: number[] = [];

  // 1) Initialize printer
  bytes.push(ESC, 0x40); // ESC @  → reset

  // 2) Select code page (ESC t n)
  const cp = (opts?.codepage ?? 0) & 0xff;
  bytes.push(ESC, 0x74, cp);

  // 3) Character size (GS ! n)
  const sizeByte = opts?.scale === 'large' ? 0x01 : 0x00; // 0x01 = double height
  bytes.push(GS, 0x21, sizeByte);

  // 4) Treat input as *binary string*: one JS char = one byte
  //    This is critical so ESC/POS bytes from buildLogoEscPos are not UTF‑8‑encoded.
  const normalized = text.replace(/\r?\n/g, '\r\n');
  for (let i = 0; i < normalized.length; i++) {
    bytes.push(normalized.charCodeAt(i) & 0xff);
  }

  // 5) Extra feed
  const feed = Math.max(0, Math.min(10, opts?.feed ?? 4));
  for (let i = 0; i < feed; i++) bytes.push(0x0a);

  // 6) Cut
  if (opts?.cut === 'partial') bytes.push(GS, 0x56, 0x01);
  else bytes.push(GS, 0x56, 0x00);

  return new Uint8Array(bytes);
}
