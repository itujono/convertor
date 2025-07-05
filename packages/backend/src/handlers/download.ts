import type { Context } from "hono";
import { join } from "path";
import { createWriteStream, createReadStream, existsSync } from "fs";
import { mkdir, unlink, stat } from "fs/promises";
import { downloadFile, createSignedDownloadUrl } from "../utils/aws-storage";
import type { Variables } from "../utils/types";
import archiver from "archiver";
import crypto from "crypto";

const zipCache = new Map<
  string,
  {
    filePath: string;
    createdAt: number;
    filePaths: string[];
    size: number;
  }
>();

// Clean up expired cache entries (run every hour)
setInterval(
  () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [key, value] of zipCache.entries()) {
      if (now - value.createdAt > oneHour) {
        zipCache.delete(key);

        unlink(value.filePath).catch((err) => {
          console.warn(
            `Failed to delete expired cached ZIP: ${value.filePath}`,
            err
          );
        });
      }
    }
  },
  60 * 60 * 1000
); // 1 hour

function generateCacheKey(filePaths: string[]): string {
  const sortedPaths = [...filePaths].sort();
  const pathsString = sortedPaths.join("|");
  return crypto.createHash("sha256").update(pathsString).digest("hex");
}

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
  let shouldCleanupTemp = true;

  try {
    console.log("🗜️ ZIP DOWNLOAD REQUEST RECEIVED");
    const user = c.get("user");
    console.log("👤 User ID:", user.id);

    const requestBody = await c.req.json();
    console.log("📦 Request body:", requestBody);

    const { filePaths } = requestBody;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      console.log("❌ Invalid filePaths:", filePaths);
      return c.json({ error: "No files specified" }, 400);
    }

    // Generate cache key for this set of files
    const cacheKey = generateCacheKey(filePaths);
    console.log("🔑 Cache key:", cacheKey);

    // Check if we have a cached ZIP for these files
    const cachedZip = zipCache.get(cacheKey);
    if (cachedZip && existsSync(cachedZip.filePath)) {
      try {
        const stats = await stat(cachedZip.filePath);
        const cacheAge = Date.now() - cachedZip.createdAt;
        const maxAge = 60 * 60 * 1000; // 1 hour

        if (cacheAge < maxAge && stats.size > 0) {
          console.log(
            `✅ Found cached ZIP (${Math.round(cacheAge / 1000)}s old, ${
              stats.size
            } bytes)`
          );

          // Stream the cached file directly instead of loading into memory
          const fileStream = createReadStream(cachedZip.filePath);
          const zipFileName = `converted_files_${Date.now()}.zip`;

          c.header("Content-Type", "application/zip");
          c.header(
            "Content-Disposition",
            `attachment; filename="${zipFileName}"`
          );
          c.header("Content-Length", stats.size.toString());

          // Convert Node.js ReadStream to Web ReadableStream for Hono
          const webStream = new ReadableStream({
            start(controller) {
              fileStream.on("data", (chunk: string | Buffer) => {
                const buffer =
                  typeof chunk === "string" ? Buffer.from(chunk) : chunk;
                controller.enqueue(
                  new Uint8Array(
                    buffer.buffer,
                    buffer.byteOffset,
                    buffer.byteLength
                  )
                );
              });

              fileStream.on("end", () => {
                controller.close();
              });

              fileStream.on("error", (error) => {
                console.error("File stream error:", error);
                controller.error(error);
              });
            },
            cancel() {
              fileStream.destroy();
            },
          });

          return c.body(webStream);
        } else {
          console.log("🗑️ Cached ZIP is too old or empty, removing from cache");
          zipCache.delete(cacheKey);
          unlink(cachedZip.filePath).catch(() => {}); // Ignore errors
        }
      } catch (cacheError) {
        console.warn(
          "⚠️ Error reading cached ZIP, will create new one:",
          cacheError
        );
        zipCache.delete(cacheKey);
      }
    }

    console.log(
      `🗜️ Creating new zip for user ${user.id} with ${filePaths.length} files:`
    );
    console.log("📁 File paths:", filePaths);

    const tempDir = join(process.cwd(), "temp");
    await mkdir(tempDir, { recursive: true });

    const zipFileName = `zip_cache_${cacheKey}.zip`;
    tempZipPath = join(tempDir, zipFileName);

    await new Promise<void>(async (resolve, reject) => {
      const output = createWriteStream(tempZipPath!);
      // Use faster compression level (6 instead of 9) for better speed vs size tradeoff
      const archive = archiver("zip", { zlib: { level: 6 } });

      let isStreamClosed = false;

      output.on("close", () => {
        if (!isStreamClosed) {
          isStreamClosed = true;
          console.log(`Zip archive created: ${archive.pointer()} total bytes`);
          resolve();
        }
      });

      output.on("error", (err: Error) => {
        if (!isStreamClosed) {
          isStreamClosed = true;
          reject(err);
        }
      });

      archive.on("error", (err: Error) => {
        if (!isStreamClosed) {
          isStreamClosed = true;
          reject(err);
        }
      });

      archive.on("warning", (err: any) => {
        if (err.code === "ENOENT") {
          console.warn("Archive warning:", err);
        } else {
          if (!isStreamClosed) {
            isStreamClosed = true;
            reject(err);
          }
        }
      });

      archive.pipe(output);

      try {
        // Download files in parallel for better performance
        const downloadPromises = filePaths.map(async (filePath) => {
          try {
            console.log(`Downloading file: ${filePath}`);
            const fileBuffer = await downloadFile(filePath);
            // Extract meaningful filename from path
            const fileName = filePath.split("/").pop() || "file";
            console.log(
              `📄 Extracted filename: ${fileName} from path: ${filePath}`
            );
            return { fileName, fileBuffer, filePath };
          } catch (error) {
            console.warn(`Could not download file ${filePath}:`, error);
            return null;
          }
        });

        const results = await Promise.allSettled(downloadPromises);
        let successfulFiles = 0;

        // Add successfully downloaded files to archive
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            const { fileName, fileBuffer } = result.value;
            console.log(
              `Adding file to zip: ${fileName} (${fileBuffer.length} bytes)`
            );
            archive.append(fileBuffer, { name: fileName });
            successfulFiles++;
          }
        }

        console.log(
          `Successfully added ${successfulFiles}/${filePaths.length} files to zip`
        );

        await archive.finalize();
      } catch (error) {
        if (!isStreamClosed) {
          isStreamClosed = true;
          reject(error);
        }
      }
    });

    const zipStats = await stat(tempZipPath);
    console.log(`New zip file size: ${zipStats.size} bytes`);

    zipCache.set(cacheKey, {
      filePath: tempZipPath,
      createdAt: Date.now(),
      filePaths: [...filePaths],
      size: zipStats.size,
    });

    shouldCleanupTemp = false;
    console.log("💾 ZIP file cached for future requests");

    // Stream the newly created file directly instead of loading into memory
    const fileStream = createReadStream(tempZipPath);
    const finalZipFileName = `converted_files_${Date.now()}.zip`;

    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="${finalZipFileName}"`
    );
    c.header("Content-Length", zipStats.size.toString());

    // Convert Node.js ReadStream to Web ReadableStream for Hono
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk: string | Buffer) => {
          const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(
            new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
          );
        });

        fileStream.on("end", () => {
          console.log("✅ Zip file streaming completed");
          controller.close();
        });

        fileStream.on("error", (error) => {
          console.error("File stream error:", error);
          controller.error(error);
        });
      },
      cancel() {
        console.log("🛑 Stream cancelled, cleaning up file stream");
        fileStream.destroy();
      },
    });

    return c.body(webStream);
  } catch (error) {
    console.error("Zip download error:", error);
    return c.json({ error: "Zip download failed" }, 500);
  } finally {
    if (tempZipPath && shouldCleanupTemp) {
      try {
        await unlink(tempZipPath);
      } catch (cleanupError) {
        console.error("Error cleaning up temporary zip file:", cleanupError);
      }
    }
  }
}
