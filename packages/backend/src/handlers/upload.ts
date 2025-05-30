import { Context } from "hono";
import { join } from "path";
import { mkdir } from "fs/promises";
import { checkConversionLimit } from "../utils/conversion";
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

    console.log(`Uploading file: ${file.name}, size: ${file.size} bytes`);

    const fileName = file.name;
    const uploadsDir = join(process.cwd(), "uploads");

    // Ensure uploads directory exists
    await mkdir(uploadsDir, { recursive: true });

    const filePath = join(uploadsDir, fileName);

    console.log("Writing file to:", filePath);
    await Bun.write(filePath, file);
    console.log("File upload completed successfully");

    return c.json({
      message: "File uploaded successfully",
      filePath: fileName,
      fileName: fileName,
      fileSize: file.size,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return c.json({ error: error.message || "Upload failed" }, 500);
  }
}
