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
  const enc = new TextEncoder();
  const ESC = 0x1b, GS = 0x1d;
  const bytes: number[] = [];

  // Initialize
  bytes.push(ESC, 0x40); // ESC @  → reset printer

  // Select code page (ESC t n)
  const cp = (opts?.codepage ?? 0) & 0xff;
  bytes.push(ESC, 0x74, cp);

  // Character size (GS ! n)
  // 0x00 = normal, 0x01 = double height only (same columns, taller text)
  const sizeByte = opts?.scale === 'large' ? 0x01 : 0x00;
  bytes.push(GS, 0x21, sizeByte);

  // Normalize to CR+LF
  const normalized = text.replace(/\r?\n/g, '\r\n');
  enc.encode(normalized).forEach(b => bytes.push(b));

  // Extra feed
  const feed = Math.max(0, Math.min(10, opts?.feed ?? 4));
  for (let i = 0; i < feed; i++) bytes.push(0x0a);

  // Cut
  if (opts?.cut === 'partial') bytes.push(GS, 0x56, 0x01);
  else bytes.push(GS, 0x56, 0x00);

  return new Uint8Array(bytes);
}
