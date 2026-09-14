const dotenv = require('dotenv');
dotenv.config();

const requiredEnv = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length) {
  throw new Error(`Faltan variables de entorno: ${missingEnv.join(', ')}`);
}

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};
