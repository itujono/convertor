import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { abortClient } from "@/lib/abort-client";
import type { FileWithPreview } from "@/hooks/use-file-upload";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface UploadProgress {
  fileId: string;
  progress: number;
  completed: boolean;
  aborted?: boolean;
  converting?: boolean;
  converted?: boolean;
  downloadUrl?: string;
  convertedFileName?: string;
  convertedFilePath?: string;
  convertedFileSize?: number;
  conversionProgress?: number;
  error?: string;
  paused?: boolean;
  retryCount?: number;
}

const uploadFile = async (
  file: File,
  onProgress: (progress: number) => void,
  onComplete: (filePath: string, uploadId?: string) => void,
  onError: (error: string) => void,
  abortSignal?: AbortSignal,
  retryCount: number = 0,
) => {
  const maxRetries = 3;

  try {
    // Check if we're online before starting
    if (!navigator.onLine) {
      onError("No internet connection. Please check your connection and try again.");
      return;
    }

    // Simulate upload progress (since we can't track real FormData upload progress easily)
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (abortSignal?.aborted) {
        clearInterval(progressInterval);
        return;
      }
      progress += Math.random() * 15; // Slower progress for large files
      if (progress < 85) {
        // Don't go to 100% until actual upload completes
        onProgress(Math.min(progress, 85));
      }
    }, 500);

    const timeoutId = setTimeout(() => {
      clearInterval(progressInterval);

      // If we have retries left and it's a timeout, try again
      if (retryCount < maxRetries) {
        toast.warning(`Upload timeout, retrying... (${retryCount + 1}/${maxRetries})`, {
          description: `Retrying upload for ${file.name}`,
        });
        setTimeout(() => {
          uploadFile(file, onProgress, onComplete, onError, abortSignal, retryCount + 1);
        }, 2000);
        return;
      }

      onError("Upload timeout - file may be too large or connection is slow");
    }, 5 * 60 * 1000);

    try {
      const response = await apiClient.uploadFile(file, abortSignal);

      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      onProgress(100);

      // Handle both sync (filePath) and async (uploadId) responses
      if (response.filePath) {
        // Synchronous upload completed
        onComplete(response.filePath);
      } else if (response.uploadId) {
        // Asynchronous upload started - pass the uploadId
        onComplete("", response.uploadId);
      } else {
        throw new Error("Invalid upload response - missing filePath and uploadId");
      }
    } catch (error) {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);

      // Check if upload was cancelled by user
      if (error instanceof Error && error.message.includes("cancelled by user")) {
        toast.info("Upload cancelled", {
          description: `Upload of ${file.name} was cancelled`,
        });
        onError("Upload cancelled by user");
        return;
      }

      // Check if it's a network error and we have retries left
      const isNetworkError =
        error instanceof Error &&
        (error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("Failed to fetch") ||
          error.message.includes("NetworkError"));

      if (isNetworkError && retryCount < maxRetries) {
        toast.warning(`Network error, retrying... (${retryCount + 1}/${maxRetries})`, {
          description: `Retrying upload for ${file.name}`,
        });
        setTimeout(() => {
          uploadFile(file, onProgress, onComplete, onError, abortSignal, retryCount + 1);
        }, 2000 * (retryCount + 1)); // Exponential backoff
        return;
      }

      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Upload failed";

    // Show specific error messages for common issues
    if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
      onError("Network error. Please check your connection and try again.");
    } else {
      onError(errorMessage);
    }
  }
};

