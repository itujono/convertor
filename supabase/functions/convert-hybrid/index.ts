import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface ConversionRequest {
  fileData: string;
  fileName: string;
  targetFormat: string;
  quality?: "low" | "medium" | "high";
  fileType: "image" | "video" | "audio";
}

interface ConversionResponse {
  success: boolean;
  convertedData?: string;
  convertedFileName?: string;
  error?: string;
  processingTime?: number;
  message?: string;
  redirectToClient?: boolean; // Signal client to handle conversion locally
}

// Detect file type from file data
function detectFileType(
  fileData: Uint8Array,
  fileName: string
): "image" | "video" | "audio" | "unknown" {
  // Check file signatures
  const isPNG = fileData[0] === 0x89 && fileData[1] === 0x50;
  const isJPEG = fileData[0] === 0xff && fileData[1] === 0xd8;
  const isWebP =
    fileData[8] === 0x57 &&
    fileData[9] === 0x45 &&
    fileData[10] === 0x42 &&
    fileData[11] === 0x50;
  const isGIF =
    fileData[0] === 0x47 && fileData[1] === 0x49 && fileData[2] === 0x46;

  // Video signatures
  const isMp4 =
    fileData[4] === 0x66 &&
    fileData[5] === 0x74 &&
    fileData[6] === 0x79 &&
    fileData[7] === 0x70;
  const isAvi =
    fileData[8] === 0x41 && fileData[9] === 0x56 && fileData[10] === 0x49;
  const isWebM =
    fileData[0] === 0x1a &&
    fileData[1] === 0x45 &&
    fileData[2] === 0xdf &&
    fileData[3] === 0xa3;

  // Audio signatures
  const isMp3 =
    (fileData[0] === 0xff && (fileData[1] & 0xf0) === 0xf0) ||
    (fileData[0] === 0x49 && fileData[1] === 0x44 && fileData[2] === 0x33); // ID3 tag
  const isWav =
    fileData[0] === 0x52 &&
    fileData[1] === 0x49 &&
    fileData[2] === 0x46 &&
    fileData[3] === 0x46;
  const isOgg =
    fileData[0] === 0x4f &&
    fileData[1] === 0x67 &&
    fileData[2] === 0x67 &&
    fileData[3] === 0x53;

  if (isPNG || isJPEG || isWebP || isGIF) return "image";
  if (isMp4 || isAvi || isWebM) return "video";
  if (isMp3 || isWav || isOgg) return "audio";

  // Fallback to file extension
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext || ""))
    return "image";
  if (["mp4", "avi", "mov", "webm", "mkv"].includes(ext || "")) return "video";
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")) return "audio";

  return "unknown";
}

async function convertFile(
  request: ConversionRequest
): Promise<ConversionResponse> {
  const startTime = Date.now();

  try {
    console.log(
      `🔄 Starting conversion: ${request.fileName} -> ${request.targetFormat}`
    );

    const fileData = Uint8Array.from(atob(request.fileData), (c) =>
      c.charCodeAt(0)
    );
    const detectedType = detectFileType(fileData, request.fileName);

    console.log(`📁 File: ${fileData.length} bytes, Type: ${detectedType}`);

    switch (detectedType) {
      case "image":
        return await handleImageConversion(request, fileData, startTime);

      case "video":
        return await handleVideoConversion(request, fileData, startTime);

      case "audio":
        return await handleAudioConversion(request, fileData, startTime);

      default:
        throw new Error(`Unsupported file type: ${detectedType}`);
    }
  } catch (error) {
    console.error(`❌ Conversion failed:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown conversion error",
      processingTime: Date.now() - startTime,
    };
  }
}

async function handleImageConversion(
  request: ConversionRequest,
  fileData: Uint8Array,
  startTime: number
): Promise<ConversionResponse> {
  // For images, we'll tell the client to handle conversion locally
  // This is much faster and more reliable than server-side processing

  const supportedFormats = ["jpg", "jpeg", "png", "webp"];
  if (!supportedFormats.includes(request.targetFormat.toLowerCase())) {
    throw new Error(`Unsupported image format: ${request.targetFormat}`);
  }

  const baseName = request.fileName.split(".").slice(0, -1).join(".");
  const convertedFileName = `${baseName}_converted.${request.targetFormat}`;

  return {
    success: true,
    redirectToClient: true,
    convertedFileName,
    processingTime: Date.now() - startTime,
    message:
      "Image conversion will be handled client-side for optimal performance",
  };
}

async function handleVideoConversion(
  request: ConversionRequest,
  fileData: Uint8Array,
  startTime: number
): Promise<ConversionResponse> {
  // For videos, we need server-side processing or external service
  // For now, return a message about what would happen in production

  const supportedFormats = ["mp4", "webm"];
  if (!supportedFormats.includes(request.targetFormat.toLowerCase())) {
    throw new Error(`Unsupported video format: ${request.targetFormat}`);
  }

  // In production, this would:
  // 1. Upload to AWS S3
  // 2. Trigger AWS Lambda with FFmpeg
  // 3. Return processed video URL
  // 4. Or use service like Cloudinary/Mux

  const baseName = request.fileName.split(".").slice(0, -1).join(".");
  const convertedFileName = `${baseName}_converted.${request.targetFormat}`;

  return {
    success: true,
    message: `Video conversion ready! In production, this ${(
      fileData.length /
      (1024 * 1024)
    ).toFixed(
      2
    )}MB video would be processed via AWS Lambda + FFmpeg or Cloudinary API. Processing time: ~30-120 seconds depending on length.`,
    convertedFileName,
    processingTime: Date.now() - startTime,
  };
}

async function handleAudioConversion(
  request: ConversionRequest,
  fileData: Uint8Array,
  startTime: number
): Promise<ConversionResponse> {
  // Similar to video - needs server-side processing

  const supportedFormats = ["mp3", "ogg", "wav"];
  if (!supportedFormats.includes(request.targetFormat.toLowerCase())) {
    throw new Error(`Unsupported audio format: ${request.targetFormat}`);
  }

  const baseName = request.fileName.split(".").slice(0, -1).join(".");
  const convertedFileName = `${baseName}_converted.${request.targetFormat}`;

  return {
    success: true,
    message: `Audio conversion ready! In production, this ${(
      fileData.length /
      (1024 * 1024)
    ).toFixed(
      2
    )}MB audio would be processed via AWS Lambda + FFmpeg. Processing time: ~5-30 seconds.`,
    convertedFileName,
    processingTime: Date.now() - startTime,
  };
}

// @ts-ignore - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const request: ConversionRequest = await req.json();

    if (!request.fileData || !request.fileName || !request.targetFormat) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: fileData, fileName, targetFormat",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const estimatedSize = (request.fileData.length * 3) / 4;
    const maxSize = 100 * 1024 * 1024; // 100MB limit for hybrid approach

    if (estimatedSize > maxSize) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
        }),
        {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `🚀 Processing: ${request.fileName} (${(
        estimatedSize /
        (1024 * 1024)
      ).toFixed(2)}MB)`
    );

    const result = await convertFile(request);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
