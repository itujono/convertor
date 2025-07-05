import { createFileRoute } from "@tanstack/react-router";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { SEOHead } from "@/components/seo-head";
import { AppSettings } from "@/lib/app-settings";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="About"
        description={`Learn about ${AppSettings.name}, your privacy-first solution for file format conversion. Convert images, videos, audio files, and documents with 50+ supported formats.`}
        keywords={["about", "file converter", "privacy-first", "company info"]}
        url="/about"
      />

      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              About <span className="font-title">{AppSettings.name}</span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Your privacy-first solution for file format conversion
            </p>
          </header>

          <section className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                Our Mission
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                We believe file conversion should be simple, fast, and respect
                your privacy. {AppSettings.name} was built to provide a
                reliable, free alternative to complex software installations and
                privacy-invasive online tools.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Our goal is to make file format conversion accessible to
                everyone, whether you're a professional designer, content
                creator, or someone who just needs to quickly convert a file.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                Why Choose {AppSettings.name}?
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Privacy First
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Most conversions happen in your browser. When server
                    processing is needed, files are automatically deleted within
                    24 hours.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    50+ Formats
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Support for images, videos, audio files, and documents
                    (coming soon). From JPG to WebP, MP4 to AVI, MP3 to FLAC,
                    and more.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Lightning Fast
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Client-side processing means instant conversions for most
                    file types. No waiting in queues or slow uploads.
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Free Tier Available
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Convert files for free. Upgrade to premium for more
                    features.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                Supported File Types
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Images
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    JPG, PNG, GIF, WebP, SVG, BMP, TIFF, ICO
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Videos
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    MP4, AVI, MOV, MKV, WebM, FLV, WMV
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Audio
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    MP3, WAV, FLAC, AAC, OGG, M4A, WMA
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Documents
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX (coming soon)
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                How It Works
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary dark:bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground dark:text-primary-foreground font-bold text-sm">
                      1
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                      Upload Your Files
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                      Drag and drop or click to select files from your device.
                      Multiple files supported.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary dark:bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground dark:text-primary-foreground font-bold text-sm">
                      2
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                      Choose Output Format
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                      Select your desired output format and quality settings for
                      each file.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary dark:bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground dark:text-primary-foreground font-bold text-sm">
                      3
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                      Convert & Download
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                      Files are processed instantly in your browser or on our
                      secure servers, then ready for download.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                Contact Us
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Have questions, suggestions, or need help? We'd love to hear
                from you.{" "}
                <a
                  href={`mailto:${AppSettings.author.email}`}
                  className="text-primary hover:text-primary/80"
                >
                  Get in touch
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
