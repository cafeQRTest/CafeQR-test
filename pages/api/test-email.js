// pages/api/test-email.js
import { sendSubscriptionEmail } from '../../services/mailer';

export default async function handler(req, res) {
  try {
    console.log('[test-email] Starting email test...');
    console.log('[test-email] SMTP Config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      from: process.env.MAIL_FROM || process.env.SMTP_FROM
    });

    await sendSubscriptionEmail({
      to: 'pnriyas50@gmail.com',
      subject: 'Test Email from CafeQR',
      html: '<h1>Hello!</h1><p>This is a test email. If you see this, emails are working!</p>'
    });

    console.log('[test-email] Email sent successfully!');
    return res.status(200).json({ 
      success: true,
      message: 'Email sent! Check your inbox (and spam folder).' 
    });

  } catch (error) {
    console.error('[test-email] ERROR:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.toString()
    });
  }
}
