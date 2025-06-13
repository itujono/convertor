import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { getUserHandler } from "./handlers/user";
import { uploadHandler } from "./handlers/upload";
import { uploadStatusHandler } from "./handlers/upload-status";
import {
  initiatePresignedUploadHandler,
  completeMultipartUploadHandler,
  abortMultipartUploadHandler,
} from "./handlers/presigned-upload";
import {
  abortUploadHandler,
  abortAllUploadsHandler,
  abortConversionHandler,
  deleteFilesHandler,
} from "./handlers/abort";
import { clientConvertedHandler } from "./handlers/client-converted";
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

// Add startup dependency checks
console.log("🔍 Checking dependencies...");
try {
  const awsS3 = await import("@aws-sdk/client-s3");
  console.log("✅ AWS S3 SDK loaded successfully");
} catch (error) {
  console.error("❌ Failed to load AWS S3 SDK:", error);
}

try {
  const awsPresigner = await import("@aws-sdk/s3-request-presigner");
  console.log("✅ AWS S3 Request Presigner loaded successfully");
} catch (error) {
  console.error("❌ Failed to load AWS S3 Request Presigner:", error);
}

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
    origin: (origin, c) => {
      const allowedOrigins = [
        "https://www.useconvertor.com",
        "https://useconvertor.com",
        "https://convertor-staging.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
      ];

      // Add debugging for OPTIONS requests
      if (c.req.method === "OPTIONS") {
        const headersObj: Record<string, string> = {};
        c.req.raw.headers.forEach((value, key) => {
          headersObj[key] = value;
        });

        console.log("🔍 OPTIONS preflight request:", {
          origin,
          allowedOrigins,
          isOriginAllowed: origin ? allowedOrigins.includes(origin) : true,
          frontendUrl: process.env.FRONTEND_URL,
          path: c.req.path,
          headers: headersObj,
        });
      }

      // Handle cases where origin is not provided (same-origin requests)
      if (!origin) {
        return "*";
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      console.log("❌ CORS: Origin not allowed:", origin);
      return null; // Return null for disallowed origins
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.post("/webhooks/stripe", handleStripeWebhook);

app.get("/api/debug/cors", async (c) => {
  const corsOrigins = [
    "https://www.useconvertor.com",
    "https://useconvertor.com",
    "https://convertor-staging.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

  const requestOrigin = c.req.header("origin");

  return c.json({
    corsOrigins,
    frontendUrl: process.env.FRONTEND_URL,
    nodeEnv: process.env.NODE_ENV,
    requestOrigin,
    isOriginAllowed: requestOrigin ? corsOrigins.includes(requestOrigin) : true,
    railwayUrl:
      process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_DOMAIN || "not-set",
    allEnvVars: {
      RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL,
      RAILWAY_DOMAIN: process.env.RAILWAY_DOMAIN,
      FRONTEND_URL: process.env.FRONTEND_URL,
      NODE_ENV: process.env.NODE_ENV,
    },
    requestHeaders: {
      origin: c.req.header("origin"),
      referer: c.req.header("referer"),
      host: c.req.header("host"),
      userAgent: c.req.header("user-agent"),
    },
  });
});

// Add a simple OPTIONS test endpoint
app.options("/api/debug/test-options", async (c) => {
  console.log("🧪 Test OPTIONS endpoint hit");
  return c.json({ message: "OPTIONS test successful" });
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
app.get("/api/upload/status/:uploadId", uploadStatusHandler);

// Presigned upload routes
app.post("/api/upload/presigned", initiatePresignedUploadHandler);
app.post("/api/upload/complete-multipart", completeMultipartUploadHandler);
app.post("/api/upload/abort-multipart", abortMultipartUploadHandler);

// Abort routes
app.post("/api/abort/upload", abortUploadHandler);
app.post("/api/abort/all-uploads", abortAllUploadsHandler);
app.post("/api/abort/conversion", abortConversionHandler);
app.delete("/api/files", deleteFilesHandler);
app.post("/api/client-converted", clientConvertedHandler);
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
