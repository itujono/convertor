import type { Context } from "hono";
import { checkConversionLimit } from "../utils/conversion";
import {
  uploadFile,
  checkFileExists,
  downloadFile,
} from "../utils/aws-storage";
import { queueS3Upload, getUploadStatus } from "../utils/async-s3-upload";
import type { Variables } from "../utils/types";

export async function uploadHandler(c: Context<{ Variables: Variables }>) {
  try {
    const user = c.get("user");
    await checkConversionLimit(user.id);

    console.log("Starting file upload for user:", user.id);

    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    console.log(
      `Queuing file upload: ${file.name}, size: ${file.size} bytes, type: ${file.type}`
    );

    // For small files (<5MB), use synchronous upload
    if (file.size < 5 * 1024 * 1024) {
      console.log(`📤 Small file detected, using synchronous upload...`);

      try {
        const uploadResult = await uploadFile(
          file,
          file.name,
          user.id,
          file.type
        );
        console.log(
          "✅ Small file uploaded to S3 successfully:",
          uploadResult.filePath
        );

        return c.json({
          message: "File uploaded successfully",
          filePath: uploadResult.filePath,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          publicUrl: uploadResult.publicUrl,
        });
      } catch (uploadError: any) {
        console.error(
          "❌ Small file upload failed, falling back to async upload:",
          uploadError.message
        );
        // Fall through to async upload as fallback
      }
    }

    // For large files or if small file upload failed, use asynchronous upload
    console.log(`📦 Using asynchronous upload for file: ${file.name}`);

    const { uploadId, localPath } = await queueS3Upload(
      file,
      file.name,
      user.id,
      file.type
    );

    console.log(`✅ File queued for upload with ID: ${uploadId}`);

    // Return immediately with upload ID for status checking
    return c.json({
      message: "File queued for upload",
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      status: "queued",
      // Note: filePath and publicUrl will be available after async upload completes
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return c.json({ error: error.message || "Upload failed" }, 500);
  }
}
