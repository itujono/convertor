import { AppSettings } from "../config/app-settings";

// Detect Railway environment
const isRailway = !!(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
);

// Try to detect if Bun's S3 API is available
let BunS3Client: any = null;
let useAwsSDK = false;

try {
  // Try to import Bun's S3Client
  const bunModule = await import("bun");
  BunS3Client = bunModule.S3Client;
  if (!BunS3Client) {
    throw new Error("S3Client not available in this Bun version");
  }
  console.log("✅ Using Bun's native S3 API");
  console.log(`🔧 Bun version: ${process.versions.bun || "unknown"}`);
} catch (error) {
  console.log("⚠️ Bun's S3 API not available, falling back to AWS SDK");
  console.log(`🔧 Bun version: ${process.versions.bun || "unknown"}`);
  console.log(
    `❌ Error details: ${
      error instanceof Error ? error.message : "Unknown error"
    }`
  );
  useAwsSDK = true;
}

// AWS SDK fallback imports (only imported if needed)
let S3Client: any = null;
let PutObjectCommand: any = null;
let GetObjectCommand: any = null;
let HeadObjectCommand: any = null;
let DeleteObjectCommand: any = null;
let getSignedUrl: any = null;

if (useAwsSDK) {
  try {
    console.log("📦 Loading AWS SDK packages...");
    const awsS3 = await import("@aws-sdk/client-s3");
    const presigner = await import("@aws-sdk/s3-request-presigner");

    S3Client = awsS3.S3Client;
    PutObjectCommand = awsS3.PutObjectCommand;
    GetObjectCommand = awsS3.GetObjectCommand;
    HeadObjectCommand = awsS3.HeadObjectCommand;
    DeleteObjectCommand = awsS3.DeleteObjectCommand;
    getSignedUrl = presigner.getSignedUrl;

    console.log("✅ AWS SDK packages loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load AWS SDK packages:", error);
    throw new Error("AWS SDK fallback failed - packages not available");
  }
}

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;

// Initialize appropriate S3 client
let s3Client: any;

if (useAwsSDK) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-southeast-2",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
} else {
  s3Client = new BunS3Client({
    region: process.env.AWS_REGION || "ap-southeast-2",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    bucket: process.env.AWS_S3_BUCKET!,
  });
}

// Log S3 configuration on startup
console.log(
  `🔧 S3 Configuration (${useAwsSDK ? "AWS SDK" : "Bun S3 Client"}):`,
  {
    region: process.env.AWS_REGION,
    bucket: BUCKET_NAME,
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    cloudfront: CLOUDFRONT_DOMAIN || "not configured",
    isRailway,
    railwayEnv: process.env.RAILWAY_ENVIRONMENT || "unknown",
  }
);

// Test S3 connectivity on startup
async function testS3Connection() {
  try {
    console.log("🔌 Testing S3 connection...");

    if (useAwsSDK) {
      const command = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: "test-connection-file-that-does-not-exist",
      });

      try {
        await s3Client.send(command);
        console.log("❌ Unexpected: Test file exists (this should not happen)");
      } catch (error: any) {
        if (
          error.name === "NotFound" ||
          error.$metadata?.httpStatusCode === 404
        ) {
          console.log(
            "✅ S3 connection test successful (got expected 404 for non-existent file)"
          );
        } else {
          console.error("❌ S3 connection test failed:", error.message);
        }
      }
    } else {
      const testFile = s3Client.file(
        "test-connection-file-that-does-not-exist"
      );
      const exists = await testFile.exists();

      if (exists) {
        console.log("❌ Unexpected: Test file exists (this should not happen)");
      } else {
        console.log(
          "✅ S3 connection test successful (got expected false for non-existent file)"
        );
      }
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

// Large file upload using appropriate method
async function uploadLargeFile(
  buffer: Buffer,
  filePath: string,
  mimeType: string
): Promise<void> {
  console.log(`🔄 Starting large file upload: ${filePath}`);

  if (useAwsSDK) {
    // Use AWS SDK multipart upload for large files
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    console.log(`🎉 Large file upload completed successfully!`);
  } else {
    // Use Bun's streaming writer
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

  // Use streaming upload for files larger than the configured threshold
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
    // Simple upload for small files
    console.log(
      `📤 Uploading small file: ${filePath} (${fileBuffer.length} bytes)`
    );

    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Upload attempt ${attempt}/${maxRetries}...`);
        const uploadStartTime = Date.now();

        if (useAwsSDK) {
          const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filePath,
            Body: fileBuffer,
            ContentType: contentType,
          });

          await s3Client.send(command);
        } else {
          const s3File = s3Client.file(filePath);
          await s3File.write(fileBuffer, { type: contentType });
        }

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

  // Generate public URL
  const publicUrl = CLOUDFRONT_DOMAIN
    ? `${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filePath}`;

  return {
    filePath,
    fileName, // Return original filename instead of UUID
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
  const fs = await import("fs");
  const fileBuffer = fs.readFileSync(localFilePath);

  const baseFileName = originalFileName.split(".")[0];
  const convertedFileName = `${baseFileName}_converted.${targetFormat}`;
  const uniqueFileName = `${crypto.randomUUID()}.${targetFormat}`;
  const filePath = `${userId}/converted/${uniqueFileName}`;

  console.log(`📤 Uploading converted file: ${filePath}`);

  const mimeType = getMimeType(targetFormat);
  const maxRetries = 2;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Upload attempt ${attempt}/${maxRetries}...`);
      const uploadStartTime = Date.now();

      if (useAwsSDK) {
        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: filePath,
          Body: fileBuffer,
          ContentType: mimeType,
        });

        await s3Client.send(command);
      } else {
        const s3File = s3Client.file(filePath);
        await s3File.write(fileBuffer, { type: mimeType });
      }

      const uploadDuration = Date.now() - uploadStartTime;
      console.log(
        `⏱️ Upload completed in ${uploadDuration}ms on attempt ${attempt}`
      );
      console.log(`✅ S3 upload successful: ${filePath}`);
      break;
    } catch (uploadError: any) {
      lastError = uploadError;
      console.error(`❌ S3 upload attempt ${attempt} failed:`, uploadError);

      if (attempt === maxRetries) {
        break;
      }

      const delay = Math.min(500 * attempt, 2000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError) {
    console.error(`❌ All upload attempts failed for ${filePath}`);
    throw lastError;
  }

  // Generate public URL
  const publicUrl = CLOUDFRONT_DOMAIN
    ? `${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filePath}`;

  return {
    filePath,
    fileName: convertedFileName, // Return descriptive filename
    fileSize: fileBuffer.length,
    publicUrl,
  };
}

