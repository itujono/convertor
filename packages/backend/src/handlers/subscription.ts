import type { Context } from "hono";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";
import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { LEMONSQUEEZY_CONFIG } from "../config/lemonsqueezy";
import crypto from "crypto";

export async function getUserSubscription(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");

    // For now, just return user's plan from the users table
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("plan")
      .eq("id", user.id)
      .single();

    return c.json({
      subscription: userData ? { plan: userData.plan } : { plan: "free" },
    });
  } catch (error) {
    console.error("Error getting user subscription:", error);
    return c.json({ error: "Failed to get subscription" }, 500);
  }
}

export async function createCheckoutSession(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { plan } = await c.req.json();

    if (!plan || !["monthly", "yearly"].includes(plan)) {
      return c.json({ error: "Invalid plan specified" }, 400);
    }

    const variantId =
      LEMONSQUEEZY_CONFIG.variantIds[plan as "monthly" | "yearly"];

    if (!variantId) {
      return c.json({ error: "Plan configuration not found" }, 500);
    }

    console.log(
      `Creating checkout for user ${user.id}, plan: ${plan}, variant: ${variantId}`
    );

    // Use the official LemonSqueezy SDK format
    const response = await createCheckout(
      LEMONSQUEEZY_CONFIG.storeId,
      variantId,
      {
        checkoutData: {
          custom: {
            user_id: user.id,
            plan: plan,
          },
        },
      }
    );

    if (response.error) {
      console.error("LemonSqueezy checkout creation failed:", response.error);
      return c.json({ error: "Failed to create checkout session" }, 500);
    }

    console.log("✅ Checkout created successfully:");

    // The response structure is: response.data.data (nested data)
    const checkoutData = (response as any).data?.data;
    const checkoutUrl = checkoutData?.attributes?.url;
    const checkoutId = checkoutData?.id;

    return c.json({
      checkoutUrl,
      checkoutId,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return c.json({ error: "Failed to create checkout session" }, 500);
  }
}

// Placeholder for future payment integration
export async function cancelSubscription(c: Context<{ Variables: Variables }>) {
  return c.json({ error: "Payment integration not available" }, 501);
}

// LemonSqueezy webhook handler
export async function handlePaymentWebhook(c: Context) {
  try {
    const body = await c.req.text();
    const signature = c.req.header("X-Signature");

    if (!signature) {
      console.error("No signature found in webhook");
      return c.json({ error: "No signature" }, 400);
    }

    // Verify webhook signature (you'll need to set this in your environment)
    const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured");
      return c.json({ error: "Webhook secret not configured" }, 500);
    }

    // Verify the signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Invalid webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }

    const event = JSON.parse(body);
    console.log("LemonSqueezy webhook received:", event.meta?.event_name);

    switch (event.meta?.event_name) {
      case "subscription_created":
      case "subscription_updated":
        await handleSubscriptionChange(event);
        break;

      case "subscription_cancelled":
      case "subscription_expired":
        await handleSubscriptionCancellation(event);
        break;

      case "order_created":
        await handleOrderCreated(event);
        break;

      default:
        console.log("Unhandled webhook event:", event.meta?.event_name);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
}

async function handleSubscriptionChange(event: any) {
  try {
    const subscription = event.data;
    const customData = subscription.attributes?.custom_data;

    if (!customData?.user_id) {
      console.error("No user_id in subscription custom data");
      return;
    }

    const userId = customData.user_id;
    const status = subscription.attributes?.status;

    // Map LemonSqueezy status to our plan
    let plan = "free";
    if (status === "active" || status === "trialing") {
      plan = "premium";
    }

    console.log(`Updating user ${userId} to plan: ${plan}, status: ${status}`);

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        plan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("Error updating user subscription:", error);
    } else {
      console.log(`Successfully updated user ${userId} subscription`);
    }
  } catch (error) {
    console.error("Error handling subscription change:", error);
  }
}

async function handleSubscriptionCancellation(event: any) {
  try {
    const subscription = event.data;
    const customData = subscription.attributes?.custom_data;

    if (!customData?.user_id) {
      console.error("No user_id in subscription custom data");
      return;
    }

    const userId = customData.user_id;

    console.log(`Downgrading user ${userId} to free plan`);

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        plan: "free",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("Error downgrading user:", error);
    } else {
      console.log(`Successfully downgraded user ${userId}`);
    }
  } catch (error) {
    console.error("Error handling subscription cancellation:", error);
  }
}

async function handleOrderCreated(event: any) {
  try {
    const order = event.data;
    const customData = order.attributes?.custom_data;

    if (!customData?.user_id) {
      console.error("No user_id in order custom data");
      return;
    }

    console.log(`Order created for user ${customData.user_id}:`, {
      orderId: order.id,
      status: order.attributes?.status,
      total: order.attributes?.total_formatted,
    });

    // For one-time purchases, you might want to upgrade the user immediately
    // This depends on your business model
  } catch (error) {
    console.error("Error handling order creation:", error);
  }
}
