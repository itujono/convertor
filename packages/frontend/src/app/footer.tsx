"use client";

import { AppSettings } from "@/lib/app-settings";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 sm:mt-20 border-t bg-white/80 dark:bg-slate-900/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Navigation Links */}
          <nav className="flex flex-wrap justify-center sm:justify-start gap-4 sm:gap-6 text-sm">
            <Link href="/about" className="transition-colors text-primary hover:underline">
              About
            </Link>
            <Link href="/privacy" className="transition-colors text-primary hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors text-primary hover:underline">
              Terms
            </Link>
            <a href={`mailto:${AppSettings.author.email}`} className="transition-colors text-primary hover:underline">
              Contact
            </a>
          </nav>

          {/* Copyright */}
          <div className="text-center sm:text-right text-slate-600 dark:text-slate-400">
            <p className="text-sm">
              &copy; {new Date().getFullYear()} {AppSettings.name}. Built with a bunch of{" "}
              <span aria-label="coffee" role="img">
                ☕️
              </span>{" "}
              by{" "}
              <a
                href={AppSettings.author.url}
                className="text-accent-foreground hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {AppSettings.author.name}
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
