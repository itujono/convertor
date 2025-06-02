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
import { convertHandler, checkBatchLimitHandler } from "./handlers/conversion";
import { downloadHandler, downloadZipHandler } from "./handlers/download";
import {
  getUserFilesHandler,
  markFileDownloadedHandler,
  deleteUserFileHandler,
  cleanupExpiredFilesHandler,
} from "./handlers/user-files";
import { healthHandler } from "./handlers/health";
import {
  createCheckoutSession,
  getUserSubscription,
  cancelSubscription,
  handleStripeWebhook,
} from "./handlers/subscription";
import type { Variables } from "./utils/types";

const app = new Hono<{ Variables: Variables }>();

// Increase timeout for large file uploads
app.use("*", async (c, next) => {
  // Set a longer timeout for upload and conversion endpoints
  if (c.req.path.includes("/upload") || c.req.path.includes("/convert")) {
    // 10 minute timeout for large files
    const timeoutId = setTimeout(() => {
      console.log("Request timeout for:", c.req.path);
    }, 10 * 60 * 1000);

    await next();
    clearTimeout(timeoutId);
  } else {
    await next();
  }
});

app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL, "http://localhost:3000"]
      : ["http://localhost:3000"],
    credentials: true,
  })
);

app.post("/webhooks/stripe", handleStripeWebhook);

app.get("/api/debug/conversion-setup", async (c) => {
  try {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
    const fs = await import("fs").then((m) => m.promises);

    const checks = {
      ffmpegPath: ffmpegInstaller.path,
      ffmpegExists: await fs
        .access(ffmpegInstaller.path)
        .then(() => true)
        .catch(() => false),
      awsRegion: process.env.AWS_REGION,
      awsBucket: process.env.AWS_S3_BUCKET,
      awsAccessKey: process.env.AWS_ACCESS_KEY_ID ? "Set" : "Missing",
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY ? "Set" : "Missing",
      cloudfront: process.env.AWS_CLOUDFRONT_DOMAIN || "Not set",
    };

    return c.json({ checks });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.use("/api/*", authMiddleware);

app.get("/api/user", getUserHandler);
app.post("/api/upload", uploadHandler);
app.post("/api/convert", convertHandler);
app.post("/api/check-batch-limit", checkBatchLimitHandler);
app.get("/api/download/:filename", downloadHandler);
app.post("/api/download/zip", downloadZipHandler);

// User files management
app.get("/api/user-files", getUserFilesHandler);
app.post("/api/user-files/mark-downloaded", markFileDownloadedHandler);
app.delete("/api/user-files/:fileId", deleteUserFileHandler);

app.post("/api/subscription/checkout", createCheckoutSession);
app.get("/api/subscription", getUserSubscription);
app.post("/api/subscription/cancel", cancelSubscription);

// Cleanup endpoint (can be called by cron job)
app.post("/api/cleanup/expired-files", cleanupExpiredFilesHandler);

app.get("/health", healthHandler);

// Start the server
const port = process.env.PORT || 3001;
console.log(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
