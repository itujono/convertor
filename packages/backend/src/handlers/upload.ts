import { Context } from "hono";
import { checkConversionLimit } from "../utils/conversion";
import { uploadFile, scheduleFileCleanup } from "../utils/aws-storage";
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
      `Uploading file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`
    );

    // Upload file to AWS S3
    const uploadResult = await uploadFile(file, file.name, user.id, file.type);

    console.log("File uploaded to S3 successfully:", uploadResult.filePath);

    // Schedule cleanup of uploaded file after 10 minutes (gives time for conversion)
    scheduleFileCleanup([uploadResult.filePath], 10 * 60 * 1000);

    return c.json({
      message: "File uploaded successfully",
      filePath: uploadResult.filePath,
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      publicUrl: uploadResult.publicUrl,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return c.json({ error: error.message || "Upload failed" }, 500);
  }
}
