import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-05-28.basil",
  typescript: true,
});

export const STRIPE_PRICES = {
  premium_monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
  premium_yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID,
} as const;

export type StripePriceId = keyof typeof STRIPE_PRICES;

export function getPlanFromPriceId(priceId: string): "free" | "premium" {
  if (Object.values(STRIPE_PRICES).includes(priceId as any)) {
    return "premium";
  }
  return "free";
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId?: string
) {
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!customer.deleted) {
        return customer as Stripe.Customer;
      }
    } catch (error) {
      console.error("Error retrieving existing customer:", error);
    }
  }

  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  });

  return customer;
}
