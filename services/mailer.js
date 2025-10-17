// services/mailer.js
import nodemailer from 'nodemailer';

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS.replace(/\s/g,''),  // strip spaces
    },
    family: 4  // ⚠️ force IPv4
  });
  return transporter;
}
export async function sendSubscriptionEmail(opts) {
  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM,
      ...opts
    });
    console.log('[mailer] Email sent to', opts.to);
  } catch (err) {
    console.error('[mailer] Failed to send email:', err);
  }
}
