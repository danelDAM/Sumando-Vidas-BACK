const Stripe = require('stripe');
const config = require('../config');

let stripe;

function getStripeClient() {
  if (!config.stripeConfigured) {
    const error = new Error('Stripe no está configurado.');
    error.code = 'STRIPE_NOT_CONFIGURED';
    throw error;
  }

  if (!stripe) {
    stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2022-11-15' });
  }

  return stripe;
}

exports.createCheckoutSession = async ({ line_items = [], success_url, cancel_url }) => {
  const stripeClient = getStripeClient();
  const safeLineItems = Array.isArray(line_items) && line_items.length > 0 ? line_items : [
    {
      price_data: {
        currency: 'eur',
        product_data: { name: 'Donación Por Ellos' },
        unit_amount: 500,
      },
      quantity: 1,
    },
  ];

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: safeLineItems,
    success_url: success_url || `${config.frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancel_url || `${config.frontendUrl}/cancel`,
  });

  return session;
};

exports.handleWebhook = async (rawBody, signature) => {
  const stripeClient = getStripeClient();
  let event;

  try {
    event = stripeClient.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('Checkout session completed:', session.id);
      break;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      console.log('Async payment succeeded:', session.id);
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      console.log('Checkout session expired:', session.id);
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return event;
};
