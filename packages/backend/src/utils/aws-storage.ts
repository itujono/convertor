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
  maxAttempts: 3, // Built-in retry mechanism
  retryMode: "adaptive", // Adaptive retry mode for better handling
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;

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

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    Body: fileBuffer,
    ContentType: mimeType || "application/octet-stream",
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(fileName),
      "user-id": userId,
    },
  });

  try {
    console.log(`📤 Uploading to S3: ${filePath} (${fileBuffer.length} bytes)`);
    const result = await s3Client.send(command);
    console.log(`✅ S3 upload successful: ${filePath}`, {
      etag: result.ETag,
      versionId: result.VersionId,
    });
  } catch (error: any) {
    console.error(`❌ S3 upload failed: ${filePath}`, {
      error: error.message,
      code: error.Code || error.code,
      name: error.name,
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

    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (
      error.name === "NotFound" ||
      error.name === "NoSuchKey" ||
      error.Code === "NoSuchKey"
    ) {
      return false;
    }
    throw error; // Re-throw other errors
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
