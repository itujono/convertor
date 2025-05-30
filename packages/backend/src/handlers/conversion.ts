import { Context } from "hono";
import { join } from "path";
import { mkdir } from "fs/promises";
import {
  checkConversionLimit,
  incrementConversionCount,
} from "../utils/conversion";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";

const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function convertHandler(c: Context<{ Variables: Variables }>) {
  try {
    const user = c.get("user");
    const { filePath, format } = await c.req.json();

    if (!filePath || !format) {
      return c.json({ error: "Missing filePath or format" }, 400);
    }

    await checkConversionLimit(user.id);

    const uploadsDir = join(process.cwd(), "uploads");

    // Ensure uploads directory exists
    await mkdir(uploadsDir, { recursive: true });

    const inputPath = join(uploadsDir, filePath);
    const outputFileName = `${filePath.split(".")[0]}_converted.${format}`;
    const outputPath = join(uploadsDir, outputFileName);

    const { error: conversionError } = await supabaseAdmin
      .from("conversions")
      .insert({
        user_id: user.id,
        file_name: filePath,
        status: "pending",
      });

    if (conversionError) {
      console.error("Error logging conversion:", conversionError);
    }

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const { error: updateError } = await supabaseAdmin
      .from("conversions")
      .update({ status: "completed" })
      .eq("user_id", user.id)
      .eq("file_name", filePath)
      .eq("status", "pending");

    if (updateError) {
      console.error("Error updating conversion status:", updateError);
    }

    await incrementConversionCount(user.id);

    return c.json({
      message: "Conversion completed successfully",
      outputPath: outputFileName,
      downloadUrl: `/api/download/${outputFileName}`,
    });
  } catch (error: any) {
    console.error("Conversion error:", error);

    const { filePath } = await c.req.json().catch(() => ({}));
    if (filePath) {
      const user = c.get("user");
      await supabaseAdmin
        .from("conversions")
        .update({ status: "failed" })
        .eq("user_id", user.id)
        .eq("file_name", filePath)
        .eq("status", "pending");
    }

    return c.json({ error: error.message || "Conversion failed" }, 500);
  }
}
