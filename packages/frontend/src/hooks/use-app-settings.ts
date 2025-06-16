"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  AppSettings,
  getPlanLimits,
  isFileTypeSupported,
  isFileSizeAllowed,
  canUploadMoreFiles,
  getFileTypeCategory,
  formatFileSize,
  getPlanDisplayName,
  getPlanFeatures,
  type UserPlan,
  type PlanLimits,
} from "@/lib/app-settings";
import {
  generateConversionLimitMessages,
  calculateRemainingConversions,
  checkDailyReset,
} from "@/lib/conversion-messages";

interface User {
  id: string;
  email: string;
  plan: UserPlan;
  isAuthenticated: boolean;
  usage?: {
    conversionsToday: number;
    storageUsedGB: number;
  };
}

export interface AppSettingsContext {
  user: User | null;
  isAuthenticated: boolean;
  userPlan: UserPlan;
  planLimits: PlanLimits;

  canUseResumableUploads: boolean;
  canUsePriorityProcessing: boolean;
  canUseApiAccess: boolean;
  canUseCustomWatermarks: boolean;
  canUseAdvancedSettings: boolean;

  validateFile: (file: File) => { isValid: boolean; error?: string };
  validateFileCount: (currentCount: number) => { isValid: boolean; error?: string };
  validateConversionCount: (conversionCount: number) => { isValid: boolean; error?: string };
  getMaxFileSize: () => number;
  getMaxFiles: () => number;

  canConvertMore: () => boolean;
  getRemainingConversions: () => { daily: number };
  getUsagePercentage: () => { daily: number; storage: number };

  shouldShowUpgrade: boolean;
  shouldShowUsageStats: boolean;
  getPlanFeaturesList: () => string[];
  formatPlanName: () => string;

  settings: typeof AppSettings;
}

export function useAppSettings(): AppSettingsContext {
  const { user: authUser, session } = useAuth();

  // Create a cache-busting key that changes when user data changes
  const userDataKey = authUser ? `${authUser.id}-${authUser.conversionCount}-${authUser.lastReset}` : "no-user";

  const user: User | null = useMemo(
    () =>
      authUser
        ? {
            id: authUser.id,
            email: authUser.email,
            plan: authUser.plan as UserPlan,
            isAuthenticated: !!session,
            usage: {
              // Calculate proper conversions today using daily reset logic
              conversionsToday: checkDailyReset(authUser.lastReset) ? 0 : authUser.conversionCount || 0,
              storageUsedGB: 0, // TODO: Implement storage tracking
            },
          }
        : null,
    [authUser, session],
  );

  const userPlan: UserPlan = user?.plan || AppSettings.auth.defaultPlan;
  const planLimits = getPlanLimits(userPlan);
  const isAuthenticated = user?.isAuthenticated || false;

  const context = useMemo((): AppSettingsContext => {
    const validateFile = (file: File) => {
      if (AppSettings.auth.requiresLogin && !isAuthenticated) {
        return { isValid: false, error: "Please log in to upload files" };
      }

      if (!isFileTypeSupported(file.type, userPlan)) {
        const category = getFileTypeCategory(file.type);
        return {
          isValid: false,
          error: `${category ? category.slice(0, -1) : "File type"} not supported for ${getPlanDisplayName(
            userPlan,
          )} plan`,
        };
      }

      if (!isFileSizeAllowed(file.size, userPlan)) {
        return {
          isValid: false,
          error: `File size exceeds ${formatFileSize(planLimits.maxFileSizeBytes)} limit`,
        };
      }

      return { isValid: true };
    };

    const validateFileCount = (currentCount: number) => {
      if (AppSettings.auth.requiresLogin && !isAuthenticated) {
        return { isValid: false, error: "Please log in to upload files" };
      }

      if (!canUploadMoreFiles(currentCount, userPlan)) {
        return {
          isValid: false,
          error: `Maximum ${planLimits.maxFiles} files allowed for ${getPlanDisplayName(userPlan)} plan`,
        };
      }

      return { isValid: true };
    };

    const validateConversionCount = (conversionCount: number) => {
      if (AppSettings.auth.requiresLogin && !isAuthenticated) {
        return { isValid: false, error: "Please log in to convert files" };
      }

      const remaining = getRemainingConversions();

      if (conversionCount > remaining.daily) {
        return {
          isValid: false,
          error: generateConversionLimitMessages.insufficientConversions(remaining.daily, conversionCount),
        };
      }

      return { isValid: true };
    };

    const canConvertMore = () => {
      if (!authUser) return true;

      const conversionsToday = checkDailyReset(authUser.lastReset) ? 0 : authUser.conversionCount || 0;

      return conversionsToday < planLimits.quotas.conversionsPerDay;
    };

    const getRemainingConversions = () => {
      if (!authUser) {
        return {
          daily: planLimits.quotas.conversionsPerDay,
        };
      }

      // Use the centralized calculation that handles daily resets
      const dailyRemaining = calculateRemainingConversions(
        authUser.plan as "free" | "premium",
        authUser.conversionCount,
        authUser.lastReset,
      );

      return {
        daily: dailyRemaining,
      };
    };

    const getUsagePercentage = () => {
      if (!authUser) {
        return { daily: 0, storage: 0 };
      }

      const conversionsToday = checkDailyReset(authUser.lastReset) ? 0 : authUser.conversionCount || 0;

      return {
        daily: Math.min(100, (conversionsToday / planLimits.quotas.conversionsPerDay) * 100),
        storage: 0, // TODO: Implement storage tracking
      };
    };

    return {
      user,
      isAuthenticated,
      userPlan,
      planLimits,

      canUseResumableUploads: planLimits.features.resumableUploads,
      canUsePriorityProcessing: planLimits.features.priorityProcessing,
      canUseApiAccess: planLimits.features.apiAccess,
      canUseCustomWatermarks: planLimits.features.customWatermarks,
      canUseAdvancedSettings: planLimits.features.advancedSettings,

      validateFile,
      validateFileCount,
      validateConversionCount,
      getMaxFileSize: () => planLimits.maxFileSizeBytes,
      getMaxFiles: () => planLimits.maxFiles,

      canConvertMore,
      getRemainingConversions,
      getUsagePercentage,

      shouldShowUpgrade: AppSettings.ui.showPlanUpgrade && userPlan === "free",
      shouldShowUsageStats: AppSettings.ui.showUsageStats,
      getPlanFeaturesList: () => getPlanFeatures(userPlan),
      formatPlanName: () => getPlanDisplayName(userPlan),

      settings: AppSettings,
    };
  }, [user, userPlan, planLimits, isAuthenticated, authUser, userDataKey]);

  return context;
}

export function useFileValidation() {
  const { validateFile, validateFileCount, validateConversionCount } = useAppSettings();
  return { validateFile, validateFileCount, validateConversionCount };
}

export function usePlanLimits() {
  const { planLimits, userPlan, getMaxFileSize, getMaxFiles } = useAppSettings();
  return { planLimits, userPlan, getMaxFileSize, getMaxFiles };
}

export function useUsageStats() {
  const { user, getRemainingConversions, getUsagePercentage, canConvertMore, shouldShowUsageStats } = useAppSettings();

  return {
    user,
    getRemainingConversions,
    getUsagePercentage,
    canConvertMore,
    shouldShowUsageStats,
  };
}
