import type { Context } from "hono";
import { getUploadStatus } from "../utils/async-s3-upload";
import type { Variables } from "../utils/types";
import crypto from "crypto";

export async function uploadStatusHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const uploadId = c.req.param("uploadId");

    if (!uploadId) {
      return c.json({ error: "Upload ID is required" }, 400);
    }

    const uploadStatus = getUploadStatus(uploadId);

    if (!uploadStatus) {
      return c.json({ error: "Upload not found" }, 404);
    }

    // Return different response based on status
    const response: any = {
      uploadId,
      status: uploadStatus.status,
      fileName: uploadStatus.fileName,
      createdAt: uploadStatus.createdAt,
    };

    if (uploadStatus.status === "failed") {
      response.error = uploadStatus.error;
    }

    if (uploadStatus.status === "completed") {
      // For completed uploads, we just return the status
      // The actual file URLs would be stored in the database in a real implementation
      response.message = "Upload completed successfully";
    }

    return c.json(response);
  } catch (error: any) {
    console.error("Upload status check error:", error);
    return c.json(
      { error: error.message || "Failed to check upload status" },
      500
    );
  }
}
