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
import * as crypto from "crypto";
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

function getFileTypeCategory(
  format: string
): "image" | "video" | "audio" | "document" {
  const imageFormats = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"];
  const videoFormats = ["mp4", "webm", "avi", "mov", "mkv", "wmv", "flv"];
  const audioFormats = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];

  const lowerFormat = format.toLowerCase();

  if (imageFormats.includes(lowerFormat)) return "image";
  if (videoFormats.includes(lowerFormat)) return "video";
  if (audioFormats.includes(lowerFormat)) return "audio";
  return "document";
}

function calculateSmartTimeout(
  fileSizeBytes: number,
  format: string,
  quality: string
): number {
  const fileType = getFileTypeCategory(format);
  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  const baseTimeouts = {
    image: 30 * 1000, // 30 seconds for images
    audio: 2 * 60 * 1000, // 2 minutes for audio
    video: 5 * 60 * 1000, // 5 minutes for video
    document: 1 * 60 * 1000, // 1 minute for documents
  };

  const sizeMultipliers = {
    image: 2 * 1000, // +2 seconds per MB
    audio: 5 * 1000, // +5 seconds per MB
    video: 15 * 1000, // +15 seconds per MB
    document: 3 * 1000, // +3 seconds per MB
  };

  const qualityMultipliers = {
    low: 0.7,
    medium: 1.0,
    high: 1.5,
  };

  const baseTimeout = baseTimeouts[fileType];
  const sizeTimeout = fileSizeMB * sizeMultipliers[fileType];
  const qualityMultiplier =
    qualityMultipliers[quality as keyof typeof qualityMultipliers] || 1.0;

  const calculatedTimeout = (baseTimeout + sizeTimeout) * qualityMultiplier;

  const minTimeout = 30 * 1000;
  const maxTimeout = 20 * 60 * 1000;

  const finalTimeout = Math.max(
    minTimeout,
    Math.min(calculatedTimeout, maxTimeout)
  );

  console.log(`🕐 Smart timeout calculated:`, {
    fileType,
    fileSizeMB: Math.round(fileSizeMB * 100) / 100,
    quality,
    baseTimeout: baseTimeout / 1000 + "s",
    sizeTimeout: Math.round(sizeTimeout / 1000) + "s",
    qualityMultiplier,
    finalTimeout: Math.round(finalTimeout / 1000) + "s",
  });

  return finalTimeout;
}

