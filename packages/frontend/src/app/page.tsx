import Navbar from "@/app/navbar";
// import HowItWorks from "./how-it-works";
import Footer from "./footer";
import UploadSection from "./upload-section";
import Hero from "./hero";
import { Suspense } from "react";
import { AppSettings } from "@/lib/app-settings";
import Script from "next/script";
// import UploadSectionSkeleton from "./upload-section-skeleton";

export const dynamic = "force-dynamic";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "File Converter",
  description:
    "Free online file converter supporting 50+ formats. Convert images, videos, audio files and documents instantly.",
  url: AppSettings.url,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web Browser",
  offers: [
    {
      "@type": "Offer",
      name: "Free Tier",
      description: "Basic file conversion with standard features",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      validFrom: new Date().toISOString(),
      priceSpecification: {
        "@type": "PriceSpecification",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "Offer",
      name: "Premium Tier",
      description: "Advanced file conversion with premium features, higher limits, and priority processing",
      price: "5.99",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      validFrom: new Date().toISOString(),
      priceSpecification: {
        "@type": "PriceSpecification",
        price: "5.99",
        priceCurrency: "USD",
        billingDuration: "P1M",
      },
    },
  ],
  featureList: [
    "Image format conversion (JPG, PNG, WebP, GIF, SVG, BMP, TIFF)",
    "Video format conversion (MP4, AVI, MOV, MKV, WebM, FLV)",
    "Audio format conversion (MP3, WAV, FLAC, AAC, OGG, M4A)",
    "Document format conversion (PDF, DOC, DOCX, XLS, XLSX, PPT)",
    "Batch file processing",
    "Privacy-first approach",
    "Client-side processing",
    "Server-side processing",
    "Fast processing",
  ],
  provider: {
    "@type": "Organization",
    name: AppSettings.name,
    url: AppSettings.url,
  },
};

export default function Home() {
  return (
    <>
      <Script
        id="structured-data"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="min-h-screen bg-background dark:from-slate-900 dark:to-slate-800">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:pb-20 space-y-20">
          <Hero />
          <section id="upload" aria-label="File Upload Section">
            <Suspense fallback={<div>Loading...</div>}>
              <UploadSection />
            </Suspense>
          </section>
          {/* <HowItWorks /> */}
        </main>
        <Footer />
      </div>
    </>
  );
}
