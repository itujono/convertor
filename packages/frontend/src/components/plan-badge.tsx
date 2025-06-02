import { Crown, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const { isLoading, user } = useAuth();

  const isPremium = userPlan === "premium";

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      {isLoading ? (
        <Skeleton className="h-4 w-24" />
      ) : !user ? null : (
        <span className="text-sm font-bold">Hey, {user?.name}</span>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
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
