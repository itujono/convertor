import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
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
    maxAttempts: 5,
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

// Multipart upload for larger files (>5MB)
async function uploadLargeFile(
  buffer: Buffer,
  filePath: string,
  mimeType: string,
  fileName: string,
  userId: string
): Promise<any> {
  const PART_SIZE = 5 * 1024 * 1024; // 5MB parts
  const totalParts = Math.ceil(buffer.length / PART_SIZE);

  console.log(
    `🔄 Starting multipart upload: ${totalParts} parts of ${PART_SIZE} bytes each`
  );

  // Create multipart upload
  const createMultipartCommand = new CreateMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    ContentType: mimeType,
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(fileName),
      "user-id": userId,
    },
  });

  const multipartUpload = await s3Client.send(createMultipartCommand);
  const uploadId = multipartUpload.UploadId!;

  console.log(`📝 Created multipart upload with ID: ${uploadId}`);

  try {
    const uploadPromises = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, buffer.length);
      const partBuffer = buffer.slice(start, end);

      console.log(
        `📤 Uploading part ${partNumber}/${totalParts} (${partBuffer.length} bytes)`
      );

      const uploadPartCommand = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
        PartNumber: partNumber,
        UploadId: uploadId,
        Body: partBuffer,
        ContentLength: partBuffer.length,
      });

      uploadPromises.push(
        s3Client.send(uploadPartCommand).then((result) => ({
          ETag: result.ETag!,
          PartNumber: partNumber,
        }))
      );
    }

    console.log(`⏳ Waiting for all ${totalParts} parts to complete...`);
    const completedParts = await Promise.all(uploadPromises);

    console.log(
      `✅ All parts uploaded successfully, completing multipart upload...`
    );

    // Complete the multipart upload
    const completeMultipartCommand = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: completedParts,
      },
    });

    const result = await s3Client.send(completeMultipartCommand);
    console.log(`🎉 Multipart upload completed successfully!`);

    return result;
  } catch (error) {
    console.error(`❌ Multipart upload failed, aborting...`);

    // Abort the multipart upload on failure
    try {
      await s3Client.send(
        new AbortMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: filePath,
          UploadId: uploadId,
        })
      );
      console.log(`🗑️ Multipart upload aborted successfully`);
    } catch (abortError) {
      console.error(`❌ Failed to abort multipart upload:`, abortError);
    }

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

  // Ensure the buffer is properly formatted
  const uploadBuffer = Buffer.isBuffer(fileBuffer)
    ? fileBuffer
    : Buffer.from(fileBuffer);

  console.log(`📋 Buffer validation:`, {
    isBuffer: Buffer.isBuffer(uploadBuffer),
    bufferLength: uploadBuffer.length,
    originalLength: fileBuffer.length,
    bufferType: typeof uploadBuffer,
    sizeCategory:
      uploadBuffer.length > 5 * 1024 * 1024 ? "large (>5MB)" : "small (<5MB)",
  });

  const contentType = mimeType || "application/octet-stream";

  // Use multipart upload for files larger than 5MB
  if (uploadBuffer.length > 5 * 1024 * 1024) {
    console.log(
      `📦 File is ${(uploadBuffer.length / 1024 / 1024).toFixed(
        2
      )}MB, using multipart upload`
    );

    try {
      const result = await uploadLargeFile(
        uploadBuffer,
        filePath,
        contentType,
        fileName,
        userId
      );

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
    } catch (error) {
      console.error(`❌ Multipart upload failed:`, error);
      throw error;
    }
  }

  let command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    Body: uploadBuffer,
    ContentType: contentType,
    ContentLength: uploadBuffer.length, // Explicitly set content length
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(fileName),
      "user-id": userId,
    },
  });

  // For small files, try a simpler upload approach first
  console.log(
    `📤 Uploading small file to S3: ${filePath} (${uploadBuffer.length} bytes)`
  );

  let uploadResult;

  try {
    console.log(`🔄 Sending simple S3 upload command...`);
    const uploadStartTime = Date.now();

    const result = await s3Client.send(command);
    const uploadDuration = Date.now() - uploadStartTime;

    console.log(`⏱️ Upload completed in ${uploadDuration}ms`);
    console.log(`📊 Upload result:`, {
      hasETag: !!result.ETag,
      etagValue: result.ETag,
      statusCode: result.$metadata?.httpStatusCode,
      requestId: result.$metadata?.requestId,
    });

    // Validate the upload was actually successful
    const statusCode = result.$metadata?.httpStatusCode;

    if (statusCode === 100) {
      throw new Error(
        "S3 upload incomplete - received HTTP 100 Continue, request may have been interrupted"
      );
    }

    if (statusCode !== 200) {
      throw new Error(
        `S3 upload failed with status ${statusCode} (expected 200)`
      );
    }

    if (!result.ETag) {
      throw new Error("S3 upload failed - no ETag returned");
    }

    console.log(`✅ S3 upload successful: ${filePath}`);

    uploadResult = result;
  } catch (uploadError: any) {
    console.error(`❌ S3 upload failed:`, {
      error: uploadError.message,
      name: uploadError.name,
      code: uploadError.Code || uploadError.code,
      statusCode: uploadError.$metadata?.httpStatusCode,
      requestId: uploadError.$metadata?.requestId,
    });
    throw uploadError;
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
