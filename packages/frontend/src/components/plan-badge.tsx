import { Crown, Zap, ChevronDownIcon, LogOutIcon, HelpCircleIcon, BookOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/lib/auth-context";
import { UsageStats } from "@/components/usage-stats";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";

interface PlanBadgeProps {
  showUpgradeButton?: boolean;
  onUpgradeClick?: () => void;
  UpgradeComponent?: React.ComponentType;
}

export function PlanBadge({ showUpgradeButton = false, onUpgradeClick, UpgradeComponent }: PlanBadgeProps) {
  const { userPlan, formatPlanName, shouldShowUpgrade } = useAppSettings();
  const { isLoading, user, signOut, googleUser } = useAuth();

  const isPremium = userPlan === "premium";

  const handleSignOut = async () => {
    await signOut();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) return null;

  const displayName = googleUser?.full_name || user.name || "User";

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      {/* User Avatar Dropdown */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto p-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Avatar className="size-6">
                <AvatarImage src={googleUser?.avatar_url} alt={`${displayName}'s profile`} />
                <AvatarFallback className="text-xs">{getInitials(displayName || user.email)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-bold">{displayName}</span>
              <ChevronDownIcon size={12} className="opacity-60" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-w-[30rem] min-w-64">
            <DropdownMenuLabel className="flex min-w-0 flex-col">
              <span className="text-foreground truncate text-sm font-medium">{displayName}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>
              <span className="text-muted-foreground truncate text-xs font-normal mt-1">{formatPlanName()} Plan</span>
            </DropdownMenuLabel>

            {/* Compact Usage Stats in Dropdown */}
            <div className="px-3 py-2">
              <UsageStats compact />
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled>
                <HelpCircleIcon size={16} className="opacity-60" aria-hidden="true" />
                <span>Help & Support</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <BookOpenIcon size={16} className="opacity-60" aria-hidden="true" />
                <span>Documentation</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              {/* <LogOutIcon size={16} className="opacity-60" aria-hidden="true" /> */}
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Plan Badge and Usage Stats */}
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <>
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
                isPremium
                  ? "bg-gradient-to-r from-yellow-50 to-orange-50 text-yellow-800 border-yellow-200 dark:from-yellow-900/20 dark:to-orange-900/20 dark:text-yellow-200 dark:border-yellow-700"
                  : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
              )}
            >
              {isPremium ? <Crown className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
              <span>{formatPlanName()}</span>
            </div>

            {/* Compact usage stats next to plan badge */}
            <UsageStats compact />

            {showUpgradeButton && UpgradeComponent && <UpgradeComponent />}
          </>
        )}
      </div>
    </div>
  );
}
