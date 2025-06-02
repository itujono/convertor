import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "File Converter - Convert Images, Videos & Audio",
  description: "Free online file converter supporting multiple formats with resumable uploads",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
