// utils/escpos.ts
export function textToEscPos(
  text: string,
  opts?: { codepage?: number; feed?: number; cut?: 'full' | 'partial' }
) {
  const enc = new TextEncoder();
  const ESC = 0x1b, GS = 0x1d;
  const bytes: number[] = [];

  // Initialize
  bytes.push(ESC, 0x40); // ESC @

  // Select code page (ESC t n)
  const cp = (opts?.codepage ?? 0) & 0xff;
  bytes.push(ESC, 0x74, cp);

  // Normalize to CR+LF which some printers prefer
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
