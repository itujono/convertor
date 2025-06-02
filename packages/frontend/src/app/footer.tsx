"use client";

import { AppSettings } from "@/lib/app-settings";

export default function Footer() {
  return (
    <footer className="mt-16 sm:mt-20 border-t bg-white/80 dark:bg-slate-900/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="text-center text-slate-600 dark:text-slate-400">
          <p className="text-sm sm:text-base">
            &copy; {new Date().getFullYear()} {AppSettings.name}. Built with a bunch of{" "}
            <span aria-labelledby="coffee" role="img">
              ☕️
            </span>{" "}
            by{" "}
            <a href={AppSettings.author.url} className="text-accent-foreground hover:underline" target="_blank">
              {AppSettings.author.name}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
