//pages/api/send-qr-email.js

import path from 'path';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { getSupabase } from '../../services/supabase';

registerFont(path.join(process.cwd(), 'public/fonts/NotoSans-Bold.ttf'), {
  family: 'NotoSans',
  weight: 'bold',
});
registerFont(path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf'), {
  family: 'NotoSans',
  weight: 'normal',
});

export default async function handler(req, res) {
  try {
    const { qrCodes = [], restaurantData: passedRestaurantData, isIncremental = false, restaurantId } = req.body;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    
    if (!smtpUser || !smtpPass) {
      return res.status(500).json({ error: 'SMTP credentials not configured' });
    }

    if (!qrCodes.length) {
      return res.status(400).json({ error: 'No QR codes provided' });
    }

    const supabase = getSupabase();
    let restaurant = passedRestaurantData;

    // Robustness: If restaurant data not passed, try to fetch it
    if (!restaurant && restaurantId) {
      const { data: profile, error: profileError } = await supabase
        .from('restaurant_profiles')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .single();

      if (profileError || !profile) {
        const { data: baseRest, error: baseError } = await supabase
          .from('restaurants')
          .select('restaurant_name, owner_email')
          .eq('id', restaurantId)
          .single();
        
        if (baseError || !baseRest) {
          console.error('Restaurant not found in bulk API:', restaurantId);
          return res.status(404).json({ error: 'Restaurant details not found' });
        }

        restaurant = {
          restaurantName: baseRest.restaurant_name,
          email: baseRest.owner_email
        };
      } else {
        restaurant = {
          restaurantName: profile.name,
          email: profile.owner_email || profile.email,
          recipientName: profile.legal_name,
          recipientPhone: profile.phone,
          address: [
            profile.shipping_address_line1,
            profile.shipping_address_line2,
            profile.shipping_city,
            profile.shipping_state,
            profile.shipping_pincode
          ].filter(Boolean).join(', ')
        };
      }
    }

    if (!restaurant?.email) {
      return res.status(400).json({ error: 'Recipient email not found or missing' });
    }

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
        ctx.font = 'bold 100px NotoSans';
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

        // "Scan me to order" text below
        ctx.font = 'bold 70px NotoSans';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const textY = qrY + QR_SIZE - 30;
        ctx.fillText('Scan me to order', WIDTH / 2, textY);

        return {
          filename: `qr-${qr.tableNumber}.png`,
          content: canvas.toBuffer('image/png'),
          cid: `qr${idx}@restaurant`,
        };
      })
    );

    // Determine email subject and message based on increment flag
    const emailSubject = isIncremental
      ? `Additional QR Codes for ${restaurant.restaurantName}`
      : `New QR Codes for ${restaurant.restaurantName}`;

    const messageHeader = isIncremental
      ? `<p style="color:#ea580c; font-weight:bold;font-size:16px;">📌 Additional QR Codes – New Tables Added</p>`
      : `<h2 style="color:#ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 10px;">New QR Codes – Batch Created</h2>`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px;">
        ${messageHeader}
        <p>${isIncremental 
          ? `You've added <strong>${qrCodes.length} new table(s)</strong> to your restaurant. Print and place these QR codes on the new tables.`
          : `We've generated <strong>${qrCodes.length} initial QR codes</strong> for your restaurant. Print each one and place them on your tables.`}</p>
        
        <div style="background:white;padding:16px;border-radius:8px;border-left:4px solid #ea580c;margin:20px 0;">
          <h3 style="margin:0 0 12px 0;color:#333;font-size:16px;">📍 Delivery Details</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0;font-weight:600;color:#666;width:140px;">Recipient:</td>
              <td style="padding:6px 0;color:#333;">${restaurant.recipientName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:600;color:#666;">Contact:</td>
              <td style="padding:6px 0;color:#333;">${restaurant.recipientPhone || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:600;color:#666;vertical-align:top;">Address:</td>
              <td style="padding:6px 0;color:#333;">${restaurant.address || 'N/A'}</td>
            </tr>
          </table>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px;margin-top:24px;">
          ${attachments.map(att => `
            <div style="text-align:center;border:1px solid #ddd;border-radius:10px;box-shadow:0 0 5px #eee;padding:16px;background:white;">
              <img src="cid:${att.cid}" style="width:100%;max-width:240px;display:block;margin:0 auto;" />
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top:24px;padding:12px;background:#fff5eb;border-left:4px solid #ea580c;color:#333;">
          <strong>⏱️ Action Required:</strong> Print these QR codes and place them on your restaurant tables as soon as possible.
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
      to: restaurant.email,
      subject: emailSubject,
      html,
      attachments,
    });

    return res.status(200).json({ 
      success: true, 
      message: `${isIncremental ? 'Additional' : 'Initial'} QR codes email sent successfully`
    });
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}
