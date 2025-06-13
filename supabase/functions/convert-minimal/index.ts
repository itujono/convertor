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
  message?: string;
}

// For now, this is a passthrough function that demonstrates the working flow
// Real image conversion would require additional libraries or moving to client-side
async function convertFile(
  request: ConversionRequest
): Promise<ConversionResponse> {
  const startTime = Date.now();

  try {
    console.log(
      `🔄 Starting conversion: ${request.fileName} -> ${request.targetFormat}`
    );

    // Decode base64 file data to verify it's valid
    const fileData = Uint8Array.from(atob(request.fileData), (c) =>
      c.charCodeAt(0)
    );
    console.log(`📁 File loaded: ${fileData.length} bytes`);

    // Check if it's a PNG file (starts with PNG signature)
    const isPNG =
      fileData[0] === 0x89 &&
      fileData[1] === 0x50 &&
      fileData[2] === 0x4e &&
      fileData[3] === 0x47;
    const isJPEG = fileData[0] === 0xff && fileData[1] === 0xd8;

    if (!isPNG && !isJPEG) {
      throw new Error(
        "Unsupported file format. Only PNG and JPEG are supported."
      );
    }

    // For this demo, we'll return the same file but with a success message
    // In a real implementation, you'd use an image processing library here
    const base64Output = request.fileData; // Passthrough for now

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
      message: `Proof of concept: File processed successfully! (${
        fileData.length
      } bytes ${isPNG ? "PNG" : "JPEG"} file)`,
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
    const maxSize = 10 * 1024 * 1024; // 10MB limit

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
