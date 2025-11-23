// pages/api/testPrint.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { printUniversal } from '../../utils/printGateway';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const kind = (req.query.kind === 'kot' ? 'kot' : 'bill') as 'bill' | 'kot';

    await printUniversal({
      text:
        kind === 'kot'
          ? '*** TEST KOT PRINTER ***\nKitchen Ticket\n'
          : '*** TEST BILL PRINTER ***\nCafe‑QR\n\nOK\n',
      allowSystemDialog: false,
      allowPrompt: true,
      jobKind: kind
    });

    res.status(200).json({ ok: true, kind });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
