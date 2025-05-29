import { Context } from "hono";
import {
  stripe,
  getOrCreateStripeCustomer,
  STRIPE_PRICES,
  getPlanFromPriceId,
} from "../utils/stripe";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";
// import type Stripe from "stripe";

export async function createCheckoutSession(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { priceId, successUrl, cancelUrl } = await c.req.json();

    if (!priceId || !Object.values(STRIPE_PRICES).includes(priceId)) {
      return c.json({ error: "Invalid price ID" }, 400);
    }

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const customer = await getOrCreateStripeCustomer(
      user.id,
      user.email,
      userData?.stripe_customer_id
    );

    if (!userData?.stripe_customer_id) {
      await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl || `${process.env.FRONTEND_URL}/#upload`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/#upload`,
      metadata: {
        userId: user.id,
      },
    });

    return c.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return c.json({ error: "Failed to create checkout session" }, 500);
  }
}

export async function getUserSubscription(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");

    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    return c.json({ subscription });
  } catch (error) {
    console.error("Error getting user subscription:", error);
    return c.json({ error: "Failed to get subscription" }, 500);
  }
}

export async function cancelSubscription(c: Context<{ Variables: Variables }>) {
  try {
    const user = c.get("user");

    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!subscription) {
      return c.json({ error: "No active subscription found" }, 404);
    }

    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("stripe_subscription_id", subscription.stripe_subscription_id);

    return c.json({ message: "Subscription will be canceled at period end" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
}

export async function handleStripeWebhook(c: Context) {
  try {
    const body = await c.req.text();
    const signature = c.req.header("stripe-signature");

    if (!signature) {
      return c.json({ error: "Missing stripe signature" }, 400);
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return c.json({ error: "Webhook secret not configured" }, 500);
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return c.json({ error: "Invalid signature" }, 400);
    }

    console.log("Received webhook event:", event.type);

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
}

async function handleCheckoutCompleted(session: any) {
  const userId = session.metadata?.userId;
  const subscriptionId = session.subscription;

  if (!userId || !subscriptionId) {
    console.error("Missing userId or subscriptionId in checkout session");
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  const plan = getPlanFromPriceId(subscription.items.data[0].price.id);

  await supabaseAdmin.from("subscriptions").insert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer as string,
    stripe_price_id: subscription.items.data[0].price.id,
    status: subscription.status,
    current_period_start: new Date(
      (subscription as any).current_period_start * 1000
    ).toISOString(),
    current_period_end: new Date(
      (subscription as any).current_period_end * 1000
    ).toISOString(),
    cancel_at_period_end: (subscription as any).cancel_at_period_end,
  });

  // Update user plan
  await supabaseAdmin.from("users").update({ plan }).eq("id", userId);
}

async function handleSubscriptionUpdated(subscription: any) {
  const plan = getPlanFromPriceId(subscription.items.data[0].price.id);

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: subscription.status,
      current_period_start: new Date(
        subscription.current_period_start * 1000
      ).toISOString(),
      current_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("stripe_subscription_id", subscription.id);

  // Update user plan based on subscription status
  const { data: subscriptionData } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (subscriptionData) {
    const newPlan = subscription.status === "active" ? plan : "free";
    await supabaseAdmin
      .from("users")
      .update({ plan: newPlan })
      .eq("id", subscriptionData.user_id);
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", subscription.id);

  const { data: subscriptionData } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (subscriptionData) {
    await supabaseAdmin
      .from("users")
      .update({ plan: "free" })
      .eq("id", subscriptionData.user_id);
  }
}

async function handlePaymentSucceeded(invoice: any) {
  // Payment succeeded - subscription should remain active
  console.log("Payment succeeded for subscription:", invoice.subscription);
}

async function handlePaymentFailed(invoice: any) {
  // Payment failed - handle accordingly
  console.log("Payment failed for subscription:", invoice.subscription);

  // You might want to send an email notification here
  // or update the subscription status based on your business logic
  // TODO: Implement email notification or subscription status update
}
