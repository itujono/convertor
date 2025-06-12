import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  maxAttempts: 5, // Increase retry attempts
  retryMode: "adaptive", // Adaptive retry mode for better handling
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;

// Log S3 configuration on startup
console.log("🔧 S3 Configuration:", {
  region: process.env.AWS_REGION,
  bucket: BUCKET_NAME,
  hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
  cloudfront: CLOUDFRONT_DOMAIN || "not configured",
  s3ClientConfig: {
    maxAttempts: 3,
    retryMode: "adaptive",
  },
});

// Test S3 connectivity on startup
async function testS3Connection() {
  try {
    console.log("🔌 Testing S3 connection...");
    const testCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: "test-connection-file-that-does-not-exist",
    });

    await s3Client.send(testCommand);
    console.log("❌ Unexpected: Test file exists (this should not happen)");
  } catch (error: any) {
    if (
      error.name === "NotFound" ||
      error.Code === "NoSuchKey" ||
      error.$metadata?.httpStatusCode === 404
    ) {
      console.log(
        "✅ S3 connection test successful (got expected 404 for non-existent file)"
      );
    } else {
      console.error("❌ S3 connection test failed:", {
        error: error.message,
        code: error.Code || error.code,
        statusCode: error.$metadata?.httpStatusCode,
        name: error.name,
      });
    }
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

function sanitizeFilenameForHeader(filename: string): string {
  return filename
    .replace(/[^\x20-\x7E]/g, "") // Remove non-ASCII characters
    .replace(/["\\\r\n]/g, "") // Remove quotes, backslashes, and line breaks
    .trim();
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

  // Ensure the buffer is properly formatted
  const uploadBuffer = Buffer.isBuffer(fileBuffer)
    ? fileBuffer
    : Buffer.from(fileBuffer);

  console.log(`📋 Buffer validation:`, {
    isBuffer: Buffer.isBuffer(uploadBuffer),
    bufferLength: uploadBuffer.length,
    originalLength: fileBuffer.length,
    bufferType: typeof uploadBuffer,
  });

  let command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    Body: uploadBuffer,
    ContentType: mimeType || "application/octet-stream",
    ContentLength: uploadBuffer.length, // Explicitly set content length
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(fileName),
      "user-id": userId,
    },
  });

  // Retry upload with exponential backoff
  const maxUploadRetries = 3;
  let uploadResult;

  for (let attempt = 1; attempt <= maxUploadRetries; attempt++) {
    try {
      console.log(
        `📤 Uploading to S3 (attempt ${attempt}/${maxUploadRetries}): ${filePath} (${uploadBuffer.length} bytes)`
      );
      console.log(`📋 Upload command details:`, {
        bucket: BUCKET_NAME,
        key: filePath,
        contentType: mimeType || "application/octet-stream",
        bufferSize: uploadBuffer.length,
        contentLength: command.input.ContentLength,
        hasBody: !!command.input.Body,
        bodyType: typeof command.input.Body,
        bodyLength: Buffer.isBuffer(command.input.Body)
          ? command.input.Body.length
          : "unknown",
        attempt,
      });

      console.log(`🔄 Sending S3 upload command...`);

      // Add a timeout wrapper to catch hanging uploads
      const uploadPromise = s3Client.send(command);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("S3 upload timeout after 30 seconds"));
        }, 30000);
      });

      const result = await Promise.race([uploadPromise, timeoutPromise]);

      console.log(`📊 Raw S3 upload result (attempt ${attempt}):`, {
        result: result,
        metadata: result.$metadata,
        hasETag: !!result.ETag,
        etagValue: result.ETag,
      });

      // Validate the upload was actually successful
      if (result.$metadata?.httpStatusCode !== 200) {
        throw new Error(
          `S3 upload failed with status ${result.$metadata?.httpStatusCode} (expected 200)`
        );
      }

      if (!result.ETag) {
        throw new Error("S3 upload failed - no ETag returned");
      }

      console.log(`✅ S3 upload successful: ${filePath}`, {
        etag: result.ETag,
        versionId: result.VersionId,
        serverSideEncryption: result.ServerSideEncryption,
        requestId: result.$metadata?.requestId,
        httpStatusCode: result.$metadata?.httpStatusCode,
      });

      uploadResult = result;
      break; // Success - exit retry loop
    } catch (uploadError: any) {
      console.error(`❌ S3 upload attempt ${attempt} failed:`, {
        error: uploadError.message,
        code: uploadError.Code || uploadError.code,
        name: uploadError.name,
        statusCode: uploadError.$metadata?.httpStatusCode,
        requestId: uploadError.$metadata?.requestId,
        attempt,
      });

      if (attempt === maxUploadRetries) {
        throw uploadError; // Final attempt failed
      }

      // Wait before retry with exponential backoff
      const retryDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
      console.log(`⏳ Retrying upload in ${retryDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      // Recreate command for retry (in case it's consumed)
      command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
        Body: uploadBuffer,
        ContentType: mimeType || "application/octet-stream",
        ContentLength: uploadBuffer.length,
        Metadata: {
          "original-filename": sanitizeFilenameForHeader(fileName),
          "user-id": userId,
        },
      });
    }
  }

  if (!uploadResult) {
    throw new Error("Upload failed after all retry attempts");
  }

  try {
    // Verify the upload immediately with a different approach
    console.log(`🔄 Immediately verifying upload with GetObject...`);
    try {
      const verifyCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
      });
      const verifyResult = await s3Client.send(verifyCommand);
      console.log(`✅ Immediate upload verification successful:`, {
        contentLength: verifyResult.ContentLength,
        lastModified: verifyResult.LastModified,
        etag: verifyResult.ETag,
      });
    } catch (verifyError: any) {
      console.warn(`⚠️ Immediate upload verification failed:`, {
        error: verifyError.message,
        code: verifyError.Code || verifyError.code,
        statusCode: verifyError.$metadata?.httpStatusCode,
      });
    }
  } catch (error: any) {
    console.error(`❌ S3 upload failed: ${filePath}`, {
      error: error.message,
      code: error.Code || error.code,
      name: error.name,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });
    throw error;
  }

  // Generate public URL (CloudFront if available, otherwise S3)
  const publicUrl = CLOUDFRONT_DOMAIN
    ? `https://${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${filePath}`;

  return {
    filePath,
    fileName: uniqueFileName,
    fileSize: uploadBuffer.length,
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
  const convertedFileName = `${baseName}.${targetFormat}`;
  const uniqueFileName = `${crypto.randomUUID()}_${convertedFileName}`;
  const filePath = `${userId}/converted/${uniqueFileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    Body: fileBuffer,
    ContentType: getMimeType(targetFormat),
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(originalFileName),
      "converted-format": targetFormat,
      "user-id": userId,
    },
  });

  await s3Client.send(command);

  // Generate public URL (CloudFront if available, otherwise S3)
  const publicUrl = CLOUDFRONT_DOMAIN
    ? `https://${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${filePath}`;

  return {
    filePath,
    fileName: uniqueFileName,
    fileSize: fileBuffer.length,
    publicUrl,
  };
}

export async function createSignedDownloadUrl(
  filePath: string,
  expiresIn: number = 300 // 5 minutes default
): Promise<SignedUrlResult> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

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
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
      });

      const downloadPromise = s3Client.send(command);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("S3 download timeout after 2 minutes"));
        }, 2 * 60 * 1000); // 2 minutes
      });

      const response = (await Promise.race([
        downloadPromise,
        timeoutPromise,
      ])) as any;

      if (!response.Body) {
        throw new Error("File not found or empty");
      }

      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();

      const streamTimeout = setTimeout(() => {
        reader.cancel();
        throw new Error("Stream reading timeout");
      }, 60 * 1000); // 1 minute for stream reading

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        clearTimeout(streamTimeout);
      } catch (error) {
        clearTimeout(streamTimeout);
        throw error;
      }

      console.log(`✅ S3 download successful on attempt ${attempt}`);
      return Buffer.concat(chunks);
    } catch (error: any) {
      const isRetryableError =
        error.name === "NoSuchKey" ||
        error.Code === "NoSuchKey" ||
        error.name === "NotFound" ||
        error.message?.includes("timeout");

      if (attempt === maxRetries || !isRetryableError) {
        console.error(`❌ S3 download failed after ${attempt} attempts:`, {
          error: error.message,
          filePath,
          errorCode: error.Code || error.code,
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
          errorCode: error.Code || error.code,
          nextAttempt: attempt + 1,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("This should never be reached");
}

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
    });

    console.log(
      `🔍 Checking file existence: ${filePath} in bucket: ${BUCKET_NAME}`
    );
    const result = await s3Client.send(command);
    console.log(`✅ File exists check successful:`, {
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      etag: result.ETag,
    });
    return true;
  } catch (error: any) {
    console.error(`❌ File exists check error:`, {
      filePath,
      bucket: BUCKET_NAME,
      errorName: error.name,
      errorCode: error.Code || error.code,
      errorMessage: error.message,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

    // Handle 400 errors - try alternative verification method
    if (error.$metadata?.httpStatusCode === 400) {
      console.warn(
        `⚠️ HeadObject returned 400 error, trying GetObject as alternative verification...`
      );
      try {
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: filePath,
          Range: "bytes=0-0", // Only get first byte to minimize data transfer
        });
        const getResult = await s3Client.send(getCommand);
        console.log(`✅ Alternative verification (GetObject) successful:`, {
          filePath,
          contentLength: getResult.ContentLength,
          contentRange: getResult.ContentRange,
          etag: getResult.ETag,
        });
        return true;
      } catch (getError: any) {
        console.error(`❌ Alternative verification also failed:`, {
          error: getError.message,
          code: getError.Code || getError.code,
          statusCode: getError.$metadata?.httpStatusCode,
          requestId: getError.$metadata?.requestId,
        });
        return false;
      }
    }

    // Handle various "not found" error types
    if (
      error.name === "NotFound" ||
      error.name === "NoSuchKey" ||
      error.Code === "NoSuchKey" ||
      error.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }

    // For other unexpected errors, log and return false (don't throw)
    console.warn(
      `⚠️ Unexpected error during file existence check, treating as not found:`,
      {
        error: error.message,
        statusCode: error.$metadata?.httpStatusCode,
      }
    );
    return false;
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
  });

  await s3Client.send(command);
}

export async function deleteFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;

  const command = new DeleteObjectsCommand({
    Bucket: BUCKET_NAME,
    Delete: {
      Objects: filePaths.map((Key) => ({ Key })),
    },
  });

  await s3Client.send(command);
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
