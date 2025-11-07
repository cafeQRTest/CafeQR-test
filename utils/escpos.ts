// utils/escpos.ts
export function textToEscPos(text: string, opts?: { codepage?: number; feed?: number; cut?: 'full'|'partial' }) {
  const enc = new TextEncoder();                 // UTF-8 to bytes
  const ESC = 0x1B, GS = 0x1D;
  const bytes: number[] = [];
  // Initialize
  bytes.push(ESC, 0x40);                          // ESC @
  // Select code page if needed (ESC t n) default 0
  const cp = (opts?.codepage ?? 0) & 0xFF;
  bytes.push(ESC, 0x74, cp);
  // Append payload + LF
  enc.encode(text.replace(/\r?\n/g, '\n')).forEach(b => bytes.push(b));
  // Feed
  const feed = Math.max(0, Math.min(10, opts?.feed ?? 4));
  for (let i = 0; i < feed; i++) bytes.push(0x0A); // LF
  // Cut
  if (opts?.cut === 'partial') bytes.push(GS, 0x56, 0x01);
  else bytes.push(GS, 0x56, 0x00);                // GS V 0 (full cut)
  return new Uint8Array(bytes);
}
