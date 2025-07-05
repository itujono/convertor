import { AppSettings, getPlanLimits, type UserPlan } from "@/lib/app-settings";

// Dynamic configuration based on user plan
export const getUploadConfig = (userPlan: UserPlan = "free") => {
  const planLimits = getPlanLimits(userPlan);

  return {
    MAX_SIZE_MB: planLimits.maxFileSizeMB,
    MAX_FILES: planLimits.maxFiles,
    MAX_SIZE: planLimits.maxFileSizeBytes,
    SUPPORTED_FORMATS: planLimits.supportedFormats,
    FEATURES: planLimits.features,
  };
};

// Legacy constants for backward compatibility
export const UPLOAD_CONFIG = {
  MAX_SIZE_MB: AppSettings.plans.free.maxFileSizeMB,
  MAX_FILES: AppSettings.plans.free.maxFiles,
} as const;

export const MAX_SIZE = UPLOAD_CONFIG.MAX_SIZE_MB * 1024 * 1024;

export const initialFiles = [
  {
    name: "image-01.jpg",
    size: 1528737,
    type: "image/jpeg",
    url: "https://picsum.photos/1000/800?grayscale&random=1",
    id: "image-01-123456789",
  },
  {
    name: "audio.mp3",
    size: 1528737,
    type: "audio/mpeg",
    url: "https://example.com/audio.mp3",
    id: "audio-123456789",
  },
];
