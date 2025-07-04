import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";

// Configure LemonSqueezy API
lemonSqueezySetup({
  apiKey: process.env.LEMON_SQUEEZY_API_KEY!,
  onError: (error) => {
    console.error("❌ LemonSqueezy API Error:", error);
  },
});

export const LEMONSQUEEZY_CONFIG = {
  storeId: process.env.LEMON_SQUEEZY_STORE_ID!,
  variantIds: {
    monthly: process.env.LEMON_SQUEEZY_MONTHLY_VARIANT_ID!,
    yearly: process.env.LEMON_SQUEEZY_YEARLY_VARIANT_ID!,
  },
  webhookSecret: process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!,
} as const;

// Validate configuration
const requiredEnvVars = [
  "LEMON_SQUEEZY_API_KEY",
  "LEMON_SQUEEZY_STORE_ID",
  "LEMON_SQUEEZY_MONTHLY_VARIANT_ID",
  "LEMON_SQUEEZY_YEARLY_VARIANT_ID",
  "LEMON_SQUEEZY_WEBHOOK_SECRET",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
  }
}

console.log("✅ LemonSqueezy SDK configured with:", {
  hasApiKey: !!process.env.LEMON_SQUEEZY_API_KEY,
  storeId: LEMONSQUEEZY_CONFIG.storeId,
  monthlyVariant: LEMONSQUEEZY_CONFIG.variantIds.monthly,
  yearlyVariant: LEMONSQUEEZY_CONFIG.variantIds.yearly,
  hasWebhookSecret: !!LEMONSQUEEZY_CONFIG.webhookSecret,
});