export async function createSignedDownloadUrl(
  filePath: string,
  expiresIn: number = 300 // 5 minutes default
): Promise<SignedUrlResult> {
  console.log(`🔗 Creating signed download URL for: ${filePath}`);

  if (useAwsSDK) {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return {
      signedUrl,
      expiresIn,
    };
  } else {
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
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  console.log(`📥 Downloading file: ${filePath}`);

  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Download attempt ${attempt}/${maxRetries}...`);

      let fileBuffer: Buffer;

      if (useAwsSDK) {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: filePath,
        });

        const response = await s3Client.send(command);
        const chunks: Buffer[] = [];

        for await (const chunk of response.Body as any) {
          chunks.push(chunk);
        }

        fileBuffer = Buffer.concat(chunks);
      } else {
        const s3File = s3Client.file(filePath);
        const arrayBuffer = await s3File.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
      }

      console.log(
        `✅ File downloaded successfully: ${filePath} (${fileBuffer.length} bytes)`
      );
      return fileBuffer;
    } catch (downloadError: any) {
      lastError = downloadError;
      console.error(`❌ Download attempt ${attempt} failed:`, {
        error: downloadError.message,
        name: downloadError.name,
        attempt,
      });

      if (attempt === maxRetries) {
        break;
      }

      const delay = Math.min(1000 * attempt, 3000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error(`❌ All download attempts failed for ${filePath}`);
  throw lastError;
}

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    if (useAwsSDK) {
      const command = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
      });

      await s3Client.send(command);
      return true;
    } else {
      const s3File = s3Client.file(filePath);
      return await s3File.exists();
    }
  } catch (error: any) {
    if (
      useAwsSDK &&
      (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404)
    ) {
      return false;
    } else if (!useAwsSDK) {
      return false;
    }

    console.error("Error checking file existence:", error);
    throw error;
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  console.log(`🗑️ Deleting file: ${filePath}`);

  if (useAwsSDK) {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
    });

    await s3Client.send(command);
  } else {
    const s3File = s3Client.file(filePath);
    await s3File.delete();
  }

  console.log(`✅ File deleted successfully: ${filePath}`);
}

export async function deleteFiles(filePaths: string[]): Promise<void> {
  console.log(`🗑️ Deleting ${filePaths.length} files...`);

  const deletePromises = filePaths.map((filePath) => deleteFile(filePath));
  await Promise.all(deletePromises);

  console.log(`✅ All ${filePaths.length} files deleted successfully`);
}

export function scheduleFileCleanup(
  filePaths: string[],
  delayMs: number = 5 * 60 * 1000
): void {
  console.log(
    `⏰ Scheduling cleanup of ${filePaths.length} files in ${
      delayMs / 1000
    } seconds`
  );

  setTimeout(async () => {
    try {
      await deleteFiles(filePaths);
    } catch (error) {
      console.error("❌ Error during scheduled file cleanup:", error);
    }
  }, delayMs);
}

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Video
    mp4: "video/mp4",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    aac: "audio/aac",
    ogg: "audio/ogg",
    // Image
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    // Default
    default: "application/octet-stream",
  };

  return mimeTypes[extension.toLowerCase()] || mimeTypes.default;
}
