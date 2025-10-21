// pages/api/send-qr-email.js

import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { createCanvas, loadImage, registerFont } from 'canvas';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { qrCodes = [], restaurantData = {}, isIncremental = false } = req.body;

  try {
    const smtpUser = process.env.SMTP_USER;
    const hasPass = !!process.env.SMTP_PASS;

    if (!smtpUser || !hasPass) {
      return res.status(500).json({ error: 'SMTP credentials not configured' });
    }

    // --- Canvas constants for 4x3 inch at 300 DPI: 1200x900 ---
    const WIDTH = 1200;
    const HEIGHT = 900;
    const QR_SIZE = 650;
    const MARGIN = 40;

    // registerFont('/yourpath/Roboto-Bold.ttf', { family: 'Roboto' }); // optional custom font

    const attachments = await Promise.all(
      qrCodes.map(async (qr, idx) => {
        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');

        // white background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Table number text (top center)
        ctx.font = 'bold 90px Arial'; // or 'bold 90px Roboto'
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(
          qr.tableNumber || `Table ${idx + 1}`,
          WIDTH / 2,
          MARGIN,
        );

        // QR code generation (as Data URL, then placed at center)
        const qrDataUrl = await QRCode.toDataURL(qr.qrUrl, {
          errorCorrectionLevel: 'H',
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          width: QR_SIZE,
        });

        const qrImg = await loadImage(qrDataUrl);
        ctx.drawImage(
          qrImg,
          (WIDTH - QR_SIZE) / 2,
          180,
          QR_SIZE,
          QR_SIZE,
        );

        // "Scan me to order" text (bottom center)
        ctx.font = 'bold 60px Arial';
        ctx.fillStyle = '#1976d2';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Scan me to order', WIDTH / 2, HEIGHT - MARGIN);

        // Export to PNG buffer
        const pngBuffer = canvas.toBuffer('image/png');

        return {
          filename: `qr-${qr.tableNumber || idx + 1}.png`,
          content: pngBuffer,
          cid: `qr${idx}@restaurant`,
        };
      })
    );

    // --- Email transporter (same as your code) ---
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: process.env.SMTP_PASS,
      },
    });

    const subject = isIncremental
      ? `Additional QR Codes for ${restaurantData.restaurantName}`
      : `QR Codes for ${restaurantData.restaurantName}`;

    // HTML - just as before, using the attachments CIDs
    const html = `
      <div style="font-family: Arial, sans-serif; max-width:800px; margin:0 auto;">
        <h1>${isIncremental ? 'Additional' : 'New'} QR Codes – ${restaurantData.restaurantName || ''}</h1>
        <div>Print each QR and deliver to the address below.</div>
        <div style="margin: 16px 0">
          <b>Delivery Address:</b> ${restaurantData.address || ''}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(350px,1fr)); gap:24px;">
          ${attachments.map((att, idx) => `
            <div style="text-align:center; border:1px solid #eee; border-radius:10px; box-shadow:0 0 5px #eee;">
              <img src="cid:${att.cid}" style="width:340px; max-width:100%; margin:0 auto; display:block;" />
              <div style="font-size:20px; margin-top:10px; color:#222;">${qrCodes[idx]?.tableNumber || ''}</div>
              <div style="font-size:16px; color:#1976d2; margin:6px 0 10px;">Scan me to order</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: smtpUser,
      to: 'pnriyas49@gmail.com',
      subject,
      html,
      attachments,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('ERROR in send-qr-email:', err); // Add this line
    return res.status(500).json({ error: err.message || 'Failed to send email' });

  }
}
