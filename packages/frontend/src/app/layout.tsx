import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClientAuthProvider } from "@/lib/auth-context";

const geist = Geist({ subsets: ["latin"] });

// Force dynamic rendering
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "File Converter - Convert Images, Videos & Audio",
  description: "Free online file converter supporting multiple formats with resumable uploads",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <ClientAuthProvider>{children}</ClientAuthProvider>
      </body>
    </html>
  );
}
