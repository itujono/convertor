import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

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

// Load FFmpeg.wasm dynamically
async function loadFFmpeg() {
  const { FFmpeg } = await import(
    "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"
  );
  const { toBlobURL } = await import(
    "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js"
  );

  const ffmpeg = new FFmpeg();

  // Load the FFmpeg core
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  return ffmpeg;
}

function getQualitySettings(format: string, quality: string = "medium") {
  const settings: Record<string, Record<string, string[]>> = {
    // Image formats
    jpg: {
      low: ["-q:v", "10"],
      medium: ["-q:v", "5"],
      high: ["-q:v", "2"],
    },
    jpeg: {
      low: ["-q:v", "10"],
      medium: ["-q:v", "5"],
      high: ["-q:v", "2"],
    },
    png: {
      low: ["-compression_level", "1"],
      medium: ["-compression_level", "6"],
      high: ["-compression_level", "9"],
    },
    webp: {
      low: ["-q:v", "30"],
      medium: ["-q:v", "70"],
      high: ["-q:v", "90"],
    },
    // Video formats
    mp4: {
      low: ["-crf", "35", "-preset", "fast"],
      medium: ["-crf", "28", "-preset", "medium"],
      high: ["-crf", "18", "-preset", "slow"],
    },
    webm: {
      low: ["-crf", "35", "-b:v", "500k"],
      medium: ["-crf", "28", "-b:v", "1M"],
      high: ["-crf", "20", "-b:v", "2M"],
    },
    // Audio formats
    mp3: {
      low: ["-b:a", "96k"],
      medium: ["-b:a", "128k"],
      high: ["-b:a", "320k"],
    },
    ogg: {
      low: ["-q:a", "2"],
      medium: ["-q:a", "5"],
      high: ["-q:a", "8"],
    },
  };

  return settings[format.toLowerCase()]?.[quality] || [];
}

async function convertFile(
  request: ConversionRequest
): Promise<ConversionResponse> {
  const startTime = Date.now();

  try {
    console.log(
      `🔄 Starting conversion: ${request.fileName} -> ${request.targetFormat}`
    );

    // Load FFmpeg
    const ffmpeg = await loadFFmpeg();

    // Decode base64 file data
    const fileData = Uint8Array.from(atob(request.fileData), (c) =>
      c.charCodeAt(0)
    );
    console.log(`📁 File loaded: ${fileData.length} bytes`);

    // Write input file to FFmpeg filesystem
    const inputFileName = request.fileName;
    const outputFileName = `output.${request.targetFormat}`;

    await ffmpeg.writeFile(inputFileName, fileData);
    console.log(`📝 File written to FFmpeg filesystem: ${inputFileName}`);

    // Get quality settings
    const qualityArgs = getQualitySettings(
      request.targetFormat,
      request.quality
    );

    // Build FFmpeg command
    const ffmpegArgs = ["-i", inputFileName, ...qualityArgs, outputFileName];

    console.log(`⚙️ FFmpeg command: ffmpeg ${ffmpegArgs.join(" ")}`);

    // Execute conversion
    await ffmpeg.exec(ffmpegArgs);
    console.log(`✅ Conversion completed`);

    // Read output file
    const outputData = await ffmpeg.readFile(outputFileName);
    const outputArray = new Uint8Array(outputData as ArrayBuffer);

    // Convert to base64
    const base64Output = btoa(String.fromCharCode(...outputArray));

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
    const maxSize = 50 * 1024 * 1024; // 50MB limit

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
