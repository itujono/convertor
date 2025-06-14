import "./globals.css";
import type { Metadata } from "next";
import { ClientAuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { AppSettings } from "@/lib/app-settings";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: `${AppSettings.name} - Convert Images, Videos & Audio Files Online Free`,
    template: "%s | ${AppSettings.name}",
  },
  description:
    "Free online file converter supporting 50+ formats. Convert images (JPG, PNG, WebP), videos (MP4, AVI, MOV), audio (MP3, WAV, FLAC) and documents instantly. No credit card required, privacy-first approach.",
  keywords: [
    "file converter",
    "online converter",
    "image converter",
    "video converter",
    "audio converter",
    "document converter",
    "JPG to PNG",
    "MP4 converter",
    "MP3 converter",
    "free converter",
    "batch converter",
    "format converter",
  ],
  authors: [{ name: AppSettings.author.name }],
  creator: AppSettings.author.name,
  publisher: AppSettings.author.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(AppSettings.url),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: `${AppSettings.name} - Convert Any File Format Online Free`,
    description:
      "Convert images, videos, audio files and documents online for free. Support for 50+ formats including JPG, PNG, MP4, MP3, PDF and more. Fast, secure, and privacy-focused.",
    siteName: AppSettings.name,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${AppSettings.name} - Convert any file format online`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${AppSettings.name} - Convert Any File Format Online Free`,
    description:
      "Convert images, videos, audio files and documents online for free. Support for 50+ formats. Fast, secure, and privacy-focused.",
    images: ["/og-image.png"],
    creator: AppSettings.author.name,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    yahoo: process.env.YAHOO_VERIFICATION,
  },
  category: "technology",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className="font-sans">
        <ClientAuthProvider>
          <TooltipProvider>
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              duration={4000}
              toastOptions={{
                style: {
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--card-foreground))",
                },
                className: "sonner-toast",
              }}
              theme="system"
            />
          </TooltipProvider>
        </ClientAuthProvider>
      </body>
    </html>
  );
}
