import { S3Client } from "bun";
import { AppSettings } from "../../../frontend/src/lib/app-settings";

// Bun S3 client configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  bucket: process.env.AWS_S3_BUCKET!,
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;

// Detect Railway environment
const isRailway = !!(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
);

// Log S3 configuration on startup
console.log("🔧 S3 Configuration (Bun S3 Client):", {
  region: process.env.AWS_REGION,
  bucket: BUCKET_NAME,
  hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
  cloudfront: CLOUDFRONT_DOMAIN || "not configured",
  isRailway,
  railwayEnv: process.env.RAILWAY_ENVIRONMENT || "unknown",
});

// Test S3 connectivity on startup
async function testS3Connection() {
  try {
    console.log("🔌 Testing S3 connection...");
    const testFile = s3Client.file("test-connection-file-that-does-not-exist");
    const exists = await testFile.exists();

    if (exists) {
      console.log("❌ Unexpected: Test file exists (this should not happen)");
    } else {
      console.log(
        "✅ S3 connection test successful (got expected false for non-existent file)"
      );
    }
  } catch (error: any) {
    console.error("❌ S3 connection test failed:", {
      error: error.message,
      name: error.name,
    });
  }
}

// Run connection test
testS3Connection();

export interface UploadResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}

export interface SignedUrlResult {
  signedUrl: string;
  expiresIn: number;
}

// Large file upload using Bun's streaming writer
async function uploadLargeFile(
  buffer: Buffer,
  filePath: string,
  mimeType: string
): Promise<void> {
  console.log(
    `🔄 Starting large file upload using Bun's streaming writer: ${filePath}`
  );

  const s3File = s3Client.file(filePath);

  try {
    const writer = s3File.writer({
      type: mimeType,
      retry: 3,
      queueSize: 10,
      partSize: 5 * 1024 * 1024, // 5MB chunks
    });

    // Write the buffer in chunks
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + CHUNK_SIZE);
      await writer.write(chunk);
      console.log(
        `📤 Uploaded chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(
          buffer.length / CHUNK_SIZE
        )}`
      );
    }

    await writer.end();
    console.log(`🎉 Large file upload completed successfully!`);
  } catch (error) {
    console.error(`❌ Large file upload failed:`, error);
    throw error;
  }
}

