import type { Context } from "hono";
import {
  generatePresignedUpload,
  completeMultipartUpload,
  abortMultipartUpload,
} from "../utils/presigned-upload";
import { checkConversionLimit } from "../utils/conversion";
import type { Variables } from "../utils/types";

// Initiate presigned upload
export async function initiatePresignedUploadHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    await checkConversionLimit(user.id);

    const { fileName, fileSize, mimeType } = await c.req.json();

    if (!fileName || !fileSize || !mimeType) {
      return c.json(
        { error: "Missing required fields: fileName, fileSize, mimeType" },
        400
      );
    }

    if (fileSize <= 0) {
      return c.json({ error: "Invalid file size" }, 400);
    }

    console.log(
      `🔗 Generating presigned upload for user ${user.id}: ${fileName} (${fileSize} bytes)`
    );

    const presignedUpload = await generatePresignedUpload(
      fileName,
      fileSize,
      mimeType,
      user.id
    );

    return c.json({
      message: "Presigned upload URLs generated",
      ...presignedUpload,
    });
  } catch (error: any) {
    console.error("Presigned upload initiation error:", error);
    return c.json(
      { error: error.message || "Failed to generate presigned upload" },
      500
    );
  }
}

// Complete multipart upload
export async function completeMultipartUploadHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { uploadId, filePath, parts } = await c.req.json();

    if (!uploadId || !filePath || !parts || !Array.isArray(parts)) {
      return c.json(
        { error: "Missing required fields: uploadId, filePath, parts" },
        400
      );
    }

    console.log(
      `✅ Completing multipart upload for user ${user.id}: ${filePath}`
    );

    const result = await completeMultipartUpload({
      uploadId,
      filePath,
      parts,
    });

    return c.json({
      message: "Multipart upload completed successfully",
      success: result.success,
      location: result.location,
      filePath,
    });
  } catch (error: any) {
    console.error("Complete multipart upload error:", error);
    return c.json(
      { error: error.message || "Failed to complete multipart upload" },
      500
    );
  }
}

// Abort multipart upload
export async function abortMultipartUploadHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { uploadId, filePath } = await c.req.json();

    if (!uploadId || !filePath) {
      return c.json(
        { error: "Missing required fields: uploadId, filePath" },
        400
      );
    }

    console.log(
      `🗑️ Aborting multipart upload for user ${user.id}: ${filePath}`
    );

    const result = await abortMultipartUpload(uploadId, filePath);

    return c.json({
      message: "Multipart upload aborted successfully",
      success: result.success,
    });
  } catch (error: any) {
    console.error("Abort multipart upload error:", error);
    return c.json(
      { error: error.message || "Failed to abort multipart upload" },
      500
    );
  }
}
