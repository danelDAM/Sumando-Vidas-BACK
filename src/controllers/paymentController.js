const stripeService = require('../services/stripeService');
const config = require('../config');

exports.createCheckoutSession = async (req, res) => {
  if (!config.stripeConfigured) {
    res.status(503).json({ error: 'Los pagos están temporalmente desactivados.' });
    return;
  }

  try {
    const { line_items, success_url, cancel_url } = req.body || {};

    if (!Array.isArray(line_items) || line_items.length === 0) {
      return res.status(400).json({
        error: 'Falta el campo line_items con al menos un elemento.',
      });
    }

    const session = await stripeService.createCheckoutSession({ line_items, success_url, cancel_url });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('createCheckoutSession error', err);
    return res.status(500).json({ error: 'Error creating checkout session' });
  }
};

exports.webhook = async (req, res) => {
  // req.body is raw buffer (because index.js used express.raw for this route)
  if (!config.stripeConfigured) {
    res.status(503).json({ error: 'El servicio de pagos está temporalmente desactivado.' });
    return;
  }

  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).send('Missing stripe-signature header');
  }

  try {
    await stripeService.handleWebhook(req.body, sig);
    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook error', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
};
