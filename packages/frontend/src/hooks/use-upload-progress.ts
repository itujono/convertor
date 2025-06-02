import { useState, useEffect, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { FileWithPreview } from "@/hooks/use-file-upload";

export interface UploadProgress {
  fileId: string;
  progress: number;
  completed: boolean;
  aborted?: boolean;
  converting?: boolean;
  converted?: boolean;
  downloadUrl?: string;
  convertedFileName?: string;
  error?: string;
}

const uploadFile = async (
  file: File,
  onProgress: (progress: number) => void,
  onComplete: (filePath: string) => void,
  onError: (error: string) => void,
  abortSignal?: AbortSignal,
) => {
  try {
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
      onError("Upload timeout - file may be too large or connection is slow");
    }, 5 * 60 * 1000);

    try {
      const response = await apiClient.uploadFile(file);

      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      onProgress(100);
      onComplete(response.filePath);
    } catch (error) {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      throw error;
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : "Upload failed");
  }
};

const convertFile = async (
  filePath: string,
  format: string,
  quality: string,
  onComplete: (downloadUrl: string) => void,
  onError: (error: string) => void,
  abortSignal?: AbortSignal,
) => {
  try {
    if (abortSignal?.aborted) return;

    const response = await apiClient.convertFile(filePath, format, quality);
    onComplete(response.downloadUrl);
  } catch (error) {
    onError(error instanceof Error ? error.message : "Conversion failed");
  }
};

export function useUploadProgress() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [abortControllers, setAbortControllers] = useState<Map<string, AbortController>>(new Map());
  const { refreshUser } = useAuth();
  const hasRefreshedRef = useRef(false);

  // Prevent page refresh/close during uploads
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

    // Reset the ref when starting new uploads
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
        (filePath) => {
          setUploadProgress((prev) =>
            prev.map((item) => (item.fileId === file.id ? { ...item, completed: true, converting: true } : item)),
          );

          // Start conversion
          const targetFormat = selectedFormats[file.id];
          const targetQuality = selectedQualities[file.id] || "medium";
          if (targetFormat) {
            convertFile(
              filePath,
              targetFormat,
              targetQuality,
              (downloadUrl) => {
                const fullDownloadUrl = downloadUrl.startsWith("/")
                  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}${downloadUrl}`
                  : downloadUrl;

                setUploadProgress((prev) =>
                  prev.map((item) =>
                    item.fileId === file.id
                      ? {
                          ...item,
                          converting: false,
                          converted: true,
                          downloadUrl: fullDownloadUrl,
                          convertedFileName: downloadUrl.split("/").pop(), // Extract filename from URL
                        }
                      : item,
                  ),
                );
              },
              (error) => {
                setUploadProgress((prev) =>
                  prev.map((item) => (item.fileId === file.id ? { ...item, converting: false, error } : item)),
                );
              },
              controller.signal,
            );
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

  const abortUpload = (fileId: string) => {
    const controller = abortControllers.get(fileId);
    if (controller) {
      controller.abort();
      setUploadProgress((prev) => prev.map((item) => (item.fileId === fileId ? { ...item, aborted: true } : item)));
      const newControllers = new Map(abortControllers);
      newControllers.delete(fileId);
      setAbortControllers(newControllers);
    }
  };

  const handleFileRemoved = (fileId: string) => {
    abortUpload(fileId);
    setUploadProgress((prev) => prev.filter((item) => item.fileId !== fileId));
  };

  const clearProgress = () => {
    // Abort all active uploads
    abortControllers.forEach((controller) => controller.abort());
    setAbortControllers(new Map());
    setUploadProgress([]);
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
    hasConvertibleFiles,
    hasAnyCompletedFiles,
  };
}
