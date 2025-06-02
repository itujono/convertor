import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDownIcon, HeartIcon, InfoIcon } from "lucide-react";
import Link from "next/link";

export default function Hero() {
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        {/* Left Content */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold text-slate-900 dark:text-white font-title">
              Convert any files
              <br />
              in seconds
              <br />
              for free.
            </h1>
          </div>

          <Link href="#upload">
            <Button size="lg" className="px-8 py-3 rounded-full">
              Start Converting <ArrowDownIcon className="w-4 h-4" />
            </Button>
          </Link>

          {/* Customer Stats */}
          <div className="flex items-center gap-4 pt-10">
            <div className="flex -space-x-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 border-2 border-white flex items-center justify-center text-white font-bold text-sm">
                A
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-teal-500 border-2 border-white flex items-center justify-center text-white font-bold text-sm">
                B
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 border-2 border-white flex items-center justify-center text-white font-bold text-sm">
                C
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600 font-bold text-sm">
                +
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">500+</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Happy Customers{" "}
                <Tooltip>
                  <TooltipTrigger className="top-0.5 left-1 relative">
                    <InfoIcon className="w-4 h-4" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white" arrowClassName="fill-black">
                    Joke! We've just launched yesterday 😅
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content - Product Cards */}
        <div className="space-y-4">
          <div className="relative bg-[#488a60] rounded-2xl p-6 text-white overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <HeartIcon className="w-6 h-6" />
                <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0">
                  Try Now
                </Button>
              </div>
              <h3 className="text-lg font-semibold mb-2">All media formats</h3>
              <p className="text-sm opacity-90">Images, videos, and audio</p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full"></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative bg-[#abc4e4] rounded-2xl p-4 text-white overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <HeartIcon className="w-5 h-5" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs px-3 py-1"
                  >
                    Try Now
                  </Button>
                </div>
                <h3 className="text-sm font-semibold mb-1">Lightning fast</h3>
                <p className="text-xs opacity-90">Convert in seconds</p>
              </div>
              <div className="absolute -right-2 -bottom-2 w-16 h-16 bg-white/10 rounded-full"></div>
            </div>

            <div className="relative bg-[#fbb73e] rounded-2xl p-4 text-white overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <HeartIcon className="w-5 h-5" />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs px-3 py-1"
                  >
                    Try Now
                  </Button>
                </div>
                <h3 className="text-sm font-semibold mb-1">Privacy first</h3>
                <p className="text-xs opacity-90">We track nothing, ever.</p>
              </div>
              <div className="absolute -right-2 -bottom-2 w-16 h-16 bg-white/10 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SupportedFormats() {
  return (
    <div className="mb-12 sm:mb-16">
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center mb-6 sm:mb-8">
        Supported Formats
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto">
        <div className="text-center p-4 sm:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="h-6 w-6 sm:h-8 sm:w-8 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3">
            <span className="text-blue-600 font-bold text-sm">IMG</span>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">Images</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            JPG, PNG, GIF, WebP, SVG, BMP, TIFF
          </p>
        </div>
        <div className="text-center p-4 sm:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="h-6 w-6 sm:h-8 sm:w-8 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3">
            <span className="text-red-600 font-bold text-sm">VID</span>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">Videos</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            MP4, AVI, MOV, MKV, WebM, FLV
          </p>
        </div>
        <div className="text-center p-4 sm:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="h-6 w-6 sm:h-8 sm:w-8 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3">
            <span className="text-green-600 font-bold text-sm">AUD</span>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">Audio</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            MP3, WAV, FLAC, AAC, OGG, M4A
          </p>
        </div>
        <div className="text-center p-4 sm:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="h-6 w-6 sm:h-8 sm:w-8 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3">
            <span className="text-purple-600 font-bold text-sm">DOC</span>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">Documents</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            PDF, DOC, DOCX, XLS, XLSX, PPT
          </p>
        </div>
      </div>
    </div>
  );
}