const convertFile = async (
  fileIdentifier: string, // Either filePath or uploadId
  uploadId: string | undefined, // If provided, this is an async upload
  format: string,
  quality: string,
  onComplete: (downloadUrl: string, outputPath: string, fileName?: string, fileSize?: number) => void,
  onError: (error: string) => void,
  onProgress: (progress: number) => void,
  abortSignal?: AbortSignal,
) => {
  let progressInterval: NodeJS.Timeout | null = null;

  try {
    if (abortSignal?.aborted) return;

    let actualFilePath = fileIdentifier;

    // If we have an uploadId, we need to wait for async upload to complete first
    if (uploadId) {
      onProgress(10); // Start with some progress

      // Poll upload status until complete
      while (true) {
        if (abortSignal?.aborted) return;

        try {
          const statusResponse = await apiClient.checkUploadStatus(uploadId);

          if (statusResponse.status === "completed") {
            onProgress(50); // Upload complete, starting conversion
            actualFilePath = statusResponse.filePath || fileIdentifier;
            break;
          } else if (statusResponse.status === "failed") {
            throw new Error(statusResponse.error || "Upload failed");
          }

          // Still uploading, wait a bit
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          throw new Error(
            "Failed to check upload status: " + (error instanceof Error ? error.message : "Unknown error"),
          );
        }
      }
    }

    progressInterval = setInterval(async () => {
      if (abortSignal?.aborted) {
        if (progressInterval) clearInterval(progressInterval);
        return;
      }

      try {
        // Only poll progress if we have an actual file path (not uploadId)
        if (actualFilePath && !actualFilePath.match(/^\d+-[a-z0-9]+$/)) {
          const encodedFilePath = encodeURIComponent(actualFilePath);
          const progressUrl = `${API_BASE_URL}/api/convert/progress/${encodedFilePath}`;

          const response = await fetch(progressUrl, {
            headers: await getAuthHeaders(),
          });

          if (response.ok) {
            const progressData = await response.json();
            if (progressData.progress !== undefined) {
              // For async uploads, start progress from 50% (upload complete)
              const adjustedProgress = uploadId ? 50 + progressData.progress * 0.5 : progressData.progress;
              onProgress(adjustedProgress);
            }
          }
        }
      } catch (error) {
        // Ignore progress polling errors to avoid spam
      }
    }, 1000);

    // Call the appropriate conversion method
    const response = uploadId
      ? await apiClient.convertFileWithUploadId(uploadId, format, quality)
      : await apiClient.convertFile(fileIdentifier, format, quality);

    if (progressInterval) clearInterval(progressInterval);
    onComplete(response.downloadUrl, response.outputPath, response.fileName, response.fileSize);
  } catch (error) {
    if (progressInterval) clearInterval(progressInterval);
    onError(error instanceof Error ? error.message : "Conversion failed");
  }
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import("@/lib/auth-client");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  return {
    "Content-Type": "application/json",
  };
}