function getTimeoutMessage(timeoutMs: number, fileType: string): string {
  const minutes = Math.round(timeoutMs / (60 * 1000));
  const seconds = Math.round(timeoutMs / 1000);

  if (minutes >= 1) {
    return `Conversion timeout after ${minutes} minute${
      minutes > 1 ? "s" : ""
    } - ${fileType} file may be too large or complex. Try reducing file size or quality.`;
  } else {
    return `Conversion timeout after ${seconds} seconds - ${fileType} file may be too large or complex. Try reducing file size or quality.`;
  }
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
    console.log("🔍 Progress lookup:", {
      userId: user.id,
      decodedFilePath,
      progressKey,
      availableKeys: Array.from(conversionProgress.keys()),
    });

    const progress = conversionProgress.get(progressKey);

    if (!progress) {
      console.log("❌ No progress found for key:", progressKey);
      return c.json({ error: "No conversion in progress for this file" }, 404);
    }

    console.log("✅ Progress found:", progress);
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

    console.log("🚀 CONVERSION REQUEST STARTED:", {
      userId: user.id,
      filePath,
      uploadId,
      format,
      quality,
      timestamp: new Date().toISOString(),
    });

    if ((!filePath && !uploadId) || !format) {
      return c.json({ error: "Missing filePath/uploadId or format" }, 400);
    }

    let actualFilePath = filePath;
    let originalFileName: string;

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
        originalFileName = uploadStatus.fileName; // Get original filename from upload status
        console.log(
          `✅ Async upload completed, using filePath: ${actualFilePath}, originalFileName: ${originalFileName}`
        );
      } else {
        throw new Error("Upload status completed but missing fileName");
      }
    } else {
      // For direct uploads, extract original filename from file path
      originalFileName = actualFilePath.split("/").pop() || "file";
    }

    await checkConversionLimit(user.id);
    console.log("✅ Conversion limit check passed");

    progressKey = getProgressKey(user.id, actualFilePath);
    console.log("🔑 Setting progress key:", {
      userId: user.id,
      actualFilePath,
      progressKey,
    });
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

    // S3 consistency check - only needed for async uploads
    let fileExists = true; // Assume file exists for direct uploads

    if (uploadId) {
      // Only do consistency check for async uploads (multipart/large files)
      console.log("🔍 S3 consistency check for async upload...");

      const maxConsistencyAttempts = 2;
      fileExists = false;

      for (let attempt = 1; attempt <= maxConsistencyAttempts; attempt++) {
        try {
          fileExists = await checkFileExists(actualFilePath);
          if (fileExists) {
            console.log(`✅ Async upload file found on attempt ${attempt}`);
            break;
          }
        } catch (error: any) {
          console.error(
            `❌ File existence check error on attempt ${attempt}:`,
            error
          );
        }

        if (attempt < maxConsistencyAttempts) {
          const delay = 1000;
          console.log(`⏳ File not found, waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (!fileExists) {
        console.error(
          "❌ Async upload file does not exist in S3:",
          actualFilePath
        );
        return c.json(
          {
            error: `File not found: The uploaded file could not be found in storage. Please try uploading the file again.`,
          },
          404
        );
      }
    } else {
      // For direct uploads, skip consistency check - file should be immediately available
      console.log(
        "⚡ Skipping S3 consistency check for direct upload (performance optimization)"
      );
    }

    let fileBuffer: Buffer;
    const downloadStartTime = Date.now();

    try {
      console.log("⬇️ Starting S3 download...");
      fileBuffer = await downloadFile(actualFilePath);
      const downloadTime = Date.now() - downloadStartTime;
      console.log(
        `✅ S3 download completed in ${downloadTime}ms, buffer size: ${
          fileBuffer.length
        } bytes (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`
      );
    } catch (downloadError: any) {
      const downloadTime = Date.now() - downloadStartTime;
      console.error(`❌ S3 download failed after ${downloadTime}ms:`, {
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

    // originalFileName is already set above based on upload source
    const baseName = originalFileName.split(".")[0];
    const fileExtension = originalFileName.split(".").pop()?.toLowerCase();
    tempInputPath = join(tempDir, `${Date.now()}_input_${originalFileName}`);
    tempOutputPath = join(
      tempDir,
      `${Date.now()}_output_${baseName}.${format}`
    );

    const writeStartTime = Date.now();
    console.log("📝 Writing temp input file:", tempInputPath);
    await Bun.write(tempInputPath, fileBuffer);
    const writeTime = Date.now() - writeStartTime;
    console.log(`✅ Temp input file written in ${writeTime}ms`);

    const isSvgFile = fileExtension === "svg";

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

    if (isSvgFile) {
      console.log("🎨 Detected SVG file, using FFmpeg for conversion");

      if (!["png", "jpg", "jpeg", "webp"].includes(format.toLowerCase())) {
        throw new Error(
          "SVG files can only be converted to PNG, JPG, JPEG, or WebP formats"
        );
      }

      console.log("🔄 Starting SVG conversion...");
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

        const smartTimeout = calculateSmartTimeout(
          fileBuffer.length,
          format,
          quality
        );
        const conversionTimeout = setTimeout(() => {
          const timeoutMessage = getTimeoutMessage(smartTimeout, "SVG");
          console.error(`❌ SVG conversion timeout: ${timeoutMessage}`);
          reject(new Error(timeoutMessage));
        }, smartTimeout);

        command
          .on("start", (commandLine: string) => {
            console.log("🚀 FFmpeg SVG command started:", commandLine);
            conversionProgress.set(progressKey, {
              progress: 0,
              status: "converting",
            });
          })
          .on("progress", (progress: any) => {
            const percent = Math.round(progress.percent || 0);
            console.log("📊 FFmpeg SVG progress:", percent + "% done");
            conversionProgress.set(progressKey, {
              progress: percent,
              status: "converting",
            });
          })
          .on("end", () => {
            console.log(
              "✅ SVG conversion completed successfully using FFmpeg"
            );
            conversionProgress.set(progressKey, {
              progress: 100,
              status: "uploading",
            });
            clearTimeout(conversionTimeout);
            resolve(null);
          })
          .on("error", (err: any) => {
            console.error("❌ FFmpeg SVG conversion failed:", err);
            conversionProgress.set(progressKey, {
              progress: 0,
              status: "failed",
            });
            clearTimeout(conversionTimeout);
            reject(err);
          })
          .run();
      });
    } else {
      console.log(
        "📁 Non-SVG file detected, starting standard FFmpeg conversion"
      );

      // For video files, let's probe the file first to get metadata
      if (getFileTypeCategory(format) === "video") {
        console.log("🔍 Probing video file for metadata...");
        try {
          await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempInputPath, (err: any, metadata: any) => {
              if (err) {
                console.error("❌ FFprobe error:", err);
                reject(err);
              } else {
                console.log("📊 Video metadata:", {
                  duration: metadata.format?.duration,
                  size: metadata.format?.size,
                  bitRate: metadata.format?.bit_rate,
                  formatName: metadata.format?.format_name,
                  streams: metadata.streams?.length,
                  videoStream: metadata.streams?.find(
                    (s: any) => s.codec_type === "video"
                  ),
                  audioStream: metadata.streams?.find(
                    (s: any) => s.codec_type === "audio"
                  ),
                });
                resolve(metadata);
              }
            });
          });
        } catch (probeError) {
          console.error(
            "⚠️ Video probe failed, continuing anyway:",
            probeError
          );
        }
      }

      console.log("🔄 Starting conversion...");
      console.log("📋 Pre-conversion details:", {
        tempInputPath,
        tempOutputPath,
        format,
        quality,
        fileType: getFileTypeCategory(format),
      });

      await new Promise((resolve, reject) => {
        let command = ffmpeg(tempInputPath).output(tempOutputPath);

        command = applyQualitySettings(command, format, quality);
        console.log("⚙️ Quality settings applied");

        const fileType = getFileTypeCategory(format);
        if (fileType === "video") {
          console.log("🎥 Adding video-specific options...");

          command = command.format(format);

          if (format.toLowerCase() === "mp4") {
            command = command.outputOptions([
              "-movflags",
              "+faststart",
              "-pix_fmt",
              "yuv420p",
            ]);
            console.log("🎥 Added MP4-specific options");
          } else if (format.toLowerCase() === "webm") {
            command = command.outputOptions(["-pix_fmt", "yuv420p"]);
            console.log("🎥 Added WebM-specific options");
          }
        }

        const smartTimeout = calculateSmartTimeout(
          fileBuffer.length,
          format,
          quality
        );
        const conversionTimeout = setTimeout(() => {
          const timeoutMessage = getTimeoutMessage(smartTimeout, fileType);
          console.error(`❌ FFmpeg conversion timeout: ${timeoutMessage}`);
          reject(new Error(timeoutMessage));
        }, smartTimeout);

        console.log("🎬 About to run FFmpeg command...");
        console.log("💾 Memory usage before FFmpeg:", {
          heapUsed:
            Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
          heapTotal:
            Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
          external:
            Math.round(process.memoryUsage().external / 1024 / 1024) + "MB",
        });

        let progressReported = false;
        let lastProgressTime = Date.now();

        command
          .on("start", (commandLine: string) => {
            console.log("🚀 FFmpeg command started:", commandLine);
            console.log("📋 Input file:", tempInputPath);
            console.log("📋 Output file:", tempOutputPath);
            console.log("📋 Format:", format);
            console.log("📋 Quality:", quality);
            console.log("⏰ Conversion started at:", new Date().toISOString());
            conversionProgress.set(progressKey, {
              progress: 0,
              status: "converting",
            });
          })
          .on("progress", (progress: any) => {
            const now = Date.now();
            const timeSinceLastProgress = now - lastProgressTime;
            lastProgressTime = now;

            const percent = Math.round(progress.percent || 0);
            progressReported = true;

            console.log("📊 FFmpeg progress:", {
              percent: percent + "%",
              timemark: progress.timemark,
              currentFps: progress.currentFps,
              currentKbps: progress.currentKbps,
              targetSize: progress.targetSize,
              timeSinceLastUpdate: timeSinceLastProgress + "ms",
            });

            conversionProgress.set(progressKey, {
              progress: percent,
              status: "converting",
            });
          })
          .on("end", () => {
            console.log("✅ FFmpeg conversion completed successfully");
            console.log("⏰ Conversion ended at:", new Date().toISOString());
            console.log("💾 Memory usage after FFmpeg:", {
              heapUsed:
                Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
              heapTotal:
                Math.round(process.memoryUsage().heapTotal / 1024 / 1024) +
                "MB",
              external:
                Math.round(process.memoryUsage().external / 1024 / 1024) + "MB",
            });
            conversionProgress.set(progressKey, {
              progress: 100,
              status: "uploading",
            });
            clearTimeout(conversionTimeout);
            resolve(null);
          })
          .on("error", (err: any) => {
            console.error("❌ FFmpeg error:", err);
            console.error("❌ FFmpeg error details:", {
              message: err.message,
              stack: err.stack,
              code: err.code,
              signal: err.signal,
              progressWasReported: progressReported,
            });
            conversionProgress.set(progressKey, {
              progress: 0,
              status: "failed",
            });
            clearTimeout(conversionTimeout);
            reject(err);
          });

        console.log("🎬 Running FFmpeg command now...");

        try {
          command.run();
          console.log("✅ FFmpeg .run() called successfully");

          // Add a progress check timeout - if no progress is reported within 30 seconds, something is wrong
          setTimeout(() => {
            if (!progressReported) {
              console.error(
                "⚠️ No progress reported within 30 seconds - FFmpeg might be stuck"
              );
              console.error(
                "�� Checking if FFmpeg process is still running..."
              );
            }
          }, 30000);
        } catch (runError) {
          console.error("❌ Error calling FFmpeg .run():", runError);
          throw runError;
        }
      });
    }

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

  console.log("🎛️ Applying quality settings:", {
    format,
    quality,
    isImage,
    isVideo,
    isAudio,
  });

  if (isImage) {
    const options = [
      "-q:v",
      quality === "low" ? "8" : quality === "high" ? "2" : "5",
    ];
    console.log("🖼️ Image quality options:", options);
    switch (quality) {
      case "low":
        return command.outputOptions(["-q:v", "8"]);
      case "high":
        return command.outputOptions(["-q:v", "2"]);
      default: // medium
        return command.outputOptions(["-q:v", "5"]);
    }
  } else if (isVideo) {
    console.log("🎥 Applying video quality settings...");

    // Simplified video settings - let FFmpeg choose codecs automatically
    let options: string[];
    switch (quality) {
      case "low":
        console.log("🎥 Using low quality settings");
        options = ["-crf", "35", "-preset", "ultrafast"];
        console.log("🎥 Low quality options:", options);
        return command.outputOptions(options);
      case "high":
        console.log("🎥 Using high quality settings");
        options = ["-crf", "18", "-preset", "fast"];
        console.log("🎥 High quality options:", options);
        return command.outputOptions(options);
      default: // medium
        console.log("🎥 Using medium quality settings");
        options = ["-crf", "23", "-preset", "fast"];
        console.log("🎥 Medium quality options:", options);
        return command.outputOptions(options);
    }
  } else if (isAudio) {
    const bitrate =
      quality === "low" ? "128k" : quality === "high" ? "320k" : "192k";
    console.log("🎵 Audio quality bitrate:", bitrate);
    switch (quality) {
      case "low":
        return command.audioBitrate("128k");
      case "high":
        return command.audioBitrate("320k");
      default: // medium
        return command.audioBitrate("192k");
    }
  }

  console.log("❓ No specific quality settings applied for format:", format);
  return command; // No specific quality settings for other formats
}
