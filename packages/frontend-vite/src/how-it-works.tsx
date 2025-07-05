export default function HowItWorks() {
  return (
    <div className="text-center">
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-8 sm:mb-12">How It Works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
        <div className="text-center px-4 sm:px-0">
          <div className="bg-blue-100 dark:bg-blue-900/30 w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">1</span>
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">Upload Files</h3>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Drag & drop or select files from your device. Multiple files supported.
          </p>
        </div>
        <div className="text-center px-4 sm:px-0">
          <div className="bg-purple-100 dark:bg-purple-900/30 w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400">2</span>
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">Choose Format</h3>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Select your desired output format and quality settings.
          </p>
        </div>
        <div className="text-center px-4 sm:px-0">
          <div className="bg-green-100 dark:bg-green-900/30 w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">3</span>
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">Download</h3>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Get your converted files instantly. Fast, secure, and reliable.
          </p>
        </div>
      </div>
    </div>
  );
}
