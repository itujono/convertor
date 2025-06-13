import type { Context } from "hono";
import { abortUpload, abortAllUploadsForUser } from "../utils/async-s3-upload";
import { deleteFile } from "../utils/aws-storage";
import type { Variables } from "../utils/types";

// Abort a specific upload
export async function abortUploadHandler(c: Context<{ Variables: Variables }>) {
  try {
    const user = c.get("user");
    const { uploadId } = await c.req.json();

    if (!uploadId) {
      return c.json({ error: "Upload ID is required" }, 400);
    }

    console.log(`🛑 User ${user.id} requesting abort for upload: ${uploadId}`);

    const result = await abortUpload(uploadId);

    if (result.success) {
      return c.json({
        message: result.message,
        success: true,
      });
    } else {
      return c.json(
        {
          error: result.message,
          success: false,
        },
        400
      );
    }
  } catch (error: any) {
    console.error("Abort upload error:", error);
    return c.json({ error: error.message || "Failed to abort upload" }, 500);
  }
}

// Abort all uploads for the current user
export async function abortAllUploadsHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");

    console.log(`🛑 User ${user.id} requesting abort for all uploads`);

    const result = await abortAllUploadsForUser(user.id);

    return c.json({
      message: `Successfully aborted ${result.abortedCount} uploads`,
      success: result.success,
      abortedCount: result.abortedCount,
    });
  } catch (error: any) {
    console.error("Abort all uploads error:", error);
    return c.json({ error: error.message || "Failed to abort uploads" }, 500);
  }
}

// Abort conversion and cleanup files
export async function abortConversionHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { filePath, uploadId } = await c.req.json();

    if (!filePath && !uploadId) {
      return c.json({ error: "File path or upload ID is required" }, 400);
    }

    console.log(
      `🛑 User ${user.id} requesting abort for conversion: ${
        filePath || uploadId
      }`
    );

    const cleanupTasks = [];

    // If we have an uploadId, abort the upload
    if (uploadId) {
      cleanupTasks.push(abortUpload(uploadId));
    }

    // If we have a filePath, delete the S3 file
    if (filePath) {
      cleanupTasks.push(
        deleteFile(filePath).catch((error) => {
          console.warn(`⚠️ Failed to delete file ${filePath}:`, error);
        })
      );
    }

    await Promise.all(cleanupTasks);

    return c.json({
      message: "Conversion aborted and files cleaned up",
      success: true,
    });
  } catch (error: any) {
    console.error("Abort conversion error:", error);
    return c.json(
      { error: error.message || "Failed to abort conversion" },
      500
    );
  }
}

// Delete specific S3 files (for cleanup)
export async function deleteFilesHandler(c: Context<{ Variables: Variables }>) {
  try {
    const user = c.get("user");
    const { filePaths } = await c.req.json();

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return c.json({ error: "File paths array is required" }, 400);
    }

    // Verify all file paths belong to the user (security check)
    const userPrefix = `${user.id}/`;
    const invalidPaths = filePaths.filter(
      (path) => !path.startsWith(userPrefix)
    );

    if (invalidPaths.length > 0) {
      return c.json(
        {
          error: "Unauthorized: Cannot delete files that don't belong to you",
          invalidPaths,
        },
        403
      );
    }

    console.log(
      `🗑️ User ${user.id} requesting deletion of ${filePaths.length} files`
    );

    const deletePromises = filePaths.map(async (filePath) => {
      try {
        await deleteFile(filePath);
        return { filePath, success: true };
      } catch (error: any) {
        console.warn(`⚠️ Failed to delete file ${filePath}:`, error);
        return {
          filePath,
          success: false,
          error: error.message || "Unknown error",
        };
      }
    });

    const results = await Promise.all(deletePromises);
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successCount;

    return c.json({
      message: `Deleted ${successCount} files successfully${
        failedCount > 0 ? `, ${failedCount} failed` : ""
      }`,
      success: true,
      results,
      successCount,
      failedCount,
    });
  } catch (error: any) {
    console.error("Delete files error:", error);
    return c.json({ error: error.message || "Failed to delete files" }, 500);
  }
}
