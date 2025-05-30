import { Context } from "hono";
import { join } from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";

const archiver = require("archiver");

export async function downloadHandler(c: Context) {
  try {
    const filename = c.req.param("filename");
    const filePath = join(process.cwd(), "uploads", filename);

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return c.json({ error: "File not found" }, 404);
    }

    return new Response(file);
  } catch (error) {
    console.error("Download error:", error);
    return c.json({ error: "Download failed" }, 500);
  }
}

export async function downloadZipHandler(c: Context) {
  try {
    const { fileNames } = await c.req.json();

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return c.json({ error: "No files specified" }, 400);
    }

    const uploadsDir = join(process.cwd(), "uploads");
    const zipFileName = `converted_files_${Date.now()}.zip`;
    const zipPath = join(uploadsDir, zipFileName);

    // Ensure uploads directory exists
    await mkdir(uploadsDir, { recursive: true });

    // Create zip archive
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      // Add each file to the archive
      for (const fileName of fileNames) {
        const filePath = join(uploadsDir, fileName);
        try {
          archive.file(filePath, { name: fileName });
        } catch (error) {
          console.warn(`Could not add file ${fileName} to zip:`, error);
        }
      }

      archive.finalize();
    });

    // Return the zip file
    const zipFile = Bun.file(zipPath);
    if (!(await zipFile.exists())) {
      return c.json({ error: "Failed to create zip file" }, 500);
    }

    // Set appropriate headers for zip download
    return new Response(zipFile, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
      },
    });
  } catch (error) {
    console.error("Zip download error:", error);
    return c.json({ error: "Zip download failed" }, 500);
  }
}
