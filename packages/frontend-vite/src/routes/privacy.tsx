import { createFileRoute } from "@tanstack/react-router";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { AppSettings } from "@/lib/app-settings";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Privacy Policy
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </header>

          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Our Privacy Commitment
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                At {AppSettings.name}, we believe your privacy is fundamental.
                We've designed our service with privacy-first principles,
                processing files locally in your browser whenever possible and
                never storing your personal data unnecessarily.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                How We Process Your Files
              </h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400">
                <li>
                  Most file conversions happen directly in your browser using
                  client-side processing
                </li>
                <li>
                  For complex conversions, files may be temporarily processed on
                  our servers
                </li>
                <li>
                  Server-processed files are automatically deleted within 24
                  hours
                </li>
                <li>
                  We never access, view, or store the content of your files
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Data We Don't Collect
              </h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400">
                <li>Personal information or account details</li>
                <li>File contents or metadata</li>
                <li>Tracking cookies or analytics data</li>
                <li>IP addresses for identification purposes</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Technical Information
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                We may collect minimal technical information necessary for
                service operation, such as error logs and performance metrics.
                This data is anonymized and used solely for improving our
                service.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Contact Us
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                If you have questions about this Privacy Policy, please contact
                us at{" "}
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
