import type { Context } from "hono";
import { checkConversionLimit } from "../utils/conversion";
import {
  uploadFile,
  checkFileExists,
  downloadFile,
} from "../utils/aws-storage";
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

    // Verify file is accessible immediately after upload with retry logic
    console.log("🔍 Verifying file accessibility...");
    let verificationSuccess = false;
    const maxVerificationAttempts = 3;

    for (let attempt = 1; attempt <= maxVerificationAttempts; attempt++) {
      try {
        const fileExists = await checkFileExists(uploadResult.filePath);
        if (fileExists) {
          console.log(`✅ File verification successful on attempt ${attempt}`);
          verificationSuccess = true;
          break;
        } else {
          console.warn(`⚠️ File not found on attempt ${attempt}`);
        }
      } catch (verificationError: any) {
        console.error(
          `❌ File verification error on attempt ${attempt}:`,
          verificationError
        );

        // If we get a 400 error, try an alternative verification method
        if (verificationError.$metadata?.httpStatusCode === 400) {
          console.log(
            `🔄 Trying alternative verification method for attempt ${attempt}...`
          );
          try {
            // Try to download just the first byte to verify file exists
            const testBuffer = await downloadFile(uploadResult.filePath);
            if (testBuffer && testBuffer.length > 0) {
              console.log(
                `✅ Alternative verification successful on attempt ${attempt}`
              );
              verificationSuccess = true;
              break;
            }
          } catch (downloadError: any) {
            console.warn(
              `⚠️ Alternative verification also failed:`,
              downloadError.message
            );
          }
        }
      }

      if (attempt < maxVerificationAttempts) {
        const delay = 1000 * attempt; // 1s, 2s, 3s delays
        console.log(
          `⏳ Waiting ${delay}ms before next verification attempt...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!verificationSuccess) {
      console.error(
        "❌ File upload verification failed - file not accessible after upload"
      );
      return c.json(
        {
          error:
            "Upload verification failed: File was uploaded but is not accessible. Please try again.",
        },
        500
      );
    }

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
