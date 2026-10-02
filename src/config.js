const dotenv = require('dotenv');
dotenv.config();

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [
  ...new Set(
    (process.env.FRONTEND_URLS || frontendUrl)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  ),
];

module.exports = {
  port: Number(process.env.PORT || 4242),
  frontendUrl,
  allowedOrigins,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
  stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM,
};
