// pages/api/tables/send-qr-email.js
// API endpoint to send QR code email for a table

import path from 'path';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { getSupabase } from '../../../services/supabase';

// Register fonts just like in the bulk sender
try {
  registerFont(path.join(process.cwd(), 'public/fonts/NotoSans-Bold.ttf'), {
    family: 'NotoSans',
    weight: 'bold',
  });
  registerFont(path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf'), {
    family: 'NotoSans',
    weight: 'normal',
  });
} catch (fontError) {
  console.error('Error registering fonts:', fontError);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tableId, identifier, qrUrl, restaurantId, restaurantData: passedRestaurantData } = req.body;

    if (!tableId || !identifier || !qrUrl || !restaurantId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = getSupabase();
    let restaurant = passedRestaurantData;

    // If data not passed from frontend, query the database
    if (!restaurant) {
      const { data: profile, error: profileError } = await supabase
        .from('restaurant_profiles')
        .select('name, email, owner_email, legal_name, phone, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_pincode')
        .eq('restaurant_id', restaurantId)
        .single();

      if (profileError || !profile) {
        // Fallback to restaurants table for absolute basic info
        const { data: baseRest, error: baseError } = await supabase
          .from('restaurants')
          .select('restaurant_name, owner_email')
          .eq('id', restaurantId)
          .single();
        
        if (baseError || !baseRest) {
          console.error('Restaurant not found in DB:', restaurantId, profileError, baseError);
          return res.status(404).json({ error: 'Restaurant not found' });
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

    const emailTo = restaurant.email;
    
    if (!emailTo) {
      return res.status(400).json({ error: 'Restaurant email not configured' });
    }

    // SMTP credentials
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      return res.status(500).json({ error: 'SMTP credentials not configured' });
    }

    // Construct full QR URL with proper format: /order?r=restaurantId&t=tableNumber
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''); // Remove trailing slash
    const fullQrPageUrl = `${baseUrl}/order?r=${restaurantId}&t=${identifier}`;

    // Create Canvas for the QR code image (matching bulk sender's logic)
    const WIDTH = 1200;
    const HEIGHT = 900;
    const QR_SIZE = 650;
    const MARGIN = 40;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Table number text
    ctx.font = 'bold 100px NotoSans';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(identifier, WIDTH / 2, MARGIN);

    // Generate and draw QR
    const qrDataUrl = await QRCode.toDataURL(fullQrPageUrl, {
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

    // Prepare transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:8px;">
        <h2 style="color:#ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 10px;">QR Code for Table ${identifier}</h2>
        <p>You've successfully set up a new table at <strong>${restaurant.restaurantName}</strong>. Attached is the QR code for this table.</p>
        
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
            <tr>
              <td style="padding:6px 0;font-weight:600;color:#666;">Table:</td>
              <td style="padding:6px 0;color:#333;"><strong>${identifier}</strong></td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-weight:600;color:#666;">QR URL:</td>
              <td style="padding:6px 0;color:#333;"><a href="${fullQrPageUrl}" style="color:#ea580c;">${fullQrPageUrl}</a></td>
            </tr>
          </table>
        </div>

        <div style="display:block; text-align:center; padding: 20px; background: white; border: 1px solid #ddd; border-radius: 10px;">
           <p style="margin-bottom: 10px; font-weight: bold; color: #444;">Preview:</p>
           <img src="cid:qr-code@restaurant" style="width:100%; max-width:400px; display:block; margin:0 auto;" />
        </div>
        
        <div style="margin-top:24px;padding:12px;background:#fff5eb;border-left:4px solid #ea580c;color:#333;">
          <strong>⏱️ Action Required:</strong> Print this QR code and place it on Table ${identifier} for your customers to scan and order.
        </div>
      </div>
    `;

    // Send email
    await transporter.sendMail({
      from: smtpUser,
      to: emailTo,
      subject: `QR Code for Table ${identifier} - ${restaurant.restaurantName}`,
      html,
      attachments: [{
        filename: `qr-${identifier}.png`,
        content: canvas.toBuffer('image/png'),
        cid: 'qr-code@restaurant',
      }],
    });

    return res.status(200).json({ 
      success: true,
      message: `QR code email sent to ${emailTo}`,
      qrUrl: fullQrPageUrl
    });

  } catch (error) {
    console.error('Error sending QR code email:', error);
    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
}
