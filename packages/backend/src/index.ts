// Load environment variables first
import { readFileSync } from "fs";
import { join } from "path";

// Load .env file manually for Bun
try {
  const envPath = join(process.cwd(), ".env");
  const envFile = readFileSync(envPath, "utf8");

  envFile.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=");
        process.env[key.trim()] = value.trim();
      }
    }
  });
  console.log("✅ Environment variables loaded");
} catch (error) {
  console.warn("⚠️ Could not load .env file:", error);
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { getUserHandler } from "./handlers/user";
import { uploadHandler } from "./handlers/upload";
import { convertHandler } from "./handlers/conversion";
import { downloadHandler } from "./handlers/download";
import { healthHandler } from "./handlers/health";
import {
  createCheckoutSession,
  getUserSubscription,
  cancelSubscription,
  handleStripeWebhook,
} from "./handlers/subscription";
import type { Variables } from "./utils/types";

const app = new Hono<{ Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

// Webhook endpoint (no auth required)
app.post("/webhooks/stripe", handleStripeWebhook);

// Apply auth middleware to API routes
app.use("/api/*", authMiddleware);

// API routes
app.get("/api/user", getUserHandler);
app.post("/api/upload", uploadHandler);
app.post("/api/convert", convertHandler);
app.get("/api/download/:filename", downloadHandler);

// Subscription routes
app.post("/api/subscription/checkout", createCheckoutSession);
app.get("/api/subscription", getUserSubscription);
app.post("/api/subscription/cancel", cancelSubscription);

// Health check
app.get("/health", healthHandler);

export default app;
