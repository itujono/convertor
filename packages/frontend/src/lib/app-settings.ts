export type UserPlan = "free" | "premium";

export interface PlanLimits {
  maxFiles: number;
  maxFileSizeMB: number;
  maxFileSizeBytes: number;
  supportedFormats: string[];
  qualityPresets: string[];
  features: {
    resumableUploads: boolean;
    batchConversion: boolean;
    priorityProcessing: boolean;
    apiAccess: boolean;
    customWatermarks: boolean;
    advancedSettings: boolean;
  };
  quotas: {
    conversionsPerDay: number;
    conversionsPerMonth: number;
    storageGB: number;
  };
  price: {
    monthly: number | null;
    yearly: number | null;
  } | null;
}

export interface AppSettings {
  plans: Record<UserPlan, PlanLimits>;
  name: string;
  url: string;
  author: {
    name: string;
    url: string;
    email: string;
  };
  supportedFileTypes: {
    images: string[];
    videos: string[];
    audio: string[];
    documents: string[]; // For future use
  };
  auth: {
    requiresLogin: boolean;
    defaultPlan: UserPlan;
  };
  conversion: {
    timeoutMinutes: number;
    retryAttempts: number;
    qualityPresets: string[];
  };
  ui: {
    showPlanUpgrade: boolean;
    showUsageStats: boolean;
    enableDarkMode: boolean;
  };
}

export const AppSettings: AppSettings = {
  name: "Convertor",
  url: "https://useconvertor.com",
  author: {
    name: "Riva",
    url: "https://x.com/rvywr",
    email: "hi@useconvertor.com",
  },
  plans: {
    free: {
      maxFiles: 5,
      maxFileSizeMB: 100,
      maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
      supportedFormats: ["image/*", "video/*", "audio/*"],
      qualityPresets: ["low", "medium"],
      features: {
        resumableUploads: false,
        batchConversion: true,
        priorityProcessing: false,
        apiAccess: false,
        customWatermarks: false,
        advancedSettings: false,
      },
      quotas: {
        conversionsPerDay: 10,
        conversionsPerMonth: 100,
        storageGB: 1,
      },
      price: null,
    },
    premium: {
      maxFiles: 10,
      maxFileSizeMB: 2048, // 2GB
      maxFileSizeBytes: 2048 * 1024 * 1024, // 2GB
      supportedFormats: ["image/*", "video/*", "audio/*"],
      qualityPresets: ["low", "medium", "high"],
      features: {
        resumableUploads: true,
        batchConversion: true,
        priorityProcessing: true,
        apiAccess: true,
        customWatermarks: true,
        advancedSettings: true,
      },
      quotas: {
        conversionsPerDay: 100,
        conversionsPerMonth: 1000,
        storageGB: 10,
      },
      price: {
        monthly: 5.99,
        yearly: 59.99,
      },
    },
  },
  supportedFileTypes: {
    images: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/bmp",
      "image/tiff",
      "image/svg+xml",
      "image/heic",
      "image/heif",
    ],
    videos: [
      "video/mp4",
      "video/webm",
      "video/avi",
      "video/mov",
      "video/mkv",
      "video/wmv",
      "video/flv",
      "video/m4v",
      "video/3gp",
      "video/quicktime",
    ],
    audio: [
      "audio/mp3",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/m4a",
      "audio/aac",
      "audio/flac",
      "audio/wma",
      "audio/opus",
    ],
    documents: [
      // For future implementation
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  auth: {
    requiresLogin: true,
    defaultPlan: "free",
  },
  conversion: {
    timeoutMinutes: 30,
    retryAttempts: 3,
    qualityPresets: ["low", "medium", "high"],
  },
  ui: {
    showPlanUpgrade: true,
    showUsageStats: true,
    enableDarkMode: true,
  },
};

export const getPlanLimits = (plan: UserPlan): PlanLimits => {
  return AppSettings.plans[plan];
};

export const isFileTypeSupported = (fileType: string, plan: UserPlan = "free"): boolean => {
  const planLimits = getPlanLimits(plan);
  return planLimits.supportedFormats.some((format) => {
    if (format.endsWith("/*")) {
      return fileType.startsWith(format.slice(0, -1));
    }
    return fileType === format;
  });
};

export const isFileSizeAllowed = (fileSizeBytes: number, plan: UserPlan): boolean => {
  const planLimits = getPlanLimits(plan);
  return fileSizeBytes <= planLimits.maxFileSizeBytes;
};

export const canUploadMoreFiles = (currentFileCount: number, plan: UserPlan): boolean => {
  const planLimits = getPlanLimits(plan);
  return currentFileCount < planLimits.maxFiles;
};

export const getFileTypeCategory = (fileType: string): keyof typeof AppSettings.supportedFileTypes | null => {
  const { supportedFileTypes } = AppSettings;

  for (const [category, types] of Object.entries(supportedFileTypes)) {
    if (types.includes(fileType)) {
      return category as keyof typeof supportedFileTypes;
    }
  }

  return null;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const getPlanDisplayName = (plan: UserPlan): string => {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
};

export const getPlanFeatures = (plan: UserPlan): string[] => {
  const limits = getPlanLimits(plan);
  const features = [];

  features.push(`Up to ${limits.maxFiles} files at once`);
  features.push(
    `${limits.maxFileSizeMB >= 1024 ? `${limits.maxFileSizeMB / 1024}GB` : `${limits.maxFileSizeMB}MB`} max file size`,
  );
  features.push(`${limits.quotas.conversionsPerMonth} conversions/month`);

  if (limits.features.resumableUploads) features.push("Resumable uploads");
  if (limits.features.priorityProcessing) features.push("Priority processing");
  if (limits.features.apiAccess) features.push("API access");
  if (limits.features.customWatermarks) features.push("Custom watermarks");
  if (limits.features.advancedSettings) features.push("Advanced settings");

  return features;
};
