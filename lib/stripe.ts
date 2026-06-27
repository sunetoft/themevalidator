import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

// Lazy-init Stripe so the app doesn't crash if STRIPE_SECRET_KEY isn't set yet
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia' as any,
    });
  }
  return _stripe;
}

// ─── Single-tier pricing ──────────────────────────────────────────
export const MEMBERSHIP_PRICE = {
  label: 'Monthly Membership',
  amount: 15, // placeholder — override via env STRIPE_MEMBERSHIP_PRICE
  currency: 'usd',
  interval: 'month' as const,
  stripePriceId: process.env.STRIPE_PRICE_ID || '', // set in Stripe dashboard
};

// ─── Create checkout session ──────────────────────────────────────
export async function createCheckoutSession(opts: {
  userId: string;
  email: string;
}): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();

  if (!MEMBERSHIP_PRICE.stripePriceId) {
    return { error: 'Stripe price ID not configured. Set STRIPE_PRICE_ID in .env' };
  }

  try {
    // Find or create Stripe customer
    let customerId = await getStripeCustomerId(opts.userId);

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: opts.email,
        metadata: { userId: opts.userId },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: opts.userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: MEMBERSHIP_PRICE.stripePriceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: {
        metadata: { userId: opts.userId },
      },
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?checkout=cancelled`,
    });

    return { url: session.url! };
  } catch (err: any) {
    console.error('[STRIPE] Checkout session error:', err?.message);
    return { error: 'Failed to create checkout session' };
  }
}

// ─── Create customer portal session ───────────────────────────────
export async function createPortalSession(opts: {
  userId: string;
}): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();

  const customerId = await getStripeCustomerId(opts.userId);
  if (!customerId) {
    return { error: 'No Stripe customer found' };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXTAUTH_URL}/dashboard`,
    });
    return { url: session.url };
  } catch (err: any) {
    console.error('[STRIPE] Portal session error:', err?.message);
    return { error: 'Failed to create portal session' };
  }
}

// ─── Process webhook events ───────────────────────────────────────
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) break;

      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );

      const priceId = subscription.items.data[0]?.price?.id || '';
      const s = subscription as any;

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          stripeCustomerId: subscription.customer as string,
          status: subscription.status,
          currentPeriodStart: new Date(s.current_period_start * 1000),
          currentPeriodEnd: new Date(s.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        update: {
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          stripeCustomerId: subscription.customer as string,
          status: subscription.status,
          currentPeriodStart: new Date(s.current_period_start * 1000),
          currentPeriodEnd: new Date(s.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) break;

      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (!sub) break;

      const inv = invoice as any;
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: 'active',
          currentPeriodStart: new Date(inv.period_start * 1000),
          currentPeriodEnd: new Date(inv.period_end * 1000),
        },
      });
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const s = subscription as any;
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (!sub) break;

      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: subscription.status,
          currentPeriodStart: new Date(s.current_period_start * 1000),
          currentPeriodEnd: new Date(s.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: 'canceled', cancelAtPeriodEnd: false },
      });
      break;
    }

    default:
      console.log(`[STRIPE WEBHOOK] Unhandled event: ${event.type}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────
async function getStripeCustomerId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  return user?.stripeCustomerId ?? null;
}
