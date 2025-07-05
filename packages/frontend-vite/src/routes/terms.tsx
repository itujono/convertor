import { createFileRoute } from "@tanstack/react-router";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { SEOHead } from "@/components/seo-head";
import { AppSettings } from "@/lib/app-settings";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Terms of Service"
        description={`${AppSettings.name} Terms of Service. Read our terms and conditions for using our free online file conversion service.`}
        keywords={[
          "terms of service",
          "legal",
          "terms and conditions",
          "usage policy",
        ]}
        url="/terms"
      />

      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Terms of Service
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </header>

          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Acceptance of Terms
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                By using {AppSettings.name}, you agree to these Terms of
                Service. If you do not agree to these terms, please do not use
                our service.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Service Description
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {AppSettings.name} is a free online service that allows users to
                convert files between different formats including images,
                videos, audio files, and documents. We provide this service "as
                is" without warranties of any kind.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Acceptable Use
              </h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400">
                <li>Use the service only for lawful purposes</li>
                <li>Do not upload copyrighted material without permission</li>
                <li>Do not upload malicious files or content</li>
                <li>Do not attempt to overload or disrupt our servers</li>
                <li>Respect file size and usage limits</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                File Processing and Storage
              </h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400">
                <li>
                  Files processed on our servers are automatically deleted
                  within 24 hours
                </li>
                <li>We do not claim ownership of your files</li>
                <li>
                  You are responsible for maintaining backups of your original
                  files
                </li>
                <li>
                  We are not liable for any data loss during the conversion
                  process
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Limitation of Liability
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {AppSettings.name} is provided free of charge. We make no
                guarantees about service availability, conversion quality, or
                data integrity. Use of this service is at your own risk.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Changes to Terms
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                We may update these terms from time to time. Continued use of
                the service constitutes acceptance of any changes.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Contact Information
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                For questions about these Terms of Service, contact us at{" "}
                <a
                  href={`mailto:${AppSettings.author.email}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {AppSettings.author.email}
                </a>
              </p>
            </div>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
