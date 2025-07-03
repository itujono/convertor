// Backend-specific app settings
// This avoids dependency on frontend code while keeping settings in sync

export const AppSettings = {
  plans: {
    free: {
      quotas: {
        conversionsPerDay: 10,
        conversionsPerMonth: 100,
      },
    },
    premium: {
      quotas: {
        conversionsPerDay: 100,
        conversionsPerMonth: 1000,
      },
    },
  },
  storage: {
    streamingUploadThresholdMB: 75,
    streamingUploadThresholdBytes: 75 * 1024 * 1024, // 75MB
  },
  conversion: {
    timeoutMinutes: 30,
    retryAttempts: 3,
  },
} as const;
