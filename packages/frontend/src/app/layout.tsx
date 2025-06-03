import "./globals.css";
import type { Metadata } from "next";
import { ClientAuthProvider } from "@/lib/auth-context";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "File Converter - Convert Images, Videos & Audio",
  description: "Free online file converter supporting multiple formats with resumable uploads",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <ClientAuthProvider>{children}</ClientAuthProvider>
      </body>
    </html>
  );
}
