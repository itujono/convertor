import { loadStripe } from "@stripe/stripe-js";
import { apiClient } from "./api-client";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export { stripePromise };

export const STRIPE_PRICES = {
  premium_monthly: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID || "price_premium_monthly",
  premium_yearly: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY_PRICE_ID || "price_premium_yearly",
} as const;

export type StripePriceId = keyof typeof STRIPE_PRICES;

export async function createCheckoutSession(priceId: string) {
  return apiClient.createCheckoutSession(priceId);
}

export async function redirectToCheckout(priceId: string) {
  try {
    const stripe = await stripePromise;
    if (!stripe) throw new Error("Stripe not loaded");

    const { sessionId } = await createCheckoutSession(priceId);

    const { error } = await stripe.redirectToCheckout({
      sessionId,
    });

    if (error) {
      console.error("Stripe checkout error:", error);
      throw error;
    }
  } catch (error) {
    console.error("Checkout error:", error);
    throw error;
  }
}
