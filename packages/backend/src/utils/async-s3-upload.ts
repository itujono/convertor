import fs from "fs/promises";
import path from "path";
import { uploadFile } from "./aws-storage";

interface QueuedUpload {
  id: string;
  localPath: string;
  fileName: string;
  userId: string;
  mimeType: string;
  status: "pending" | "uploading" | "completed" | "failed";
  createdAt: Date;
  error?: string;
  s3FilePath?: string; // Store the actual S3 file path when completed
  s3PublicUrl?: string; // Store the public URL when completed
}

// In-memory upload queue (in production, you'd use Redis or a database)
const uploadQueue = new Map<string, QueuedUpload>();

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(process.cwd(), "packages/backend/uploads");

export async function initializeUploadsDirectory() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    console.log(`📁 Uploads directory ready: ${UPLOADS_DIR}`);
  } catch (error) {
    console.error("❌ Failed to create uploads directory:", error);
  }
}

// Save file locally and queue for S3 upload
export async function queueS3Upload(
  file: File | Buffer,
  fileName: string,
  userId: string,
  mimeType: string
): Promise<{ uploadId: string; localPath: string }> {
  await ensureInitialized();
  const uploadId = `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const localPath = path.join(UPLOADS_DIR, `${uploadId}-${sanitizedFileName}`);

  console.log(`💾 Saving file locally: ${localPath}`);

  try {
    // Save file to local filesystem
    const buffer =
      file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

    await fs.writeFile(localPath, buffer);

    console.log(`✅ File saved locally: ${localPath} (${buffer.length} bytes)`);

    // Add to upload queue
    const queuedUpload: QueuedUpload = {
      id: uploadId,
      localPath,
      fileName,
      userId,
      mimeType,
      status: "pending",
      createdAt: new Date(),
    };

    uploadQueue.set(uploadId, queuedUpload);

    // Start async upload (don't await)
    processUploadQueue().catch((error) => {
      console.error(`❌ Upload queue processing error:`, error);
    });

    return { uploadId, localPath };
  } catch (error: any) {
    console.error(`❌ Failed to save file locally:`, error);
    throw new Error(`Failed to save file: ${error.message}`);
  }
}

// Process uploads in the background
async function processUploadQueue() {
  const pendingUploads = Array.from(uploadQueue.values())
    .filter((upload) => upload.status === "pending")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (pendingUploads.length === 0) {
    return;
  }

  console.log(`🔄 Processing ${pendingUploads.length} queued uploads...`);

  for (const upload of pendingUploads) {
    try {
      await processUpload(upload);
    } catch (error) {
      console.error(`❌ Failed to process upload ${upload.id}:`, error);
    }
  }
}

async function processUpload(upload: QueuedUpload) {
  console.log(`📤 Processing upload: ${upload.id}`);

  // Update status to uploading
  upload.status = "uploading";
  uploadQueue.set(upload.id, upload);

  try {
    // Read the local file
    const fileBuffer = await fs.readFile(upload.localPath);

    console.log(
      `🔄 Uploading to S3: ${upload.fileName} (${fileBuffer.length} bytes)`
    );

    // Upload to S3
    const result = await uploadFile(
      fileBuffer,
      upload.fileName,
      upload.userId,
      upload.mimeType
    );

    console.log(`✅ Upload completed: ${upload.id} -> ${result.filePath}`);

    // Update status to completed and store S3 details
    upload.status = "completed";
    upload.s3FilePath = result.filePath;
    upload.s3PublicUrl = result.publicUrl;
    uploadQueue.set(upload.id, upload);

    // Clean up local file
    try {
      await fs.unlink(upload.localPath);
      console.log(`🗑️ Cleaned up local file: ${upload.localPath}`);
    } catch (cleanupError) {
      console.warn(`⚠️ Failed to cleanup local file: ${cleanupError}`);
    }
  } catch (error: any) {
    console.error(`❌ Upload failed: ${upload.id}`, error);

    // Update status to failed
    upload.status = "failed";
    upload.error = error.message;
    uploadQueue.set(upload.id, upload);
  }
}

// Get upload status
export function getUploadStatus(uploadId: string): QueuedUpload | null {
  return uploadQueue.get(uploadId) || null;
}

// Clean up old completed/failed uploads from queue
export function cleanupUploadQueue() {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [id, upload] of uploadQueue.entries()) {
    if (
      (upload.status === "completed" || upload.status === "failed") &&
      now - upload.createdAt.getTime() > maxAge
    ) {
      uploadQueue.delete(id);
      console.log(`🧹 Cleaned up old upload from queue: ${id}`);
    }
  }
}

// Initialize on first use rather than import time
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initializeUploadsDirectory();
    initialized = true;

    // Clean up queue every 10 minutes
    setInterval(cleanupUploadQueue, 10 * 60 * 1000);
  }
}
