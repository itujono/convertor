export interface ConversionLimitError {
  type: "daily_limit_reached" | "insufficient_conversions";
  message: string;
}

export const generateConversionLimitMessages = {
  dailyLimitReached: (plan: "free" | "premium"): string => {
    return `Daily conversion limit reached. ${
      plan === "free" ? "Upgrade to premium for more conversions." : "Please try again tomorrow."
    }`;
  },

  insufficientConversions: (remainingConversions: number, fileCount: number): string => {
    return `Not enough conversions remaining. You have ${remainingConversions} conversion${
      remainingConversions === 1 ? "" : "s"
    } left today, but trying to convert ${fileCount} file${fileCount === 1 ? "" : "s"}.`;
  },
};

export const checkDailyReset = (lastReset: Date | string): boolean => {
  const now = new Date();
  const lastResetDate = new Date(lastReset);

  // Check if it's a new day (daily reset)
  const nowDate = now.toDateString();
  const lastResetDateString = lastResetDate.toDateString();

  return nowDate !== lastResetDateString;
};

export const calculateRemainingConversions = (
  plan: "free" | "premium",
  conversionCount: number,
  lastReset: Date | string,
): number => {
  const dailyLimit = plan === "free" ? 10 : 100;

  if (checkDailyReset(lastReset)) {
    return dailyLimit;
  }

  return Math.max(0, dailyLimit - conversionCount);
};
