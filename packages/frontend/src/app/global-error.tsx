"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Something went wrong!</h1>
            <h2 className="text-lg text-gray-600 mb-8">A global error occurred</h2>
            <button
              onClick={reset}
              className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
