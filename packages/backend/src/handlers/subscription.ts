import type { Context } from "hono";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";

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

// Placeholder for future payment integration
export async function createCheckoutSession(
  c: Context<{ Variables: Variables }>
) {
  return c.json({ error: "Payment integration not available" }, 501);
}

// Placeholder for future payment integration
export async function cancelSubscription(c: Context<{ Variables: Variables }>) {
  return c.json({ error: "Payment integration not available" }, 501);
}

// Placeholder webhook handler for future payment integration
export async function handlePaymentWebhook(c: Context) {
  return c.json({ error: "Webhook not available" }, 501);
}
