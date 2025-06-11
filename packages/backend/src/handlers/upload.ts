import type { Context } from "hono";
import { checkConversionLimit } from "../utils/conversion";
import { uploadFile } from "../utils/aws-storage";
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

    const uploadResult = await uploadFile(file, file.name, user.id, file.type);

    console.log("File uploaded to S3 successfully:", uploadResult.filePath);

    // Don't schedule immediate cleanup - files will be cleaned up after conversion
    // or by the expired files cleanup job

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
