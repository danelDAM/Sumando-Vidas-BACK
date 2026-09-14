const stripeService = require('../services/stripeService');

exports.createCheckoutSession = async (req, res) => {
  try {
    const { line_items, success_url, cancel_url } = req.body;
    const session = await stripeService.createCheckoutSession({ line_items, success_url, cancel_url });
    res.json({ url: session.url });
  } catch (err) {
    console.error('createCheckoutSession error', err);
    res.status(500).json({ error: 'Error creating checkout session' });
  }
};

exports.webhook = async (req, res) => {
  // req.body is raw buffer (because index.js used express.raw for this route)
  const sig = req.headers['stripe-signature'];
  try {
    await stripeService.handleWebhook(req.body, sig);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};
