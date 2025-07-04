import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./auth-client";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ============================================================================
// TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  plan: "free" | "premium";
  conversionCount: number;
  lastReset: string;
}

export interface UserFile {
  id: string;
  user_id: string;
  original_file_name: string;
  converted_file_name: string;
  original_format: string;
  converted_format: string;
  file_path: string;
  download_url: string | null;
  file_size: number;
  quality: string;
  status: "ready" | "expired" | "downloaded";
  expires_at: string;
  created_at: string;
  last_downloaded_at?: string;
  time_remaining: number;
}

export interface UserFilesResponse {
  files: UserFile[];
  count: number;
  cancelled?: boolean;
}

export interface UploadResponse {
  message: string;
  filePath?: string;
  uploadId?: string;
  fileName: string;
  fileSize: number;
}

export interface ConversionResponse {
  message: string;
  outputPath: string;
  downloadUrl: string;
  fileName?: string;
  fileSize?: number;
}

export interface UploadStatusResponse {
  uploadId: string;
  status: "pending" | "uploading" | "completed" | "failed";
  fileName: string;
  fileSize: number;
  filePath?: string;
  publicUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const queryKeys = {
  user: ["user"] as const,
  userFiles: ["user-files"] as const,
  userSubscription: ["user-subscription"] as const,
  uploadStatus: (uploadId: string) => ["upload-status", uploadId] as const,
  batchLimit: (fileCount: number) => ["batch-limit", fileCount] as const,
  health: ["health"] as const,
} as const;

// ============================================================================
// UTILITIES
// ============================================================================

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const now = Date.now();

    if (expiresAt > 0 && expiresAt < now) {
      console.log("Token is expired, attempting refresh...");
      try {
        const {
          data: { session: refreshedSession },
          error,
        } = await supabase.auth.refreshSession();
        if (!error && refreshedSession?.access_token) {
          console.log("Token refreshed successfully");
          return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${refreshedSession.access_token}`,
          };
        } else {
          console.log("Token refresh failed:", error);
          throw new Error("Session expired and refresh failed");
        }
      } catch (refreshError) {
        console.error("Failed to refresh expired token:", refreshError);
        throw new Error("Session expired and refresh failed");
      }
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  return { "Content-Type": "application/json" };
}

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const authHeaders = await getAuthHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { ...authHeaders, ...options.headers },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(errorData.error || "Request failed");
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timeout - please check your connection");
    }
    throw error;
  }
}

async function apiRequestWithLongTimeout(
  endpoint: string,
  options: RequestInit = {}
) {
  const authHeaders = await getAuthHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12 * 60 * 1000);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { ...authHeaders, ...options.headers },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(errorData.error || "Request failed");
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Conversion timeout - large files may take longer to process"
      );
    }
    throw error;
  }
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: () => apiRequest("/api/user"),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: (failureCount, error) => {
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

export function useUserFiles() {
  return useQuery({
    queryKey: queryKeys.userFiles,
    queryFn: (): Promise<UserFilesResponse> => apiRequest("/api/user-files"),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}

export function useUserSubscription() {
  return useQuery({
    queryKey: queryKeys.userSubscription,
    queryFn: () => apiRequest("/api/subscription"),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}

export function useUploadStatus(uploadId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.uploadStatus(uploadId),
    queryFn: () => apiRequest(`/api/upload/status/${uploadId}`),
    enabled: enabled && !!uploadId,
    refetchInterval: 2000,
    staleTime: 0,
    gcTime: 1000 * 60,
  });
}

export function useBatchLimit(fileCount: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.batchLimit(fileCount),
    queryFn: () =>
      apiRequest("/api/check-batch-limit", {
        method: "POST",
        body: JSON.stringify({ fileCount }),
      }),
    enabled: enabled && fileCount > 0,
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiRequest("/api/health"),
    staleTime: 30 * 1000,
    gcTime: 60 * 1000,
    retry: 1,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      abortSignal,
    }: {
      file: File;
      abortSignal?: AbortSignal;
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("file", file);

      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const internalController = new AbortController();
      const timeoutId = setTimeout(
        () => internalController.abort(),
        10 * 60 * 1000
      );

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => internalController.abort());
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
          method: "POST",
          headers,
          body: formData,
          signal: internalController.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Upload failed" }));
          throw new Error(errorData.error || "Upload failed");
        }

        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
          if (abortSignal?.aborted) {
            throw new Error("Upload cancelled by user");
          }
          throw new Error("Upload timeout - file may be too large");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
    },
  });
}

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
    }) =>
      apiRequestWithLongTimeout("/api/convert", {
        method: "POST",
        body: JSON.stringify({ filePath, format, quality }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

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
    }) =>
      apiRequestWithLongTimeout("/api/convert", {
        method: "POST",
        body: JSON.stringify({ uploadId, format, quality }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (plan: "monthly" | "yearly") =>
      apiRequest("/api/subscription/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      }),
  });
}

export function useMarkFileDownloaded() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) =>
      apiRequest("/api/user-files/mark-downloaded", {
        method: "POST",
        body: JSON.stringify({ fileId }),
      }),
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.userFiles });

      const previousFiles = queryClient.getQueryData<UserFilesResponse>(
        queryKeys.userFiles
      );

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
      if (context?.previousFiles) {
        queryClient.setQueryData(queryKeys.userFiles, context.previousFiles);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
    },
  });
}

export function useDeleteUserFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) =>
      apiRequest(`/api/user-files/${fileId}`, {
        method: "DELETE",
      }),
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.userFiles });

      const previousFiles = queryClient.getQueryData<UserFilesResponse>(
        queryKeys.userFiles
      );

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

export function useSaveClientConvertedFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
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
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const formData = new FormData();

      const baseName = originalFileName.split(".").slice(0, -1).join(".");
      const convertedFileName = `${baseName}_converted.${convertedFormat === "jpeg" ? "jpg" : convertedFormat}`;

      formData.append("file", blob, convertedFileName);
      formData.append("originalFileName", originalFileName);
      formData.append("originalFormat", originalFormat);
      formData.append("convertedFormat", convertedFormat);
      formData.append("quality", quality);
      formData.append("source", "client-side");

      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/client-converted`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to save converted file" }));
        throw new Error(errorData.error || "Failed to save converted file");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userFiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

// ============================================================================
// DOWNLOAD HOOKS
// ============================================================================

export function useDownloadFile() {
  return useMutation({
    mutationFn: async (filename: string) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/download/${filename}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Download failed" }));
        throw new Error(errorData.error || "Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

export function useDownloadZip() {
  return useMutation({
    mutationFn: async (fileNames: string[]) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/download/zip`, {
        method: "POST",
        headers,
        body: JSON.stringify({ filePaths: fileNames }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to download zip" }));
        throw new Error(errorData.error || "Failed to download zip");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `converted_files_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

export function useGetDownloadUrl() {
  return (filename: string) => `${API_BASE_URL}/api/download/${filename}`;
}

export function useClearUserQueries() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.removeQueries({ queryKey: queryKeys.user });
    queryClient.removeQueries({ queryKey: queryKeys.userFiles });
    queryClient.removeQueries({ queryKey: queryKeys.userSubscription });
  };
}