export function useUploadProgress() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [abortControllers, setAbortControllers] = useState<Map<string, AbortController>>(new Map());
  const { refreshUser } = useAuth();
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    const hasActiveUploads = uploadProgress.some((p) => (!p.completed && !p.aborted) || p.converting);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveUploads) {
        e.preventDefault();
        e.returnValue = "You have uploads/conversions in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    if (hasActiveUploads) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [uploadProgress]);

  useEffect(() => {
    const allComplete = uploadProgress.length > 0 && uploadProgress.every((p) => p.converted && !p.error && !p.aborted);

    if (allComplete && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      refreshUser();
    }

    if (uploadProgress.length === 0) {
      hasRefreshedRef.current = false;
    }
  }, [uploadProgress, refreshUser]);

  const handleFilesAdded = (
    addedFiles: FileWithPreview[],
    selectedFormats: Record<string, string>,
    selectedQualities: Record<string, string> = {},
  ) => {
    const newProgressItems = addedFiles.map((file) => ({
      fileId: file.id,
      progress: 0,
      completed: false,
      aborted: false,
    }));

    setUploadProgress((prev) => [...prev, ...newProgressItems]);

    const newControllers = new Map(abortControllers);

    addedFiles.forEach((file) => {
      if (!(file.file instanceof File)) return;

      const controller = new AbortController();
      newControllers.set(file.id, controller);

      uploadFile(
        file.file,
        (progress) => {
          setUploadProgress((prev) => prev.map((item) => (item.fileId === file.id ? { ...item, progress } : item)));
        },
        (filePath, uploadId) => {
          setUploadProgress((prev) =>
            prev.map((item) => (item.fileId === file.id ? { ...item, completed: true, converting: true } : item)),
          );

          const targetFormat = selectedFormats[file.id];
          const targetQuality = selectedQualities[file.id] || "medium";
          if (targetFormat) {
            // Add a small delay before starting conversion to allow S3 consistency
            setTimeout(() => {
              convertFile(
                filePath || uploadId || "", // Use filePath if available, otherwise uploadId
                uploadId, // Pass uploadId separately
                targetFormat,
                targetQuality,
                (downloadUrl, outputPath, fileName, fileSize) => {
                  const fullDownloadUrl = downloadUrl.startsWith("/") ? `${API_BASE_URL}${downloadUrl}` : downloadUrl;

                  setUploadProgress((prev) =>
                    prev.map((item) =>
                      item.fileId === file.id
                        ? {
                            ...item,
                            converting: false,
                            converted: true,
                            downloadUrl: fullDownloadUrl,
                            convertedFileName: fileName || downloadUrl.split("/").pop(),
                            convertedFilePath: outputPath,
                            conversionProgress: 100,
                            convertedFileSize: fileSize,
                          }
                        : item,
                    ),
                  );

                  // Show success toast for conversion
                  toast.success("Conversion complete! 🎉", {
                    description: `${fileName || "Your file"} is ready for download`,
                  });
                },
                (error) => {
                  setUploadProgress((prev) =>
                    prev.map((item) => (item.fileId === file.id ? { ...item, converting: false, error } : item)),
                  );
                },
                (progress) => {
                  setUploadProgress((prev) =>
                    prev.map((item) => (item.fileId === file.id ? { ...item, conversionProgress: progress } : item)),
                  );
                },
                controller.signal,
              );
            }, 2000); // 2 second delay
          }
        },
        (error) => {
          setUploadProgress((prev) => prev.map((item) => (item.fileId === file.id ? { ...item, error } : item)));
        },
        controller.signal,
      );
    });

    setAbortControllers(newControllers);
  };

  const abortUpload = async (fileId: string) => {
    const controller = abortControllers.get(fileId);
    const progressItem = uploadProgress.find((item) => item.fileId === fileId);

    // Abort frontend operation
    if (controller) {
      controller.abort();
      const newControllers = new Map(abortControllers);
      newControllers.delete(fileId);
      setAbortControllers(newControllers);
    }

    // Update UI immediately
    setUploadProgress((prev) => prev.map((item) => (item.fileId === fileId ? { ...item, aborted: true } : item)));

    if (progressItem) {
      try {
        // If it's an async upload, abort it server-side
        if (!progressItem.completed && !progressItem.error) {
          await abortClient.abortUpload(fileId);
        }

        // If there are files to clean up
        const filesToDelete: string[] = [];
        if (progressItem.convertedFilePath) {
          filesToDelete.push(progressItem.convertedFilePath);
        }

        if (filesToDelete.length > 0) {
          await abortClient.deleteFiles(filesToDelete);
          console.log(`✅ Cleaned up files for ${fileId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Server-side cleanup failed for ${fileId}:`, error);
        // Don't throw - the UI abort was successful
      }
    }
  };

  const handleFileRemoved = (fileId: string) => {
    abortUpload(fileId);
    setUploadProgress((prev) => prev.filter((item) => item.fileId !== fileId));
  };

  const clearProgress = async () => {
    const activeUploadsCount = uploadProgress.filter((p) => !p.completed && !p.aborted && !p.error).length;

    abortControllers.forEach((controller) => controller.abort());
    setAbortControllers(new Map());

    const uploadIds: string[] = [];
    const filePaths: string[] = [];

    uploadProgress.forEach((progress) => {
      // If there's an active upload or conversion, we need to abort it server-side
      if (!progress.completed && !progress.aborted && !progress.error) {
        // This is likely an async upload with uploadId
        const uploadId = progress.fileId; // In some cases, fileId might be the uploadId
        if (uploadId) {
          uploadIds.push(uploadId);
        }
      }

      // If there are completed uploads, collect file paths for cleanup
      if (progress.completed && progress.convertedFilePath) {
        filePaths.push(progress.convertedFilePath);
      }
    });

    setUploadProgress([]);

    if (activeUploadsCount > 0) {
      toast.success("All operations cancelled", {
        description: `Cancelled ${activeUploadsCount} active upload${
          activeUploadsCount > 1 ? "s" : ""
        } and conversions`,
      });
    }

    try {
      const abortResult = await abortClient.abortAllUploads();
      if (abortResult.success && abortResult.abortedCount && abortResult.abortedCount > 0) {
        console.log(`✅ Aborted ${abortResult.abortedCount} server-side uploads`);
      }

      if (filePaths.length > 0) {
        const deleteResult = await abortClient.deleteFiles(filePaths);
        if (deleteResult.success) {
          console.log(`✅ Cleaned up ${filePaths.length} files from S3`);
        }
      }
    } catch (error) {
      console.warn("⚠️ Some server-side cleanup operations failed:", error);
      // Don't throw - the UI cleanup was successful
    }
  };

  const areAllConversionsComplete = () => {
    return uploadProgress.length > 0 && uploadProgress.every((p) => p.converted && !p.error && !p.aborted);
  };

  const hasActiveOperations = () => {
    return uploadProgress.some(
      (p) =>
        (!p.completed && !p.aborted && !p.error) || // Still uploading
        (p.converting && !p.error), // Still converting
    );
  };

  const getConvertedFileNames = () => {
    return uploadProgress
      .filter((p) => p.converted && p.convertedFileName)
      .map((p) => p.convertedFileName!)
      .filter(Boolean);
  };

  const getConvertedFilePaths = () => {
    return uploadProgress
      .filter((p) => p.converted && p.convertedFilePath)
      .map((p) => p.convertedFilePath!)
      .filter(Boolean);
  };

  const hasConvertibleFiles = () => {
    return uploadProgress.some((p) => !p.converted && !p.error && !p.aborted && p.completed);
  };

  const hasAnyCompletedFiles = () => {
    return uploadProgress.some((p) => p.converted || p.error);
  };

  return {
    uploadProgress,
    handleFilesAdded,
    handleFileRemoved,
    clearProgress,
    abortUpload,
    areAllConversionsComplete,
    hasActiveOperations,
    getConvertedFileNames,
    getConvertedFilePaths,
    hasConvertibleFiles,
    hasAnyCompletedFiles,
  };
}
