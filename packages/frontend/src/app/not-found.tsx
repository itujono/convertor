"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
        <h2 className="text-lg text-gray-600 dark:text-gray-400 mb-8">Page not found</h2>
        <Link href="/" className="text-primary hover:text-primary/90 font-medium">
          Go back home
        </Link>
      </div>
    </div>
  );
}
