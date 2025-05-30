import { Context } from "hono";
import { join } from "path";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import {
  downloadFile,
  uploadFile,
  createSignedDownloadUrl,
  scheduleFileCleanup,
} from "../utils/aws-storage";
import type { Variables } from "../utils/types";

const archiver = require("archiver");

export async function downloadHandler(c: Context<{ Variables: Variables }>) {
  try {
    const filename = c.req.param("filename");

    // Create signed download URL for the file
    const { signedUrl } = await createSignedDownloadUrl(filename, 300); // 5 minutes

    // Redirect to the signed URL
    return c.redirect(signedUrl);
  } catch (error) {
    console.error("Download error:", error);
    return c.json({ error: "Download failed" }, 500);
  }
}

export async function downloadZipHandler(c: Context<{ Variables: Variables }>) {
  let tempZipPath: string | null = null;

  try {
    const user = c.get("user");
    const { filePaths } = await c.req.json();

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return c.json({ error: "No files specified" }, 400);
    }

    console.log(
      `Creating zip for user ${user.id} with ${filePaths.length} files`
    );

    const tempDir = join(process.cwd(), "temp");
    await mkdir(tempDir, { recursive: true });

    const zipFileName = `converted_files_${Date.now()}.zip`;
    tempZipPath = join(tempDir, zipFileName);

    // Create zip archive
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(tempZipPath!);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        console.log(`Zip archive created: ${archive.pointer()} total bytes`);
        resolve();
      });
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      // Download each file from S3 and add to archive
      const downloadPromises = filePaths.map(async (filePath: string) => {
        try {
          const fileBuffer = await downloadFile(filePath);
          const fileName = filePath.split("/").pop() || "file";
          archive.append(fileBuffer, { name: fileName });
        } catch (error) {
          console.warn(`Could not add file ${filePath} to zip:`, error);
        }
      });

      Promise.all(downloadPromises)
        .then(() => {
          archive.finalize();
        })
        .catch(reject);
    });

    // Upload zip file to S3
    const zipBuffer = await Bun.file(tempZipPath).arrayBuffer();
    const uploadResult = await uploadFile(
      new Uint8Array(zipBuffer),
      zipFileName,
      user.id,
      "application/zip"
    );

    // Create signed download URL for the zip
    const { signedUrl } = await createSignedDownloadUrl(
      uploadResult.filePath,
      600
    ); // 10 minutes

    // Schedule cleanup of zip file after 10 minutes
    scheduleFileCleanup([uploadResult.filePath], 10 * 60 * 1000);

    console.log("Zip file created and uploaded successfully");

    return c.json({
      message: "Zip file created successfully",
      downloadUrl: signedUrl,
      fileName: zipFileName,
      fileSize: uploadResult.fileSize,
    });
  } catch (error) {
    console.error("Zip download error:", error);
    return c.json({ error: "Zip download failed" }, 500);
  } finally {
    // Clean up temporary zip file
    if (tempZipPath) {
      try {
        await unlink(tempZipPath);
      } catch (cleanupError) {
        console.error("Error cleaning up temporary zip file:", cleanupError);
      }
    }
  }
}
