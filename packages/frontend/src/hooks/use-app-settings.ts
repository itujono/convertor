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

interface User {
  id: string;
  email: string;
  plan: UserPlan;
  isAuthenticated: boolean;
  usage?: {
    conversionsToday: number;
    conversionsThisMonth: number;
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
  getRemainingConversions: () => { daily: number; monthly: number };
  getUsagePercentage: () => { daily: number; monthly: number; storage: number };

  shouldShowUpgrade: boolean;
  shouldShowUsageStats: boolean;
  getPlanFeaturesList: () => string[];
  formatPlanName: () => string;

  settings: typeof AppSettings;
}

export function useAppSettings(): AppSettingsContext {
  const { user: authUser, session } = useAuth();

  const user: User | null = authUser
    ? {
        id: authUser.id,
        email: authUser.email,
        plan: authUser.plan as UserPlan,
        isAuthenticated: !!session,
        usage: {
          conversionsToday: authUser.conversionCount || 0, // Might want to track daily vs total separately
          conversionsThisMonth: authUser.conversionCount || 0,
          storageUsedGB: 0, // TODO: Implement storage tracking
        },
      }
    : null;

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
          error: `Not enough conversions remaining. You have ${remaining.daily} conversion${
            remaining.daily === 1 ? "" : "s"
          } left today, but trying to convert ${conversionCount} file${conversionCount === 1 ? "" : "s"}.`,
        };
      }

      return { isValid: true };
    };

    const canConvertMore = () => {
      if (!user?.usage) return true;

      return (
        user.usage.conversionsToday < planLimits.quotas.conversionsPerDay &&
        user.usage.conversionsThisMonth < planLimits.quotas.conversionsPerMonth
      );
    };

    const getRemainingConversions = () => {
      if (!user?.usage) {
        return {
          daily: planLimits.quotas.conversionsPerDay,
          monthly: planLimits.quotas.conversionsPerMonth,
        };
      }

      return {
        daily: Math.max(0, planLimits.quotas.conversionsPerDay - user.usage.conversionsToday),
        monthly: Math.max(0, planLimits.quotas.conversionsPerMonth - user.usage.conversionsThisMonth),
      };
    };

    const getUsagePercentage = () => {
      if (!user?.usage) {
        return { daily: 0, monthly: 0, storage: 0 };
      }

      return {
        daily: Math.min(100, (user.usage.conversionsToday / planLimits.quotas.conversionsPerDay) * 100),
        monthly: Math.min(100, (user.usage.conversionsThisMonth / planLimits.quotas.conversionsPerMonth) * 100),
        storage: Math.min(100, (user.usage.storageUsedGB / planLimits.quotas.storageGB) * 100),
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
  }, [user, userPlan, planLimits, isAuthenticated]);

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
