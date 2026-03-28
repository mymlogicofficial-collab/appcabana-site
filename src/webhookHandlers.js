class WebhookHandlers {
  static async processWebhook(payload, signature) {
    if (!Buffer.isBuffer(payload)) throw new Error('Payload must be a Buffer');

    const stripe = require('./stripeClient').getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } else {
      event = JSON.parse(payload.toString());
    }

    console.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('Checkout completed:', event.data.object.id);
        break;
      case 'payment_intent.succeeded':
        console.log('Payment succeeded:', event.data.object.id);
        break;
      default:
        console.log('Unhandled event:', event.type);
    }
  }
}

module.exports = { WebhookHandlers };
