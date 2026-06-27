export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasActiveSubscription } from "@/lib/subscription";
import PricingClient from "./pricing-client";
import Stripe from "stripe";

async function getStripePricing() {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { price: "$25", interval: "month", productName: "Pro" };
    }

    const stripe = new Stripe(stripeKey);
    const prices = await stripe.prices.list({
      active: true,
      type: "recurring",
      expand: ["data.product"],
      limit: 10,
    });

    const primaryPrice =
      prices.data.find(
        (p) =>
          p.recurring?.interval === "month" &&
          (p.metadata?.default === "true" || p.metadata?.tier === "pro")
      ) ?? prices.data[0];

    if (!primaryPrice) {
      return { price: "$25", interval: "month", productName: "Pro" };
    }

    const amount = (primaryPrice.unit_amount ?? 2500) / 100;
    const symbol = (primaryPrice.currency ?? "usd") === "usd" ? "$" : "";
    return {
      price: `${symbol}${amount}`,
      interval: primaryPrice.recurring?.interval ?? "month",
      productName:
        (primaryPrice.product as Stripe.Product)?.name ?? "Pro",
    };
  } catch {
    return { price: "$25", interval: "month", productName: "Pro" };
  }
}

export default async function PricingPage() {
  const session = await getServerSession(authOptions);

  let hasSub = false;
  if (session?.user) {
    hasSub = await hasActiveSubscription((session.user as any).id);
  }

  const pricing = await getStripePricing();

  return (
    <PricingClient
      session={!!session?.user}
      hasSubscription={hasSub}
      price={pricing.price}
      interval={pricing.interval}
      productName={pricing.productName}
    />
  );
}
