import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// @ts-ignore - Deno global
Deno.serve(async (req: Request) => {
  console.log(`📝 Request method: ${req.method}`);
  console.log(`📝 Request headers:`, req.headers);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log(`✅ Handling OPTIONS preflight request`);
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log(`🚀 Processing ${req.method} request`);

    const response = {
      success: true,
      message: "CORS test successful!",
      method: req.method,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
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
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
