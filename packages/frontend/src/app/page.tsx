import Navbar from "@/app/navbar";
// import HowItWorks from "./how-it-works";
import Footer from "./footer";
import UploadSection from "./upload-section";
import Hero from "./hero";
import { Suspense } from "react";
// import UploadSectionSkeleton from "./upload-section-skeleton";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-screen bg-background dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:pb-20 space-y-20">
        <Hero />
        <Suspense fallback={<div>Loading...</div>}>
          <UploadSection />
        </Suspense>
        {/* <HowItWorks /> */}
      </main>
      <Footer />
    </div>
  );
}
