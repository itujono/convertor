import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  maxAttempts: 3,
  retryMode: "adaptive",
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;

export interface PresignedUploadResult {
  uploadId: string;
  uploadUrl?: string; // For single-part uploads
  multipartUpload?: {
    uploadId: string;
    partUrls: string[];
    completeUrl: string;
    abortUrl: string;
  };
  filePath: string;
  fileName: string;
  publicUrl: string;
}

export interface CompleteMultipartRequest {
  uploadId: string;
  filePath: string;
  parts: Array<{
    PartNumber: number;
    ETag: string;
  }>;
}

// Generate presigned URL for direct upload
export async function generatePresignedUpload(
  fileName: string,
  fileSize: number,
  mimeType: string,
  userId: string
): Promise<PresignedUploadResult> {
  const fileExtension = fileName.split(".").pop();
  const uniqueFileName = `${crypto.randomUUID()}.${fileExtension}`;
  const filePath = `${userId}/uploads/${uniqueFileName}`;

  const publicUrl = CLOUDFRONT_DOMAIN
    ? `https://${CLOUDFRONT_DOMAIN}/${filePath}`
    : `https://${BUCKET_NAME}.s3.${
        process.env.AWS_REGION || "us-east-1"
      }.amazonaws.com/${filePath}`;

  // For files larger than 100MB, use multipart upload
  if (fileSize > 100 * 1024 * 1024) {
    return generateMultipartPresignedUpload(
      filePath,
      fileName,
      fileSize,
      mimeType,
      userId,
      publicUrl
    );
  }

  // For smaller files, use single presigned URL
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    ContentType: mimeType,
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(fileName),
      "user-id": userId,
      "file-size": fileSize.toString(),
    },
  });

  // Generate presigned URL for PUT request (15 minutes expiry)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return {
    uploadId: crypto.randomUUID(),
    uploadUrl,
    filePath,
    fileName: uniqueFileName,
    publicUrl,
  };
}

// Generate multipart presigned upload URLs
async function generateMultipartPresignedUpload(
  filePath: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  userId: string,
  publicUrl: string
): Promise<PresignedUploadResult> {
  const PART_SIZE = 10 * 1024 * 1024; // 10MB parts for better performance
  const totalParts = Math.ceil(fileSize / PART_SIZE);

  console.log(
    `🔄 Creating multipart upload: ${totalParts} parts for ${fileName}`
  );

  // Create multipart upload
  const createCommand = new CreateMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
    ContentType: mimeType,
    Metadata: {
      "original-filename": sanitizeFilenameForHeader(fileName),
      "user-id": userId,
      "file-size": fileSize.toString(),
      "total-parts": totalParts.toString(),
    },
  });

  const multipartResult = await s3Client.send(createCommand);
  const uploadId = multipartResult.UploadId!;

  // Generate presigned URLs for each part
  const partUrls: string[] = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const partCommand = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
      PartNumber: partNumber,
      UploadId: uploadId,
    });

    const partUrl = await getSignedUrl(s3Client, partCommand, {
      expiresIn: 3600,
    }); // 1 hour
    partUrls.push(partUrl);
  }

  return {
    uploadId: crypto.randomUUID(),
    multipartUpload: {
      uploadId,
      partUrls,
      completeUrl: `/api/upload/complete-multipart`,
      abortUrl: `/api/upload/abort-multipart`,
    },
    filePath,
    fileName: fileName.split("/").pop() || fileName,
    publicUrl,
  };
}

// Complete multipart upload
export async function completeMultipartUpload(
  request: CompleteMultipartRequest
): Promise<{ success: boolean; location?: string }> {
  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: request.filePath,
      UploadId: request.uploadId,
      MultipartUpload: {
        Parts: request.parts,
      },
    });

    const result = await s3Client.send(command);
    console.log(`✅ Multipart upload completed: ${request.filePath}`);

    return {
      success: true,
      location: result.Location,
    };
  } catch (error) {
    console.error(`❌ Failed to complete multipart upload:`, error);
    throw error;
  }
}

// Abort multipart upload
export async function abortMultipartUpload(
  uploadId: string,
  filePath: string
): Promise<{ success: boolean }> {
  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
      UploadId: uploadId,
    });

    await s3Client.send(command);
    console.log(`🗑️ Multipart upload aborted: ${filePath}`);

    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to abort multipart upload:`, error);
    throw error;
  }
}

// Helper function to sanitize filename for HTTP headers
function sanitizeFilenameForHeader(filename: string): string {
  return filename
    .replace(/[^\w\s.-]/g, "") // Remove special characters except dots, hyphens, and spaces
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .substring(0, 100); // Limit length
}
