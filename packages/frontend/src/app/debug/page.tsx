"use client";

export default function DebugPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Information</h1>

      <div className="space-y-4">
        <div className="p-4 bg-gray-100 rounded">
          <h2 className="font-semibold">Frontend Configuration</h2>
          <p>
            <strong>API Base URL:</strong> {apiUrl}
          </p>
          <p>
            <strong>Environment:</strong> {process.env.NODE_ENV}
          </p>
          <p>
            <strong>Vercel URL:</strong> {process.env.VERCEL_URL || "Not set"}
          </p>
        </div>

        <div className="p-4 bg-blue-100 rounded">
          <h2 className="font-semibold">Test API Connection</h2>
          <div className="space-y-2">
            <button
              onClick={async () => {
                try {
                  const response = await fetch(`${apiUrl}/api/debug/cors`);
                  const data = await response.json();
                  console.log("Backend CORS debug:", data);
                  alert("Check console for backend CORS configuration");
                } catch (error) {
                  console.error("API connection failed:", error);
                  alert("API connection failed - check console");
                }
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
            >
              Test Backend Connection
            </button>

            <button
              onClick={async () => {
                try {
                  console.log("Testing OPTIONS request to:", `${apiUrl}/api/debug/test-options`);
                  const response = await fetch(`${apiUrl}/api/debug/test-options`, {
                    method: "OPTIONS",
                    headers: {
                      Origin: window.location.origin,
                      "Access-Control-Request-Method": "POST",
                      "Access-Control-Request-Headers": "Content-Type,Authorization",
                    },
                  });
                  console.log("OPTIONS response status:", response.status);

                  // Convert headers to object for logging
                  const headersObj: Record<string, string> = {};
                  response.headers.forEach((value, key) => {
                    headersObj[key] = value;
                  });
                  console.log("OPTIONS response headers:", headersObj);

                  if (response.ok) {
                    const data = await response.text();
                    console.log("OPTIONS response body:", data);
                    alert("OPTIONS test successful - check console");
                  } else {
                    console.error("OPTIONS failed with status:", response.status);
                    alert(`OPTIONS failed with status: ${response.status} - check console`);
                  }
                } catch (error) {
                  console.error("OPTIONS test failed:", error);
                  alert("OPTIONS test failed - check console");
                }
              }}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Test OPTIONS Request
            </button>
          </div>
        </div>

        <div className="p-4 bg-yellow-100 rounded">
          <h2 className="font-semibold">Current URL Info</h2>
          <p>
            <strong>Origin:</strong> {typeof window !== "undefined" ? window.location.origin : "N/A"}
          </p>
          <p>
            <strong>Host:</strong> {typeof window !== "undefined" ? window.location.host : "N/A"}
          </p>
          <p>
            <strong>Protocol:</strong> {typeof window !== "undefined" ? window.location.protocol : "N/A"}
          </p>
        </div>
      </div>
    </div>
  );
}
