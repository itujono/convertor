import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { UserFilesResponse } from "@/lib/api-client";

// Query Keys - centralized for consistency
export const queryKeys = {
  user: ["user"] as const,
  userFiles: ["user-files"] as const,
  userSubscription: ["user-subscription"] as const,
  uploadStatus: (uploadId: string) => ["upload-status", uploadId] as const,
  batchLimit: (fileCount: number) => ["batch-limit", fileCount] as const,
  health: ["health"] as const,
} as const;

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get current user data with automatic caching and background refetching
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: () => apiClient.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (
        error instanceof Error &&
        (error.message.includes("Invalid token") ||
          error.message.includes("JWT") ||
          error.message.includes("Session expired"))
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Get user files with automatic caching and cancellation support
 */
export function useUserFiles() {
  return useQuery({
    queryKey: queryKeys.userFiles,
    queryFn: () => apiClient.getUserFiles(),
    staleTime: 2 * 60 * 1000, // 2 minutes (files change more frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    refetchOnWindowFocus: true, // Refresh when user comes back to tab
  });
}

/**
 * Get user subscription status
 */
export function useUserSubscription() {
  return useQuery({
    queryKey: queryKeys.userSubscription,
    queryFn: () => apiClient.getUserSubscription(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Check upload status for async uploads
 */
export function useUploadStatus(uploadId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.uploadStatus(uploadId),
    queryFn: () => apiClient.checkUploadStatus(uploadId),
    enabled: enabled && !!uploadId,
    refetchInterval: 2000, // Poll every 2 seconds while uploading
    staleTime: 0, // Always fresh for upload status
    gcTime: 1000 * 60, // 1 minute cache
  });
}

/**
 * Check batch upload limits
 */
export function useBatchLimit(fileCount: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.batchLimit(fileCount),
    queryFn: () => apiClient.checkBatchLimit(fileCount),
    enabled: enabled && fileCount > 0,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Health check query
 */
export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiClient.healthCheck(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 60 * 1000, // 1 minute
    retry: 1,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Upload file mutation with optimistic updates
 */
export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      abortSignal,
    }: {
      file: File;
      abortSignal?: AbortSignal;
    }) => apiClient.uploadFile(file, abortSignal),
    onSuccess: () => {
      // Invalidate user files to show the new upload
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
    },
    onError: (error) => {
      console.error("Upload failed:", error);
    },
  });
}

/**
 * Convert file mutation
 */
export function useConvertFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      filePath,
      format,
      quality = "medium",
    }: {
      filePath: string;
      format: string;
      quality?: string;
    }) => apiClient.convertFile(filePath, format, quality),
    onSuccess: () => {
      // Invalidate user files to show the conversion result
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
      // Invalidate user data to update conversion count
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

/**
 * Convert file with upload ID mutation
 */
export function useConvertFileWithUploadId() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      uploadId,
      format,
      quality = "medium",
    }: {
      uploadId: string;
      format: string;
      quality?: string;
    }) => apiClient.convertFileWithUploadId(uploadId, format, quality),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

/**
 * Create checkout session mutation
 */
export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (plan: "monthly" | "yearly") =>
      apiClient.createCheckoutSession(plan),
    onError: (error) => {
      console.error("Checkout session creation failed:", error);
    },
  });
}

/**
 * Mark file as downloaded mutation with optimistic updates
 */
export function useMarkFileDownloaded() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => apiClient.markFileDownloaded(fileId),
    onMutate: async (fileId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.userFiles });

      // Snapshot the previous value
      const previousFiles = queryClient.getQueryData<UserFilesResponse>(
        queryKeys.userFiles
      );

      // Optimistically update the file status
      if (previousFiles) {
        queryClient.setQueryData<UserFilesResponse>(queryKeys.userFiles, {
          ...previousFiles,
          files: previousFiles.files.map((file) =>
            file.id === fileId
              ? {
                  ...file,
                  status: "downloaded" as const,
                  last_downloaded_at: new Date().toISOString(),
                }
              : file
          ),
        });
      }

      return { previousFiles };
    },
    onError: (error, fileId, context) => {
      // Rollback on error
      if (context?.previousFiles) {
        queryClient.setQueryData(queryKeys.userFiles, context.previousFiles);
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
    },
  });
}

/**
 * Delete user file mutation with optimistic updates
 */
export function useDeleteUserFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => apiClient.deleteUserFile(fileId),
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.userFiles });

      const previousFiles = queryClient.getQueryData<UserFilesResponse>(
        queryKeys.userFiles
      );

      // Optimistically remove the file
      if (previousFiles) {
        queryClient.setQueryData<UserFilesResponse>(queryKeys.userFiles, {
          ...previousFiles,
          files: previousFiles.files.filter((file) => file.id !== fileId),
          count: previousFiles.count - 1,
        });
      }

      return { previousFiles };
    },
    onError: (error, fileId, context) => {
      if (context?.previousFiles) {
        queryClient.setQueryData(queryKeys.userFiles, context.previousFiles);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
    },
  });
}

/**
 * Save client-converted file mutation
 */
export function useSaveClientConvertedFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      blob,
      originalFileName,
      originalFormat,
      convertedFormat,
      quality,
    }: {
      blob: Blob;
      originalFileName: string;
      originalFormat: string;
      convertedFormat: string;
      quality: string;
    }) =>
      apiClient.saveClientConvertedFile(
        blob,
        originalFileName,
        originalFormat,
        convertedFormat,
        quality
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Prefetch user files for better UX
 */
export function usePrefetchUserFiles() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.userFiles,
      queryFn: () => apiClient.getUserFiles(),
      staleTime: 2 * 60 * 1000,
    });
  };
}

/**
 * Manually refresh user data
 */
export function useRefreshUser() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user });
  };
}

/**
 * Clear all user-related queries (useful for logout)
 */
export function useClearUserQueries() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.removeQueries({ queryKey: queryKeys.user });
    queryClient.removeQueries({ queryKey: queryKeys.userFiles });
    queryClient.removeQueries({ queryKey: queryKeys.userSubscription });
  };
}