export async function uploadFile(
  file: Buffer | Uint8Array | File,
  fileName: string,
  userId: string,
  mimeType?: string
): Promise<UploadResult> {
  const fileExtension = fileName.split(".").pop();
  const uniqueFileName = `${crypto.randomUUID()}.${fileExtension}`;
  const filePath = `${userId}/uploads/${uniqueFileName}`;

  const fileBuffer =
    file instanceof File
      ? Buffer.from(await file.arrayBuffer())
      : Buffer.from(file);

  const streamingThreshold = AppSettings.storage.streamingUploadThresholdBytes;

  console.log(`📋 Upload details:`, {
    fileName: uniqueFileName,
    filePath,
    fileSize: fileBuffer.length,
    sizeCategory:
      fileBuffer.length > streamingThreshold
        ? `large (>${AppSettings.storage.streamingUploadThresholdMB}MB)`
        : `small (<${AppSettings.storage.streamingUploadThresholdMB}MB)`,
  });

  const contentType = mimeType || "application/octet-stream";

  // Use streaming writer for files larger than the configured threshold
  if (fileBuffer.length > streamingThreshold) {
    console.log(
      `📦 File is ${(fileBuffer.length / 1024 / 1024).toFixed(
        2
      )}MB, using streaming upload`
    );

    try {
      await uploadLargeFile(fileBuffer, filePath, contentType);
    } catch (error) {
      console.error(`❌ Large file upload failed:`, error);
      throw error;
    }
  } else {
    // Simple upload for small files using Bun.write
    console.log(
      `📤 Uploading small file: ${filePath} (${fileBuffer.length} bytes)`
    );

    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Upload attempt ${attempt}/${maxRetries}...`);
        const uploadStartTime = Date.now();

        const s3File = s3Client.file(filePath);
        await s3File.write(fileBuffer, { type: contentType });

        const uploadDuration = Date.now() - uploadStartTime;
        console.log(
          `⏱️ Upload completed in ${uploadDuration}ms on attempt ${attempt}`
        );
        console.log(`✅ S3 upload successful: ${filePath}`);
        break;
      } catch (uploadError: any) {
        lastError = uploadError;
        console.error(`❌ S3 upload attempt ${attempt} failed:`, {
          error: uploadError.message,
          name: uploadError.name,
          attempt,
        });

        // Check if this is a retryable error
        const isRetryableError =
          uploadError.message?.includes("timeout") ||
          uploadError.message?.includes("interrupted") ||
          uploadError.name === "TimeoutError" ||
          uploadError.name === "NetworkingError";

        if (attempt === maxRetries || !isRetryableError) {
          break;
        }

        const delay = Math.min(500 * attempt, 2000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (lastError && maxRetries > 1) {
      console.error(`❌ All upload attempts failed for ${filePath}`);
      throw lastError;
    }
  }

  // Generate public URL (CloudFront if available, otherwise S3)
  const publicUrl = CLOUDFRONT_DOMAIN
    ? `https://${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${filePath}`;

  return {
    filePath,
    fileName: fileName, // Return original filename instead of UUID
    fileSize: fileBuffer.length,
    publicUrl,
  };
}

export async function uploadConvertedFile(
  localFilePath: string,
  userId: string,
  originalFileName: string,
  targetFormat: string
): Promise<UploadResult> {
  const fs = await import("fs").then((m) => m.promises);
  const path = await import("path");

  const fileBuffer = await fs.readFile(localFilePath);
  const baseName = path.parse(originalFileName).name;
  const convertedFileName = `${baseName}_converted.${targetFormat}`;
  const uniqueFileName = `${crypto.randomUUID()}_${convertedFileName}`;
  const filePath = `${userId}/converted/${uniqueFileName}`;

  const s3File = s3Client.file(filePath);
  await s3File.write(fileBuffer, {
    type: getMimeType(targetFormat),
  });

  // Generate public URL (CloudFront if available, otherwise S3)
  const publicUrl = CLOUDFRONT_DOMAIN
    ? `https://${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${filePath}`;

  return {
    filePath,
    fileName: convertedFileName, // Return user-friendly filename instead of UUID
    fileSize: fileBuffer.length,
    publicUrl,
  };
}

export async function createSignedDownloadUrl(
  filePath: string,
  expiresIn: number = 300 // 5 minutes default
): Promise<SignedUrlResult> {
  const s3File = s3Client.file(filePath);
  const signedUrl = s3File.presign({
    expiresIn,
    method: "GET",
  });

  return {
    signedUrl,
    expiresIn,
  };
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const s3File = s3Client.file(filePath);
      const arrayBuffer = await s3File.arrayBuffer();

      console.log(`✅ S3 download successful on attempt ${attempt}`);
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      const isRetryableError =
        error.name === "NoSuchKey" ||
        error.name === "NotFound" ||
        error.message?.includes("timeout");

      if (attempt === maxRetries || !isRetryableError) {
        console.error(`❌ S3 download failed after ${attempt} attempts:`, {
          error: error.message,
          filePath,
          errorName: error.name,
          attempt,
        });
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(
        `⚠️ S3 download attempt ${attempt} failed, retrying in ${delay}ms:`,
        {
          error: error.message,
          filePath,
          nextAttempt: attempt + 1,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("This should never be reached");
}

export async function checkFileExists(filePath: string): Promise<boolean> {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🔍 Checking file existence (attempt ${attempt}/${maxRetries}): ${filePath}`
      );

      const s3File = s3Client.file(filePath);
      const exists = await s3File.exists();

      console.log(
        `✅ File exists check successful (attempt ${attempt}): ${
          exists ? "exists" : "not found"
        }`
      );
      return exists;
    } catch (error: any) {
      console.error(`❌ File exists check error (attempt ${attempt}):`, {
        filePath,
        bucket: BUCKET_NAME,
        errorName: error.name,
        errorMessage: error.message,
        attempt,
      });

      // Check if this is a retryable error
      const isRetryableError =
        error.message?.includes("timeout") ||
        error.message?.includes("interrupted") ||
        error.name === "TimeoutError" ||
        error.name === "NetworkingError";

      if (attempt === maxRetries || !isRetryableError) {
        console.warn(
          `⚠️ File existence check failed after ${attempt} attempts, treating as not found:`,
          {
            error: error.message,
            filePath,
          }
        );
        return false;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Retrying file existence check in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return false;
}

export async function deleteFile(filePath: string): Promise<void> {
  const s3File = s3Client.file(filePath);
  await s3File.delete();
}

export async function deleteFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;

  // Delete files in parallel using Promise.all
  await Promise.all(
    filePaths.map(async (filePath) => {
      const s3File = s3Client.file(filePath);
      await s3File.delete();
    })
  );
}

export function scheduleFileCleanup(
  filePaths: string[],
  delayMs: number = 5 * 60 * 1000
): void {
  setTimeout(async () => {
    try {
      await deleteFiles(filePaths);
      console.log(`Cleaned up ${filePaths.length} files:`, filePaths);
    } catch (error) {
      console.error("Failed to cleanup files:", error);
    }
  }, delayMs);
}

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    svg: "image/svg+xml",
    heic: "image/heic",
    heif: "image/heif",

    mp4: "video/mp4",
    webm: "video/webm",
    avi: "video/avi",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",

    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/m4a",
    aac: "audio/aac",
    flac: "audio/flac",
    wma: "audio/x-ms-wma",
    opus: "audio/opus",
  };

  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}
