const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

process.env.STRIPE_SECRET_KEY ||= 'sk_test_contact_tests';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_contact_tests';
process.env.FRONTEND_URLS = 'http://localhost:5173';
process.env.SMTP_HOST ||= 'smtp.example.test';
process.env.SMTP_PORT ||= '587';
process.env.SMTP_USER ||= 'smtp-user@example.test';
process.env.SMTP_PASS ||= 'test-smtp-password';
process.env.SMTP_FROM ||= 'sumando-vidas@example.test';

const app = require('../src/index');
const contactService = require('../src/services/contactService');
const nodemailer = require('nodemailer');
const sendContactMessage = contactService.sendContactMessage;

const validMessage = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  reason: 'volunteer',
  message: 'Quiero colaborar.',
};

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  contactService.sendContactMessage = async () => {};
});

async function postContact(body, headers = { 'content-type': 'application/json' }) {
  return fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('accepts valid contact data and returns the success message after delivery', async () => {
  let deliveredMessage;
  contactService.sendContactMessage = async (message) => {
    deliveredMessage = message;
  };

  const response = await postContact(validMessage);

  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /enviado correctamente/);
  assert.deepEqual(deliveredMessage, validMessage);
});

test('sends contact details to the association and uses the sender only as Reply-To', async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let transportOptions;
  let mailOptions;
  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return {
      sendMail: async (options) => {
        mailOptions = options;
      },
    };
  };

  try {
    await sendContactMessage(validMessage);
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }

  assert.equal(transportOptions.host, 'smtp.example.test');
  assert.equal(transportOptions.secure, false);
  assert.equal(mailOptions.to, 'associacionsumandovida@gmail.com');
  assert.equal(mailOptions.from, 'sumando-vidas@example.test');
  assert.deepEqual(mailOptions.replyTo, { name: 'Ada Lovelace', address: 'ada@example.com' });
  assert.notEqual(mailOptions.from, validMessage.email);
  assert.match(mailOptions.subject, /volunteer/);
  assert.match(mailOptions.text, /Ada Lovelace/);
  assert.match(mailOptions.text, /Quiero colaborar\./);
});

test('allows the local Vite origin through CORS', async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
    },
  });

  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('rejects missing required fields with a JSON 400 error', async () => {
  const { name, ...missingName } = validMessage;
  const response = await postContact(missingName);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'El campo "name" es obligatorio.' });
});

test('rejects invalid email addresses', async () => {
  const response = await postContact({ ...validMessage, email: 'not-an-email' });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /email/);
});

test('rejects unsupported contact reasons', async () => {
  const response = await postContact({ ...validMessage, reason: 'other' });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /general, volunteer, company, project, press/);
});

test('returns a JSON 500 error when email delivery fails', async () => {
  contactService.sendContactMessage = async () => {
    const error = new Error('Provider unavailable');
    error.code = 'ECONNECTION';
    throw error;
  };

  const response = await postContact(validMessage);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'No se pudo enviar el mensaje. Inténtalo de nuevo más tarde.',
  });
});

test('returns a JSON 400 error for malformed JSON', async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'El cuerpo de la solicitud debe ser JSON válido.',
  });
});

test('starts the application without Stripe credentials', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/index')"], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
    },
  });

  assert.equal(result.status, 0, result.stderr);
});

test('returns 503 for payment endpoints while Stripe is unconfigured', async () => {
  const config = require('../src/config');
  const previousStatus = config.stripeConfigured;
  config.stripeConfigured = false;

  try {
    const checkoutResponse = await fetch(`${baseUrl}/api/payments/create-checkout-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const webhookResponse = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    assert.equal(checkoutResponse.status, 503);
    assert.deepEqual(await checkoutResponse.json(), {
      error: 'Los pagos están temporalmente desactivados.',
    });
    assert.equal(webhookResponse.status, 503);
    assert.deepEqual(await webhookResponse.json(), {
      error: 'El servicio de pagos está temporalmente desactivado.',
    });
  } finally {
    config.stripeConfigured = previousStatus;
  }
});