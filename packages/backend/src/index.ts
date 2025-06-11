import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { getUserHandler } from "./handlers/user";
import { uploadHandler } from "./handlers/upload";
import {
  convertHandler,
  checkBatchLimitHandler,
  getConversionProgressHandler,
} from "./handlers/conversion";
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
    origin: [
      "https://www.useconvertor.com",
      "https://useconvertor.com",
      "http://localhost:3000",
      "http://localhost:3001",
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ],
    credentials: true,
  })
);

app.post("/webhooks/stripe", handleStripeWebhook);

app.get("/api/debug/cors", async (c) => {
  const corsOrigins = [
    "https://www.useconvertor.com",
    "https://useconvertor.com",
    "http://localhost:3000",
    "http://localhost:3001",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

  return c.json({
    corsOrigins,
    frontendUrl: process.env.FRONTEND_URL,
    nodeEnv: process.env.NODE_ENV,
    requestOrigin: c.req.header("origin"),
  });
});

app.get("/api/debug/conversion-setup", async (c) => {
  try {
    let ffmpegPath = "Not found";
    let ffmpegExists = false;

    // Try system FFmpeg first
    try {
      const { execSync } = require("child_process");
      const systemFfmpegPath = execSync("which ffmpeg", {
        encoding: "utf8",
      }).trim();
      if (systemFfmpegPath) {
        ffmpegPath = systemFfmpegPath;
        const fs = await import("fs").then((m) => m.promises);
        ffmpegExists = await fs
          .access(systemFfmpegPath)
          .then(() => true)
          .catch(() => false);
      }
    } catch (error) {
      // Fallback to installer package
      try {
        const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
        ffmpegPath = ffmpegInstaller.path;
        const fs = await import("fs").then((m) => m.promises);
        ffmpegExists = await fs
          .access(ffmpegInstaller.path)
          .then(() => true)
          .catch(() => false);
      } catch (installerError) {
        // Both failed
      }
    }

    const checks = {
      ffmpegPath,
      ffmpegExists,
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

app.get("/api/health", healthHandler);
app.get("/api/user", getUserHandler);
app.post("/api/upload", uploadHandler);
app.post("/api/convert", convertHandler);
app.get("/api/convert/progress/*", getConversionProgressHandler);
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

app.post("/api/cleanup/expired-files", cleanupExpiredFilesHandler);

const port = process.env.PORT || 3001;
console.log(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
