"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Something went wrong!</h1>
        <h2 className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          An error occurred while processing your request
        </h2>
        <div className="space-x-4">
          <button
            onClick={reset}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium"
          >
            Try again
          </button>
          <Link href="/" className="text-primary hover:text-primary/90 font-medium">
            Go back home
          </Link>
        </div>
      </div>
    </div>
  );
}
