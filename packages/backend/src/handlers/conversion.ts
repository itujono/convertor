import type { Context } from "hono";
import { join } from "path";
import { mkdir, unlink } from "fs/promises";
import {
  checkConversionLimit,
  checkBatchConversionLimit,
  incrementConversionCount,
} from "../utils/conversion";
import {
  downloadFile,
  uploadConvertedFile,
  createSignedDownloadUrl,
  scheduleFileCleanup,
} from "../utils/aws-storage";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";

const ffmpeg = require("fluent-ffmpeg");

// Try to use system FFmpeg first (for production), fallback to installer (for local dev)
try {
  // Check if system FFmpeg is available
  const { execSync } = require("child_process");
  const systemFfmpegPath = execSync("which ffmpeg", {
    encoding: "utf8",
  }).trim();
  if (systemFfmpegPath) {
    console.log("🎬 Using system FFmpeg:", systemFfmpegPath);
    ffmpeg.setFfmpegPath(systemFfmpegPath);
  } else {
    throw new Error("System FFmpeg not found");
  }
} catch (error) {
  // Fallback to @ffmpeg-installer for local development
  console.log("⚠️ System FFmpeg not found, trying installer package...");
  try {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
    console.log("🎬 Using installer FFmpeg:", ffmpegInstaller.path);
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  } catch (installerError) {
    console.error(
      "❌ Both system and installer FFmpeg failed:",
      error,
      installerError
    );
    throw new Error("FFmpeg not available");
  }
}

const conversionProgress = new Map<
  string,
  { progress: number; status: string }
>();

function getProgressKey(userId: string, filePath: string): string {
  return `${userId}:${filePath}`;
}

export async function checkBatchLimitHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const { fileCount } = await c.req.json();

    if (!fileCount || typeof fileCount !== "number") {
      return c.json({ error: "Invalid file count" }, 400);
    }

    await checkBatchConversionLimit(user.id, fileCount);

    return c.json({
      message: "Batch conversion limit check passed",
      canConvert: true,
    });
  } catch (error: any) {
    console.error("Batch limit check error:", error);
    return c.json({ error: error.message || "Batch limit check failed" }, 500);
  }
}

export async function getConversionProgressHandler(
  c: Context<{ Variables: Variables }>
) {
  try {
    const user = c.get("user");
    const fullPath = c.req.path;
    const filePath = fullPath.replace("/api/convert/progress/", "");

    if (!filePath) {
      return c.json({ error: "File path is required" }, 400);
    }

    const decodedFilePath = decodeURIComponent(filePath);

    const progressKey = getProgressKey(user.id, decodedFilePath);
    const progress = conversionProgress.get(progressKey);

    if (!progress) {
      return c.json({ error: "No conversion in progress for this file" }, 404);
    }

    return c.json(progress);
  } catch (error) {
    console.error("Get conversion progress error:", error);
    return c.json({ error: "Failed to get conversion progress" }, 500);
  }
}

