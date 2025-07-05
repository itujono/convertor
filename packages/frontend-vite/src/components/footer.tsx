import { useAppSettings } from "@/hooks/use-app-settings";

export default function Footer() {
  const appSettings = useAppSettings();

  return (
    <footer className="mt-16 sm:mt-20 border-t bg-white/80 dark:bg-slate-900/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Navigation Links */}
          <nav className="flex flex-wrap justify-center sm:justify-start gap-4 sm:gap-6 text-sm">
            <a
              href="/about"
              className="transition-colors text-primary hover:underline"
            >
              About
            </a>
            <a
              href="/privacy"
              className="transition-colors text-primary hover:underline"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="transition-colors text-primary hover:underline"
            >
              Terms
            </a>
            <a
              href={`mailto:${appSettings.settings.author.email}`}
              className="transition-colors text-primary hover:underline"
            >
              Contact
            </a>
          </nav>

          {/* Copyright */}
          <div className="text-center sm:text-right text-slate-600 dark:text-slate-400">
            <p className="text-sm">
              &copy; {new Date().getFullYear()} {appSettings.settings.name}.
              Built with a bunch of{" "}
              <span aria-label="coffee" role="img">
                ☕️
              </span>{" "}
              by{" "}
              <a
                href={appSettings.settings.author.url}
                className="text-accent-foreground hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {appSettings.settings.author.name}
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
