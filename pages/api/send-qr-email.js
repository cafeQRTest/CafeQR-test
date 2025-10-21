// pages/api/send-qr-email.js

import path from 'path'; 
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { createCanvas, loadImage, registerFont } from 'canvas';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { qrCodes = [], restaurantData = {}, isIncremental = false } = req.body;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    return res.status(500).json({ error: 'SMTP credentials not configured' });
  }

  // register the bundled font
  registerFont(path.join(process.cwd(), 'fonts/Roboto-Bold.ttf'), {
    family: 'Roboto',
    weight: 'bold',
  });

  const WIDTH = 1200;
  const HEIGHT = 900;
  const QR_SIZE = 650;
  const MARGIN = 40;

  const attachments = await Promise.all(
    qrCodes.map(async (qr, idx) => {
      const canvas = createCanvas(WIDTH, HEIGHT);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Table number text
      ctx.font = 'bold 100px Roboto';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(qr.tableNumber, WIDTH / 2, MARGIN);

      // Generate and draw QR
      const qrDataUrl = await QRCode.toDataURL(qr.qrUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: QR_SIZE,
        color: { dark: '#000', light: '#fff' },
      });
      const qrImg = await loadImage(qrDataUrl);
      const qrY = 180;
      ctx.drawImage(qrImg, (WIDTH - QR_SIZE) / 2, qrY, QR_SIZE, QR_SIZE);

      // “Scan me to order” text below
      ctx.font = 'bold 70px Roboto';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const textY = qrY + QR_SIZE + 20;
      ctx.fillText('Scan me to order', WIDTH / 2, textY);

      return {
        filename: `qr-${qr.tableNumber}.png`,
        content: canvas.toBuffer('image/png'),
        cid: `qr${idx}@restaurant`,
      };
    })
  );

  // HTML without duplicate text
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <h1>${isIncremental ? 'Additional' : 'New'} QR Codes – ${restaurantData.restaurantName || ''}</h1>
      <p>Print each QR and deliver to the address below.</p>
      <p><strong>Delivery Address:</strong> ${restaurantData.address || ''}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:24px;">
        ${attachments.map(att => `
          <div style="text-align:center;border:1px solid #eee;border-radius:10px;box-shadow:0 0 5px #eee;padding:16px;">
            <img src="cid:${att.cid}" style="width:100%;max-width:340px;display:block;margin:0 auto;" />
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: smtpUser,
    to: 'pnriyas49@gmail.com',
    subject: isIncremental
      ? `Additional QR Codes for ${restaurantData.restaurantName}`
      : `QR Codes for ${restaurantData.restaurantName}`,
    html,
    attachments,
  });

  return res.status(200).json({ success: true });
}
