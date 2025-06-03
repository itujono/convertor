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

    const { signedUrl } = await createSignedDownloadUrl(filename, 300); // 5 minutes

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
      `Creating zip for user ${user.id} with ${filePaths.length} files:`
    );
    console.log("File paths:", filePaths);

    const tempDir = join(process.cwd(), "temp");
    await mkdir(tempDir, { recursive: true });

    const zipFileName = `converted_files_${Date.now()}.zip`;
    tempZipPath = join(tempDir, zipFileName);

    await new Promise<void>(async (resolve, reject) => {
      const output = createWriteStream(tempZipPath!);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        console.log(`Zip archive created: ${archive.pointer()} total bytes`);
        resolve();
      });
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      // Download and append files sequentially to avoid race conditions
      let successfulFiles = 0;
      for (const filePath of filePaths) {
        try {
          console.log(`Downloading file: ${filePath}`);
          const fileBuffer = await downloadFile(filePath);
          const fileName = filePath.split("/").pop() || "file";

          console.log(
            `Adding file to zip: ${fileName} (${fileBuffer.length} bytes)`
          );
          archive.append(fileBuffer, { name: fileName });
          successfulFiles++;
        } catch (error) {
          console.warn(`Could not add file ${filePath} to zip:`, error);
        }
      }

      console.log(
        `Successfully added ${successfulFiles}/${filePaths.length} files to zip`
      );

      archive.finalize();
    });

    const zipStats = await Bun.file(tempZipPath).size;
    console.log(`Local zip file size: ${zipStats} bytes`);

    const zipBuffer = await Bun.file(tempZipPath).arrayBuffer();
    console.log(`Streaming zip buffer size: ${zipBuffer.byteLength} bytes`);

    console.log("Streaming zip file directly to client");

    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="${zipFileName}"`);
    c.header("Content-Length", zipBuffer.byteLength.toString());

    return c.body(new Uint8Array(zipBuffer));
  } catch (error) {
    console.error("Zip download error:", error);
    return c.json({ error: "Zip download failed" }, 500);
  } finally {
    if (tempZipPath) {
      try {
        await unlink(tempZipPath);
      } catch (cleanupError) {
        console.error("Error cleaning up temporary zip file:", cleanupError);
      }
    }
  }
}
