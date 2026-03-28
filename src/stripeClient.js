let stripeInstance = null;

function getStripeClient() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.warn('STRIPE_SECRET_KEY not set — Stripe disabled');
      return null;
    }
    stripeInstance = require('stripe')(key);
  }
  return stripeInstance;
}

module.exports = { getStripeClient };
