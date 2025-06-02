import { Progress } from "@/components/ui/progress";
import { useUsageStats } from "@/hooks/use-app-settings";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "./ui/skeleton";

interface UsageStatsProps {
  compact?: boolean;
}

export function UsageStats({ compact = false }: UsageStatsProps) {
  const { getRemainingConversions, getUsagePercentage, shouldShowUsageStats, user } = useUsageStats();
  const { isLoading } = useAuth();

  if (!shouldShowUsageStats || !user?.usage) {
    return null;
  }

  const remaining = getRemainingConversions();
  const usage = getUsagePercentage();

  if (compact) {
    return isLoading ? (
      <Skeleton className="h-4 w-20" />
    ) : (
      <div className="text-xs text-muted-foreground">{remaining.daily} conversions left today</div>
    );
  }

  return (
    <div className="space-y-3 bg-card mt-10">
      <h4 className="text-sm font-bold">Usage Statistics</h4>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Daily Conversions</span>
            <span>
              {user.usage.conversionsToday} / {user.usage.conversionsToday + remaining.daily}
            </span>
          </div>
          <Progress value={usage.daily} className="h-1.5" />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Monthly Conversions</span>
            <span>
              {user.usage.conversionsThisMonth} / {user.usage.conversionsThisMonth + remaining.monthly}
            </span>
          </div>
          <Progress value={usage.monthly} className="h-1.5" />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Storage Used</span>
            <span>{user.usage.storageUsedGB.toFixed(1)} GB</span>
          </div>
          <Progress value={usage.storage} className="h-1.5" />
        </div>
      </div>

      {usage.daily >= 100 ? (
        <div className="text-xs text-red-600 dark:text-red-400">⚠️ Daily conversion limit reached</div>
      ) : usage.daily > 80 || usage.monthly > 80 ? (
        <div className="text-xs text-amber-600 dark:text-amber-400">⚠️ Approaching usage limits</div>
      ) : null}
    </div>
  );
}
