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
let hasVideoToolbox = false;

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

    // Check for VideoToolbox hardware acceleration
    try {
      const encoders = execSync("ffmpeg -hide_banner -encoders 2>/dev/null", {
        encoding: "utf8",
      });
      hasVideoToolbox = encoders.includes("h264_videotoolbox");
      console.log(
        "🔧 Hardware acceleration (VideoToolbox):",
        hasVideoToolbox ? "Available" : "Not available"
      );
    } catch (error) {
      console.log("⚠️ Could not check for hardware acceleration");
    }
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
    // Note: @ffmpeg-installer usually doesn't include VideoToolbox
    hasVideoToolbox = false;
    console.log(
      "🔧 Hardware acceleration (VideoToolbox): Not available in installer package"
    );
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
    video: 2 * 60 * 1000, // Reduced from 5 to 2 minutes for hardware-accelerated video
    document: 1 * 60 * 1000, // 1 minute for documents
  };

  const sizeMultipliers = {
    image: 2 * 1000, // +2 seconds per MB
    audio: 5 * 1000, // +5 seconds per MB
    video: 4 * 1000, // Reduced from 10 to 4 seconds per MB with hardware acceleration
    document: 3 * 1000, // +3 seconds per MB
  };

  const qualityMultipliers = {
    low: 0.6, // Even faster for low quality
    medium: 1.0,
    high: 1.3, // Reduced from 1.5 to 1.3
  };

  // Video format complexity multipliers (updated for hardware acceleration)
  const formatMultipliers = {
    webm: 1.1, // Reduced from 1.2 - VP9 optimizations
    mp4: 0.8, // Much faster with VideoToolbox hardware acceleration
    avi: 1.2, // Reduced from 1.3
    mov: 1.0, // Reduced from 1.1
  };

  const baseTimeout = baseTimeouts[fileType];
  const sizeTimeout = fileSizeMB * sizeMultipliers[fileType];
  const qualityMultiplier =
    qualityMultipliers[quality as keyof typeof qualityMultipliers] || 1.0;

  // Apply format-specific multiplier for videos
  const formatMultiplier =
    fileType === "video"
      ? formatMultipliers[
          format.toLowerCase() as keyof typeof formatMultipliers
        ] || 1.0
      : 1.0;

  const calculatedTimeout =
    (baseTimeout + sizeTimeout) * qualityMultiplier * formatMultiplier;

  const minTimeout = 30 * 1000;
  const maxTimeout = 10 * 60 * 1000; // Reduced from 20 to 10 minutes max

  const finalTimeout = Math.max(
    minTimeout,
    Math.min(calculatedTimeout, maxTimeout)
  );

  console.log(`🕐 Optimized timeout calculated:`, {
    fileType,
    fileSizeMB: Math.round(fileSizeMB * 100) / 100,
    quality,
    format,
    baseTimeout: baseTimeout / 1000 + "s",
    sizeTimeout: Math.round(sizeTimeout / 1000) + "s",
    qualityMultiplier,
    formatMultiplier,
    finalTimeout: Math.round(finalTimeout / 1000) + "s",
    hardwareAccelerated:
      format.toLowerCase() === "mp4" ? "VideoToolbox" : "Software",
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

      console.log("🔄 Starting optimized conversion...");
      console.log("📋 Pre-conversion details:", {
        tempInputPath,
        tempOutputPath,
        format,
        quality,
        fileType: getFileTypeCategory(format),
      });

      await new Promise((resolve, reject) => {
        let command = ffmpeg(tempInputPath).output(tempOutputPath);

        // Apply quality settings first for optimal codec selection
        command = applyQualitySettings(command, format, quality);
        console.log("⚙️ Optimized quality settings applied");

        const fileType = getFileTypeCategory(format);
        if (fileType === "video") {
          console.log("🎥 Adding video-specific optimizations...");

          // Ensure format is set
          command = command.format(format);

          // Add format-specific optimizations for speed
          if (format.toLowerCase() === "mp4") {
            command = command.outputOptions([
              "-movflags",
              "+faststart", // Optimize for web streaming
              "-pix_fmt",
              "yuv420p", // Standard pixel format
              "-threads",
              "0", // Use all available CPU cores
              "-tune",
              "zerolatency", // x264-specific optimization for speed
            ]);
            console.log("🎥 Added MP4 web-streaming and x264 optimizations");
          } else if (format.toLowerCase() === "webm") {
            // WebM-specific optimizations (VP8/VP9 compatible)
            command = command.outputOptions([
              "-pix_fmt",
              "yuv420p", // Standard pixel format for VP8/VP9
              "-auto-alt-ref",
              "1", // Better compression
              "-lag-in-frames",
              "16", // Look ahead for better quality
              "-threads",
              "0", // Use all available CPU cores
            ]);
            console.log("🎥 Added WebM VP8/VP9 optimizations");
          } else {
            // Generic video optimizations for other formats
            command = command.outputOptions([
              "-threads",
              "0", // Use all available CPU cores
            ]);
            console.log("🎥 Added generic video multi-threading optimization");
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
        let ffmpegProcess: any = null;
        let progressSimulator: NodeJS.Timeout | null = null;

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

            // Clear the progress simulator once real progress starts
            if (progressSimulator) {
              clearInterval(progressSimulator);
            }
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
            if (progressSimulator) {
              clearInterval(progressSimulator);
            }
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
            if (progressSimulator) {
              clearInterval(progressSimulator);
            }
            clearTimeout(conversionTimeout);
            reject(err);
          });

        console.log("🎬 Running FFmpeg command now...");

        try {
          // Add debug logging for the command before execution
          console.log("🔍 FFmpeg command details:", {
            input: tempInputPath,
            output: tempOutputPath,
            format: format,
            quality: quality,
          });

          // Basic validation
          if (!tempInputPath || !tempOutputPath) {
            throw new Error("Temp file paths are null");
          }

          // Start a simple progress simulator to ensure progress tracking works
          let simulatedProgress = 0;
          progressSimulator = setInterval(() => {
            if (simulatedProgress < 95) {
              simulatedProgress += 5;
              conversionProgress.set(progressKey, {
                progress: simulatedProgress,
                status: "converting",
              });
              console.log(`🔄 Simulated progress: ${simulatedProgress}%`);
            }
          }, 2000);

          // Store reference to kill process if needed
          ffmpegProcess = command.run();
          console.log("✅ FFmpeg .run() called successfully");

          // Enhanced timeout with process killing
          const conversionTimeout = setTimeout(() => {
            console.error("⚠️ FFmpeg timeout - killing process");
            if (progressSimulator) {
              clearInterval(progressSimulator);
            }

            // Try to kill the FFmpeg process
            try {
              if (ffmpegProcess && ffmpegProcess.kill) {
                ffmpegProcess.kill("SIGKILL");
                console.log("🔪 FFmpeg process killed");
              }
            } catch (killError) {
              console.error("❌ Error killing FFmpeg process:", killError);
            }

            conversionProgress.set(progressKey, {
              progress: 0,
              status: "failed",
            });

            const timeoutMessage = getTimeoutMessage(smartTimeout, fileType);
            reject(new Error(timeoutMessage));
          }, smartTimeout);

          // Clear simulator after 30 seconds or when real progress starts
          setTimeout(() => {
            if (progressSimulator) {
              clearInterval(progressSimulator);
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

    // Additional cleanup for any pending conversions older than 30 minutes
    try {
      const thirtyMinutesAgo = new Date(
        Date.now() - 30 * 60 * 1000
      ).toISOString();
      const { error: cleanupError } = await supabaseAdmin
        .from("conversions")
        .update({ status: "failed" })
        .eq("status", "pending")
        .lt("created_at", thirtyMinutesAgo);

      if (cleanupError) {
        console.error(
          "Error cleaning up old pending conversions:",
          cleanupError
        );
      } else {
        console.log("✅ Cleaned up old pending conversions");
      }
    } catch (cleanupError) {
      console.error("Error in conversion cleanup:", cleanupError);
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
    console.log("🎥 Applying optimized video quality settings...");

    // Use hardware acceleration when available for major speed improvements
    const targetFormat = format.toLowerCase();
    let options: string[];

    if (targetFormat === "mp4") {
      // Temporarily disable VideoToolbox to troubleshoot startup issues
      // Use optimized software encoding instead
      switch (quality) {
        case "low":
          console.log("🎥 Using optimized software low quality (H.264)");
          options = ["-c:v", "libx264", "-crf", "35", "-preset", "ultrafast"];
          break;
        case "high":
          console.log("🎥 Using optimized software high quality (H.264)");
          options = ["-c:v", "libx264", "-crf", "18", "-preset", "veryfast"];
          break;
        default: // medium
          console.log("🎥 Using optimized software medium quality (H.264)");
          options = ["-c:v", "libx264", "-crf", "23", "-preset", "veryfast"];
          break;
      }
    } else if (targetFormat === "webm") {
      // Use VP8 for WebM (faster than VP9, more compatible than H.264 in WebM)
      switch (quality) {
        case "low":
          console.log("🎥 Using VP8 for WebM (low quality)");
          options = [
            "-c:v",
            "libvpx",
            "-crf",
            "35",
            "-cpu-used",
            "4", // Faster encoding
            "-deadline",
            "realtime",
          ];
          break;
        case "high":
          console.log("🎥 Using VP8 for WebM (high quality)");
          options = [
            "-c:v",
            "libvpx",
            "-crf",
            "18",
            "-cpu-used",
            "2", // Better quality
            "-deadline",
            "good",
          ];
          break;
        default: // medium
          console.log("🎥 Using VP8 for WebM (medium quality)");
          options = [
            "-c:v",
            "libvpx",
            "-crf",
            "23",
            "-cpu-used",
            "3", // Balanced speed/quality
            "-deadline",
            "good",
          ];
          break;
      }
    } else {
      // Fallback for other formats - use faster software encoding
      switch (quality) {
        case "low":
          console.log("🎥 Using fast low quality software encoding");
          options = ["-crf", "35", "-preset", "ultrafast"];
          break;
        case "high":
          console.log("🎥 Using fast high quality software encoding");
          options = ["-crf", "18", "-preset", "veryfast"]; // Changed from "fast" to "veryfast"
          break;
        default: // medium
          console.log("🎥 Using fast medium quality software encoding");
          options = ["-crf", "23", "-preset", "veryfast"]; // Changed from "fast" to "veryfast"
          break;
      }
    }

    console.log("🎥 Video encoding options:", options);
    return command.outputOptions(options);
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
