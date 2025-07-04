import { AppSettings } from "@/lib/app-settings";
import { Link } from "@tanstack/react-router";

export default function Navbar() {
  return (
    <nav className="border-b bg-background backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            {/* <div className="bg-gradient-to-r from-teal-600 to-purple-600 p-2 rounded-lg">
              <ZapIcon className="h-6 w-6 text-white" />
            </div> */}
            <span className="text-xl font-black text-slate-900 hover:text-primary transition-colors dark:text-white font-title lowercase">
              <Link to="/">{AppSettings.name}</Link>
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Avatar dropdown is now integrated into PlanBadge component */}
          </div>
        </div>
      </div>
    </nav>
  );
}
