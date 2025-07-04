import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import UploadWithProgress from "@/components/upload-with-progress";
import { ReadyDownloads } from "@/components/ready-downloads";
import { UsageStats } from "@/components/usage-stats";
import { PricingModal } from "@/components/pricing-modal";
import { PaymentSuccessHandler } from "@/components/payment-success-handler";
import { useAuth } from "@/lib/auth-context";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useState, useEffect } from "react";
import Hero from "@/hero";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <PaymentSuccessHandler />
      </Suspense>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:pb-20 space-y-20">
        <Hero />

        <section id="upload" aria-label="File Upload Section">
          <Suspense fallback={<div>Loading...</div>}>
            <UploadSection />
          </Suspense>
        </section>
      </main>
    </div>
  );
}

// function HeroSection() {
//   return (
//     <div className="text-center space-y-8">
//       <h1 className="text-4xl md:text-6xl font-bold text-center mb-8">
//         File Converter
//       </h1>
//       <p className="text-xl text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
//         Convert your files quickly and easily. Support for 50+ formats including
//         images, videos, audio, and documents.
//       </p>
//     </div>
//   );
// }

function UploadSection() {
  const { session, isLoading, signInWithGoogle, user } = useAuth();
  const appSettings = useAppSettings();
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  // Emergency fallback - if loading takes too long, show error state
  useEffect(() => {
    if (isLoading) {
      const fallbackTimer = setTimeout(() => {
        console.warn(
          "⚠️ UploadSection: Auth loading too long, showing fallback"
        );
        setShowFallback(true);
      }, 15000); // 15 seconds

      return () => clearTimeout(fallbackTimer);
    } else {
      setShowFallback(false);
    }
  }, [isLoading]);

  if (showFallback) {
    return (
      <div className="max-w-5xl mx-auto space-y-8" id="upload">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 sm:p-6 lg:p-12 relative z-10">
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Loading Error
            </h3>
            <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-md mx-auto">
              We're having trouble loading the app. Please refresh the page to
              try again.
            </p>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8" id="upload">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 sm:p-6 lg:p-12 relative z-10">
        <div className="text-center mb-6 sm:mb-8">
          {isLoading ? (
            <Skeleton className="h-4 w-64 mx-auto mb-8 pt-7" />
          ) : (
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 px-4 sm:px-0">
              {session
                ? "Drag and drop your files or click to browse. We'll handle the rest!"
                : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <UploadAreaSkeleton />
        ) : session ? (
          <UploadWithProgress />
        ) : (
          <UnauthedSection signInWithGoogle={signInWithGoogle} />
        )}

        <div className="flex-1 flex flex-col gap-4">
          <UsageStats />
        </div>

        <div className="mt-6 sm:mt-8 text-center">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed px-4 sm:px-0">
            Your files are processed securely.
            <br className="hidden sm:block" />
            {user?.plan === "free" && (
              <span className="block sm:inline mt-1 sm:mt-0">
                Free for files up to{" "}
                {Math.round(
                  appSettings.planLimits.maxFileSizeBytes / (1024 * 1024)
                )}
                MB.{" "}
                <button
                  onClick={() => setIsPricingModalOpen(true)}
                  className="text-sm hover:text-primary/80 hover:underline text-primary"
                >
                  Upgrade
                </button>{" "}
                to get more.
              </span>
            )}
          </p>
        </div>
      </div>

      {session && <ReadyDownloads />}

      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
      />
    </div>
  );
}

function UploadAreaSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="border-input flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-4 py-16">
          <div className="flex flex-col gap-1 items-center justify-center text-center">
            <Skeleton className="mb-2 size-11 rounded-full" />
            <Skeleton className="mb-1.5 h-4 w-24" />
            <Skeleton className="mb-2 h-3 w-40" />
            <div className="flex flex-wrap justify-center gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface UnauthedSectionProps {
  signInWithGoogle: () => Promise<void>;
}

function UnauthedSection({ signInWithGoogle }: UnauthedSectionProps) {
  const appSettings = useAppSettings();

  return (
    <div className="text-center py-12">
      <section className="mb-8">
        <div className="w-20 h-20 mx-auto mb-4 bg-primary rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Ready to Convert?
        </h3>
        <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-md mx-auto">
          Sign in with your Google account to access our powerful file
          conversion tools and start transforming your media files.
        </p>
      </section>

      <Button
        variant="secondary"
        onClick={signInWithGoogle}
        size="lg"
        className="mb-6"
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </Button>

      <section className="text-center text-sm text-slate-600 dark:text-slate-400">
        <p className="mb-2">Free plan includes:</p>
        <ul className="list-disc list-inside space-y-1 max-w-xs mx-auto">
          <li>
            {appSettings.planLimits.quotas.conversionsPerDay} conversions per
            day
          </li>
          <li>
            {Math.round(
              appSettings.planLimits.maxFileSizeBytes / (1024 * 1024)
            )}
            MB file size limit
          </li>
          <li>Support for images, videos & audio</li>
        </ul>
      </section>
    </div>
  );
}
