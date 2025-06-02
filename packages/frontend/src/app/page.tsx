import Navbar from "@/app/navbar";
import HowItWorks from "./how-it-works";
import Footer from "./footer";
import UploadSection from "./upload-section";
import Hero from "./hero";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-20">
        <Hero />
        <Suspense fallback={<UploadSectionSkeleton />}>
          <UploadSection />
        </Suspense>
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}

function UploadSectionSkeleton() {
  return (
    <div className="max-w-5xl mx-auto mt-12" id="upload">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
        {/* Header skeleton */}
        <div className="text-center mb-6 sm:mb-8">
          <Skeleton className="h-4 w-96 mx-auto" />
        </div>

        {/* Main content skeleton */}
        <div className="space-y-6">
          {/* Upload area skeleton */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8">
            <div className="text-center space-y-4">
              <Skeleton className="w-11 h-11 rounded-full mx-auto" />
              <Skeleton className="h-5 w-32 mx-auto" />
              <Skeleton className="h-4 w-48 mx-auto" />
              <div className="flex justify-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-1" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-1" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>

          {/* Plan badge and stats skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="hidden lg:block">
              <Skeleton className="h-20 w-48 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="mt-6 sm:mt-8 text-center space-y-2">
          <Skeleton className="h-3 w-80 mx-auto" />
          <Skeleton className="h-3 w-48 mx-auto" />
        </div>
      </div>
    </div>
  );
}
