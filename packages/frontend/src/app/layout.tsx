import "./globals.css";
import type { Metadata } from "next";
import { ClientAuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

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