export async function convertHandler(c: Context<{ Variables: Variables }>) {
  let tempInputPath: string | null = null;
  let tempOutputPath: string | null = null;
  let progressKey: string;

  try {
    const user = c.get("user");
    const { filePath, format, quality = "medium" } = await c.req.json();

    if (!filePath || !format) {
      return c.json({ error: "Missing filePath or format" }, 400);
    }

    await checkConversionLimit(user.id);
    console.log("✅ Conversion limit check passed");

    progressKey = getProgressKey(user.id, filePath);
    conversionProgress.set(progressKey, { progress: 0, status: "starting" });

    console.log(
      `Starting conversion for user ${user.id}: ${filePath} -> ${format} (${quality})`
    );

    const tempDir = join(process.cwd(), "temp");
    console.log("📁 Creating temp directory:", tempDir);
    await mkdir(tempDir, { recursive: true });
    console.log("✅ Temp directory created");

    console.log("⬇️ Starting S3 download for:", filePath);
    const fileBuffer = await downloadFile(filePath);
    console.log("✅ S3 download completed, buffer size:", fileBuffer.length);

    const originalFileName = filePath.split("/").pop() || "file";
    const baseName = originalFileName.split(".")[0];
    const fileExtension = originalFileName.split(".").pop()?.toLowerCase();
    tempInputPath = join(tempDir, `${Date.now()}_input_${originalFileName}`);
    tempOutputPath = join(
      tempDir,
      `${Date.now()}_output_${baseName}.${format}`
    );

    console.log("📝 Writing temp input file:", tempInputPath);
    await Bun.write(tempInputPath, fileBuffer);
    console.log("✅ Temp input file written");

    const isSvgFile = fileExtension === "svg";

    if (isSvgFile) {
      console.log("🎨 Detected SVG file, using FFmpeg for conversion");

      if (!["png", "jpg", "jpeg", "webp"].includes(format.toLowerCase())) {
        throw new Error(
          "SVG files can only be converted to PNG, JPG, JPEG, or WebP formats"
        );
      }

      // Use FFmpeg for SVG conversion instead of Sharp
      await new Promise((resolve, reject) => {
        let command = ffmpeg(tempInputPath).output(tempOutputPath);

        if (format.toLowerCase() === "png") {
          command = command.outputOptions(["-f", "png"]);
        } else if (
          format.toLowerCase() === "jpg" ||
          format.toLowerCase() === "jpeg"
        ) {
          command = command.outputOptions(["-f", "image2", "-vcodec", "mjpeg"]);
        } else if (format.toLowerCase() === "webp") {
          command = command.outputOptions(["-f", "webp"]);
        }

        command = applyQualitySettings(command, format, quality);

        const conversionTimeout = setTimeout(() => {
          console.error("❌ SVG conversion timeout after 5 minutes");
          reject(new Error("SVG conversion timeout"));
        }, 5 * 60 * 1000);

        command
          .on("start", (commandLine: string) => {
            console.log("🚀 FFmpeg SVG command started:", commandLine);
          })
          .on("end", () => {
            console.log(
              "✅ SVG conversion completed successfully using FFmpeg"
            );
            clearTimeout(conversionTimeout);
            resolve(null);
          })
          .on("error", (err: any) => {
            console.error("❌ FFmpeg SVG conversion failed:", err);
            clearTimeout(conversionTimeout);
            reject(err);
          })
          .run();
      });
    } else {
      // Test FFmpeg with a simple probe command first (only for non-SVG files)
      console.log("🧪 Testing FFmpeg with probe command...");
      try {
        await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(tempInputPath, (err: any, metadata: any) => {
            if (err) {
              console.error("❌ FFmpeg probe failed:", err);
              reject(err);
            } else {
              console.log(
                "✅ FFmpeg probe successful, file duration:",
                metadata.format.duration
              );
              resolve(null);
            }
          });
        });
      } catch (testError: any) {
        console.error(
          "❌ FFmpeg probe failed, aborting conversion:",
          testError
        );
        throw new Error(`FFmpeg probe failed: ${testError.message}`);
      }
    }

    console.log("💾 Logging conversion to database");
    const { error: conversionError } = await supabaseAdmin
      .from("conversions")
      .insert({
        user_id: user.id,
        file_name: originalFileName,
        status: "pending",
      });

    if (conversionError) {
      console.error("❌ Error logging conversion:", conversionError);
    } else {
      console.log("✅ Conversion logged to database");
    }

    console.log("🎬 FFmpeg path:", ffmpeg.getFfmpegPath());

    console.log("🔄 Starting conversion...");

    await new Promise((resolve, reject) => {
      let command = ffmpeg(tempInputPath).output(tempOutputPath);

      command = applyQualitySettings(command, format, quality);
      console.log("⚙️ Quality settings applied");

      const conversionTimeout = setTimeout(() => {
        console.error("❌ FFmpeg conversion timeout after 5 minutes");
        reject(
          new Error("Conversion timeout - file may be too large or complex")
        );
      }, 5 * 60 * 1000);

      command
        .on("start", (commandLine: string) => {
          console.log("🚀 FFmpeg command started:", commandLine);
          conversionProgress.set(progressKey, {
            progress: 0,
            status: "converting",
          });
        })
        .on("progress", (progress: any) => {
          const percent = Math.round(progress.percent || 0);
          console.log("📊 FFmpeg progress:", percent + "% done");
          conversionProgress.set(progressKey, {
            progress: percent,
            status: "converting",
          });
        })
        .on("end", () => {
          console.log("✅ FFmpeg conversion completed successfully");
          conversionProgress.set(progressKey, {
            progress: 100,
            status: "uploading",
          });
          clearTimeout(conversionTimeout);
          resolve(null);
        })
        .on("error", (err: any) => {
          console.error("❌ FFmpeg error:", err);
          conversionProgress.set(progressKey, {
            progress: 0,
            status: "failed",
          });
          clearTimeout(conversionTimeout);
          reject(err);
        })
        .run();
    });

    console.log("⬆️ Starting S3 upload of converted file");
    const uploadResult = await uploadConvertedFile(
      tempOutputPath,
      user.id,
      originalFileName,
      format
    );
    console.log("✅ S3 upload completed:", uploadResult.filePath);

    console.log("🔗 Creating signed download URL");
    const { signedUrl } = await createSignedDownloadUrl(
      uploadResult.filePath,
      300
    );
    console.log("✅ Signed URL created");

    console.log("💾 Saving to user_files table");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    const { error: saveFileError } = await supabaseAdmin
      .from("user_files")
      .insert({
        user_id: user.id,
        original_file_name: originalFileName,
        converted_file_name: uploadResult.fileName,
        original_format:
          originalFileName.split(".").pop()?.toLowerCase() || "unknown",
        converted_format: format,
        file_path: uploadResult.filePath,
        download_url: signedUrl,
        file_size: uploadResult.fileSize,
        quality: quality,
        status: "ready",
        expires_at: expiresAt.toISOString(),
      });

    if (saveFileError) {
      console.error("❌ Error saving file to user_files:", saveFileError);
      // Don't fail the conversion, just log the error
    } else {
      console.log("✅ File saved to user_files table");
    }

    // Schedule cleanup of converted file after 24 hours (matching database expiration)
    scheduleFileCleanup([uploadResult.filePath], 24 * 60 * 60 * 1000);

    console.log("📝 Updating conversion status to completed");
    const { error: updateError } = await supabaseAdmin
      .from("conversions")
      .update({ status: "completed" })
      .eq("user_id", user.id)
      .eq("file_name", originalFileName)
      .eq("status", "pending");

    if (updateError) {
      console.error("❌ Error updating conversion status:", updateError);
    } else {
      console.log("✅ Conversion status updated");
    }

    await incrementConversionCount(user.id);
    console.log("✅ Conversion count incremented");

    console.log("🎉 Conversion process completed successfully");

    // Clean up progress tracking
    conversionProgress.delete(progressKey);

    return c.json({
      message: "Conversion completed successfully",
      outputPath: uploadResult.filePath,
      downloadUrl: signedUrl,
    });
  } catch (error: any) {
    console.error("💥 CONVERSION ERROR:", error);

    // Clean up progress tracking on error (only if progressKey was set)
    try {
      if (progressKey!) {
        conversionProgress.delete(progressKey);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    try {
      const { filePath } = await c.req.json().catch(() => ({}));
      if (filePath) {
        const user = c.get("user");
        const originalFileName = filePath.split("/").pop() || "file";
        await supabaseAdmin
          .from("conversions")
          .update({ status: "failed" })
          .eq("user_id", user.id)
          .eq("file_name", originalFileName)
          .eq("status", "pending");
      }
    } catch (dbError) {
      console.error("Error updating failed conversion status:", dbError);
    }

    return c.json({ error: error.message || "Conversion failed" }, 500);
  } finally {
    try {
      if (tempInputPath) {
        await unlink(tempInputPath);
      }
      if (tempOutputPath) {
        await unlink(tempOutputPath);
      }
    } catch (cleanupError) {
      console.error("Error cleaning up temporary files:", cleanupError);
    }
  }
}

function applyQualitySettings(
  command: any,
  format: string,
  quality: string
): any {
  const isImage = ["jpg", "jpeg", "png", "webp", "svg"].includes(
    format.toLowerCase()
  );
  const isVideo = ["mp4", "webm", "avi", "mov"].includes(format.toLowerCase());
  const isAudio = ["mp3", "wav", "ogg", "m4a"].includes(format.toLowerCase());

  if (isImage) {
    switch (quality) {
      case "low":
        return command.outputOptions(["-q:v", "8"]); // Lower quality
      case "high":
        return command.outputOptions(["-q:v", "2"]); // Higher quality
      default: // medium
        return command.outputOptions(["-q:v", "5"]); // Medium quality
    }
  } else if (isVideo) {
    switch (quality) {
      case "low":
        return command.outputOptions(["-crf", "35", "-preset", "fast"]);
      case "high":
        return command.outputOptions(["-crf", "18", "-preset", "slow"]);
      default: // medium
        return command.outputOptions(["-crf", "23", "-preset", "medium"]);
    }
  } else if (isAudio) {
    switch (quality) {
      case "low":
        return command.audioBitrate("128k");
      case "high":
        return command.audioBitrate("320k");
      default: // medium
        return command.audioBitrate("192k");
    }
  }

  return command; // No specific quality settings for other formats
}
