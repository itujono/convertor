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
import { Skeleton } from "./ui/skeleton";

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
      {isLoading ? (
        <Skeleton className="h-4 w-24" />
      ) : (
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
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <HelpCircleIcon size={16} className="opacity-60" aria-hidden="true" />
                  <span>Help & Support</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <BookOpenIcon size={16} className="opacity-60" aria-hidden="true" />
                  <span>Documentation</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOutIcon size={16} className="opacity-60" aria-hidden="true" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="flex gap-1 flex-row sm:items-center sm:gap-2">
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          <span className="flex items-center gap-1 text-sm">
            You&apos;re on the
            {isPremium ? <Crown className="size-3" /> : <Zap className="size-3" />}
            {formatPlanName()} plan.
          </span>
        )}

        {isLoading ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          showUpgradeButton &&
          shouldShowUpgrade &&
          (UpgradeComponent ? (
            <UpgradeComponent />
          ) : (
            <Button size="sm" variant="outline" onClick={onUpgradeClick} className="h-6 px-2 text-xs w-fit">
              Upgrade
            </Button>
          ))
        )}
      </div>
    </div>
  );
}
