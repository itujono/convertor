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
  checkFileExists,
} from "../utils/aws-storage";
import { getUploadStatus } from "../utils/async-s3-upload";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";
import crypto from "crypto";

const ffmpeg = require("fluent-ffmpeg");

let ffmpegPath: string | null = null;

// Try to use system FFmpeg first (for production), fallback to installer (for local dev)
try {
  // Check if system FFmpeg is available
  const { execSync } = require("child_process");
  const systemFfmpegPath = execSync("which ffmpeg", {
    encoding: "utf8",
  }).trim();
  if (systemFfmpegPath) {
    ffmpegPath = systemFfmpegPath;
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
    ffmpegPath = ffmpegInstaller.path;
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
    const {
      filePath,
      uploadId,
      format,
      quality = "medium",
    } = await c.req.json();

    if ((!filePath && !uploadId) || !format) {
      return c.json({ error: "Missing filePath/uploadId or format" }, 400);
    }

    let actualFilePath = filePath;

    // If uploadId is provided, check if the async upload is completed
    if (uploadId) {
      console.log(`🔍 Checking async upload status for: ${uploadId}`);

      const uploadStatus = getUploadStatus(uploadId);

      if (!uploadStatus) {
        return c.json({ error: "Upload not found" }, 404);
      }

      if (
        uploadStatus.status === "pending" ||
        uploadStatus.status === "uploading"
      ) {
        return c.json(
          {
            error: "Upload still in progress",
            status: uploadStatus.status,
            message: "Please wait for the upload to complete before converting",
          },
          202
        );
      }

      if (uploadStatus.status === "failed") {
        return c.json(
          {
            error: "Upload failed",
            details: uploadStatus.error,
          },
          400
        );
      }

      if (uploadStatus.status === "completed") {
        if (!uploadStatus.s3FilePath) {
          return c.json(
            {
              error: "Upload completed but S3 file path not available",
            },
            500
          );
        }

        actualFilePath = uploadStatus.s3FilePath;
        console.log(
          `✅ Async upload completed, using filePath: ${actualFilePath}`
        );
      }
    }

    await checkConversionLimit(user.id);
    console.log("✅ Conversion limit check passed");

    progressKey = getProgressKey(user.id, actualFilePath);
    conversionProgress.set(progressKey, { progress: 0, status: "starting" });

    console.log(
      `Starting conversion for user ${user.id}: ${actualFilePath} -> ${format} (${quality})`
    );

    const tempDir = join(process.cwd(), "temp");
    console.log("📁 Creating temp directory:", tempDir);
    await mkdir(tempDir, { recursive: true });
    console.log("✅ Temp directory created");

    console.log("⬇️ Starting S3 download for:", actualFilePath);
    console.log("📋 S3 Key details:", {
      key: actualFilePath,
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION,
    });

    // Quick S3 consistency check with reduced attempts
    console.log("🔍 Quick S3 file existence check...");

    let fileExists = false;
    const maxConsistencyAttempts = 2; // Reduced from 5 to 2

    for (let attempt = 1; attempt <= maxConsistencyAttempts; attempt++) {
      try {
        fileExists = await checkFileExists(actualFilePath);
        if (fileExists) {
          console.log(`✅ File found on attempt ${attempt}`);
          break;
        }
      } catch (error: any) {
        console.error(
          `❌ File existence check error on attempt ${attempt}:`,
          error
        );
      }

      if (attempt < maxConsistencyAttempts) {
        const delay = 1000; // Fixed 1 second delay instead of exponential
        console.log(`⏳ File not found, waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!fileExists) {
      console.error("❌ File does not exist in S3:", actualFilePath);
      return c.json(
        {
          error: `File not found: The uploaded file could not be found in storage. Please try uploading the file again.`,
        },
        404
      );
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFile(actualFilePath);
      console.log("✅ S3 download completed, buffer size:", fileBuffer.length);
    } catch (downloadError: any) {
      console.error("❌ S3 download failed:", {
        error: downloadError.message,
        filePath: actualFilePath,
        errorCode: downloadError.Code || downloadError.code,
        errorName: downloadError.name,
      });

      if (
        downloadError.name === "NoSuchKey" ||
        downloadError.Code === "NoSuchKey"
      ) {
        return c.json(
          {
            error: `File not found: The uploaded file could not be found in storage. This may happen if there was an upload issue or the file was already processed. Please try uploading the file again.`,
          },
          404
        );
      }

      throw downloadError; // Re-throw other S3 errors
    }

    const originalFileName = actualFilePath.split("/").pop() || "file";
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
          console.error("❌ SVG conversion timeout after 2 minutes");
          reject(new Error("SVG conversion timeout"));
        }, 2 * 60 * 1000); // Reduced from 5 minutes to 2 minutes

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
      console.log(
        "📁 Non-SVG file detected, proceeding with direct conversion"
      );
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

    console.log("🎬 FFmpeg path:", ffmpegPath);

    console.log("🔄 Starting conversion...");

    await new Promise((resolve, reject) => {
      let command = ffmpeg(tempInputPath).output(tempOutputPath);

      command = applyQualitySettings(command, format, quality);
      console.log("⚙️ Quality settings applied");

      const conversionTimeout = setTimeout(() => {
        console.error("❌ FFmpeg conversion timeout after 2 minutes");
        reject(
          new Error("Conversion timeout - file may be too large or complex")
        );
      }, 2 * 60 * 1000); // Reduced from 5 minutes to 2 minutes

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

    // Create user-friendly filename for display (consistent with client-side)
    const fileBaseName = originalFileName.split(".").slice(0, -1).join(".");
    const displayFileName = `${fileBaseName}_converted.${format}`;

    return c.json({
      message: "Conversion completed successfully",
      outputPath: uploadResult.filePath,
      downloadUrl: signedUrl,
      fileName: displayFileName, // User-friendly filename (no UUID)
      fileSize: uploadResult.fileSize,
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
        return command.outputOptions(["-q:v", "8"]);
      case "high":
        return command.outputOptions(["-q:v", "2"]);
      default: // medium
        return command.outputOptions(["-q:v", "5"]);
    }
  } else if (isVideo) {
    switch (quality) {
      case "low":
        return command.outputOptions(["-crf", "35", "-preset", "ultrafast"]);
      case "high":
        return command.outputOptions(["-crf", "18", "-preset", "fast"]); // Changed from slow to fast
      default: // medium
        return command.outputOptions(["-crf", "23", "-preset", "fast"]); // Changed from medium to fast
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
