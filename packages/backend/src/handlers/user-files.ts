import { Context } from "hono";
import { supabaseAdmin } from "../utils/supabase";
import { createSignedDownloadUrl } from "../utils/aws-storage";
import type { Variables } from "../utils/types";

/**
 * Get user's ready-to-download files
 */
export async function getUserFilesHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");

    // Get files that are ready and not expired
    const { data: userFiles, error } = await supabaseAdmin
      .from("user_files")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "ready")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user files:", error);
      return c.json({ error: "Failed to fetch files" }, 500);
    }

    // Regenerate signed URLs for fresh access
    const filesWithFreshUrls = await Promise.all(
      userFiles.map(async (file) => {
        try {
          const { signedUrl } = await createSignedDownloadUrl(
            file.file_path,
            300
          ); // 5 minutes

          // Update the download URL in database
          await supabaseAdmin
            .from("user_files")
            .update({ download_url: signedUrl })
            .eq("id", file.id);

          return {
            ...file,
            download_url: signedUrl,
            time_remaining: Math.max(
              0,
              new Date(file.expires_at).getTime() - Date.now()
            ),
          };
        } catch (error) {
          console.error(
            `Error generating signed URL for file ${file.id}:`,
            error
          );
          return {
            ...file,
            download_url: null,
            time_remaining: Math.max(
              0,
              new Date(file.expires_at).getTime() - Date.now()
            ),
          };
        }
      })
    );

    return c.json({
      files: filesWithFreshUrls,
      count: filesWithFreshUrls.length,
    });
  } catch (error: any) {
    console.error("Get user files error:", error);
    return c.json({ error: error.message || "Failed to fetch files" }, 500);
  }
}

/**
 * Mark a file as downloaded and update last_downloaded_at
 */
export async function markFileDownloadedHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { fileId } = await c.req.json();

    if (!fileId) {
      return c.json({ error: "File ID is required" }, 400);
    }

    const { error } = await supabaseAdmin
      .from("user_files")
      .update({
        last_downloaded_at: new Date().toISOString(),
        status: "downloaded",
      })
      .eq("id", fileId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error marking file as downloaded:", error);
      return c.json({ error: "Failed to update file status" }, 500);
    }

    return c.json({ message: "File marked as downloaded" });
  } catch (error: any) {
    console.error("Mark file downloaded error:", error);
    return c.json(
      { error: error.message || "Failed to update file status" },
      500
    );
  }
}

/**
 * Delete a user file (remove from database and S3)
 */
export async function deleteUserFileHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const fileId = c.req.param("fileId");

    if (!fileId) {
      return c.json({ error: "File ID is required" }, 400);
    }

    // Get file info first
    const { data: file, error: fetchError } = await supabaseAdmin
      .from("user_files")
      .select("file_path")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !file) {
      return c.json({ error: "File not found" }, 404);
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from("user_files")
      .delete()
      .eq("id", fileId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting file from database:", deleteError);
      return c.json({ error: "Failed to delete file" }, 500);
    }

    // Note: S3 cleanup will happen automatically via scheduled cleanup
    // or we could trigger immediate cleanup here if needed

    return c.json({ message: "File deleted successfully" });
  } catch (error: any) {
    console.error("Delete user file error:", error);
    return c.json({ error: error.message || "Failed to delete file" }, 500);
  }
}

/**
 * Cleanup expired files (can be called by a cron job)
 */
export async function cleanupExpiredFilesHandler(c: Context) {
  try {
    // Get expired files
    const { data: expiredFiles, error: fetchError } = await supabaseAdmin
      .from("user_files")
      .select("id, file_path")
      .lt("expires_at", new Date().toISOString())
      .eq("status", "ready");

    if (fetchError) {
      console.error("Error fetching expired files:", fetchError);
      return c.json({ error: "Failed to fetch expired files" }, 500);
    }

    if (expiredFiles.length === 0) {
      return c.json({ message: "No expired files to cleanup", cleaned: 0 });
    }

    // Mark as expired in database
    const { error: updateError } = await supabaseAdmin
      .from("user_files")
      .update({ status: "expired" })
      .lt("expires_at", new Date().toISOString())
      .eq("status", "ready");

    if (updateError) {
      console.error("Error marking files as expired:", updateError);
      return c.json({ error: "Failed to mark files as expired" }, 500);
    }

    console.log(`Marked ${expiredFiles.length} files as expired`);

    return c.json({
      message: "Expired files cleaned up successfully",
      cleaned: expiredFiles.length,
    });
  } catch (error: any) {
    console.error("Cleanup expired files error:", error);
    return c.json(
      { error: error.message || "Failed to cleanup expired files" },
      500
    );
  }
}
