const Stripe = require('stripe');
const { stripeSecretKey, stripeWebhookSecret, frontendUrl } = require('../config');

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2022-11-15' });

exports.createCheckoutSession = async ({ line_items = [], success_url, cancel_url }) => {
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

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: safeLineItems,
    success_url: success_url || `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancel_url || `${frontendUrl}/cancel`,
  });

  return session;
};

exports.handleWebhook = async (rawBody, signature) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
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
