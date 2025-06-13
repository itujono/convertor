import type { Context } from "hono";
import { uploadFile, createSignedDownloadUrl } from "../utils/aws-storage";
import { supabaseAdmin } from "../utils/supabase";
import {
  checkConversionLimit,
  incrementConversionCount,
} from "../utils/conversion";
import type { Variables } from "../utils/types";

export async function clientConvertedHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    console.log("Processing client-side converted file for user:", user.id);

    // Check conversion limit BEFORE processing the file
    await checkConversionLimit(user.id);

    const body = await c.req.parseBody();
    const file = body.file as File;
    const originalFileName = body.originalFileName as string;
    const originalFormat = body.originalFormat as string;
    const convertedFormat = body.convertedFormat as string;
    const quality = body.quality as string;
    const source = body.source as string; // Should be "client-side"

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    if (!originalFileName || !convertedFormat) {
      return c.json({ error: "Missing required metadata" }, 400);
    }

    console.log(
      `📤 Uploading client-converted file: ${file.name} (${originalFileName} → ${convertedFormat})`
    );

    // Create a proper filename for the converted file
    const baseName = originalFileName.split(".").slice(0, -1).join(".");
    const convertedFileName = `${baseName}_converted.${
      convertedFormat === "jpeg" ? "jpg" : convertedFormat
    }`;

    // Upload the converted file to S3
    const uploadResult = await uploadFile(
      file,
      convertedFileName,
      user.id,
      file.type
    );
    console.log("✅ S3 upload completed:", uploadResult.filePath);

    // Create signed download URL
    const { signedUrl } = await createSignedDownloadUrl(
      uploadResult.filePath,
      300
    );
    console.log("✅ Signed URL created");

    // Save to user_files table
    console.log("💾 Saving client-converted file to user_files table");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    const { error: saveFileError } = await supabaseAdmin
      .from("user_files")
      .insert({
        user_id: user.id,
        original_file_name: originalFileName,
        converted_file_name: uploadResult.fileName,
        original_format: originalFormat,
        converted_format: convertedFormat,
        file_path: uploadResult.filePath,
        download_url: signedUrl,
        file_size: uploadResult.fileSize,
        quality: quality,
        status: "ready",
        expires_at: expiresAt.toISOString(),
      });

    if (saveFileError) {
      console.error(
        "❌ Error saving client-converted file to user_files:",
        saveFileError
      );
      return c.json({ error: "Failed to save file to database" }, 500);
    }

    console.log("✅ Client-converted file saved to user_files table");

    // Increment conversion count
    await incrementConversionCount(user.id);
    console.log("✅ Conversion count incremented");

    return c.json({
      message: "Client-converted file saved successfully",
      filePath: uploadResult.filePath,
      downloadUrl: signedUrl,
      fileName: convertedFileName, // Return user-friendly filename (no UUID)
      fileSize: uploadResult.fileSize,
    });
  } catch (error: any) {
    console.error("💥 CLIENT-CONVERTED SAVE ERROR:", error);
    return c.json(
      { error: error.message || "Failed to save client-converted file" },
      500
    );
  }
}
