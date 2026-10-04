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
  nodeEnv: process.env.NODE_ENV || 'development',
  fakeMoneyEnabled: process.env.FAKE_MONEY_ENABLED === 'true' && process.env.NODE_ENV !== 'production',
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM,
};
