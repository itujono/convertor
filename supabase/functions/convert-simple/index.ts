import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface ConversionRequest {
  fileData: string; // base64 encoded file data
  fileName: string;
  targetFormat: string;
  quality?: "low" | "medium" | "high";
}

interface ConversionResponse {
  success: boolean;
  convertedData?: string; // base64 encoded result
  convertedFileName?: string;
  error?: string;
  processingTime?: number;
}

// Simple image conversion using Canvas API (works for basic image formats)
async function convertImageWithCanvas(
  imageData: Uint8Array,
  targetFormat: string,
  quality: string = "medium"
): Promise<Uint8Array> {
  // Create a blob from the image data
  const blob = new Blob([imageData]);

  // Create an image element
  const img = new Image();
  const imageLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
  });

  // Set the image source to the blob
  img.src = URL.createObjectURL(blob);
  await imageLoadPromise;

  // Create a canvas and draw the image
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  // Get quality value
  const qualityMap = { low: 0.3, medium: 0.7, high: 0.9 };
  const qualityValue = qualityMap[quality as keyof typeof qualityMap] || 0.7;

  // Convert to target format
  const mimeType =
    targetFormat === "jpg" || targetFormat === "jpeg"
      ? "image/jpeg"
      : targetFormat === "png"
      ? "image/png"
      : targetFormat === "webp"
      ? "image/webp"
      : "image/jpeg";

  // Convert to blob
  const resultBlob = await canvas.convertToBlob({
    type: mimeType,
    quality: qualityValue,
  });

  // Convert blob to Uint8Array
  const arrayBuffer = await resultBlob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function convertFile(
  request: ConversionRequest
): Promise<ConversionResponse> {
  const startTime = Date.now();

  try {
    console.log(
      `🔄 Starting conversion: ${request.fileName} -> ${request.targetFormat}`
    );

    // Decode base64 file data
    const fileData = Uint8Array.from(atob(request.fileData), (c) =>
      c.charCodeAt(0)
    );
    console.log(`📁 File loaded: ${fileData.length} bytes`);

    // For now, only support image conversions
    const supportedFormats = ["jpg", "jpeg", "png", "webp"];
    if (!supportedFormats.includes(request.targetFormat.toLowerCase())) {
      throw new Error(
        `Unsupported target format: ${
          request.targetFormat
        }. Supported: ${supportedFormats.join(", ")}`
      );
    }

    // Convert the image
    const convertedData = await convertImageWithCanvas(
      fileData,
      request.targetFormat,
      request.quality
    );

    // Convert to base64
    const base64Output = btoa(String.fromCharCode(...convertedData));

    const processingTime = Date.now() - startTime;
    console.log(`⏱️ Total processing time: ${processingTime}ms`);

    // Generate output filename
    const baseName = request.fileName.split(".").slice(0, -1).join(".");
    const convertedFileName = `${baseName}_converted.${request.targetFormat}`;

    return {
      success: true,
      convertedData: base64Output,
      convertedFileName,
      processingTime,
    };
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

// @ts-ignore - Deno global
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
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

    // Validate request
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

    // Check file size (base64 is ~33% larger than binary)
    const estimatedSize = (request.fileData.length * 3) / 4;
    const maxSize = 10 * 1024 * 1024; // 10MB limit for this simpler version

    if (estimatedSize > maxSize) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File too large. Maximum size is ${
            maxSize / (1024 * 1024)
          }MB for image conversion`,
        }),
        {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🚀 Processing conversion request for: ${request.fileName}`);
    console.log(
      `📊 Estimated file size: ${(estimatedSize / (1024 * 1024)).toFixed(2)}MB`
    );

    // Perform conversion
    const result = await convertFile(request);

    const status = result.success ? 200 : 500;

    return new Response(JSON.stringify(result), {
      status,
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
