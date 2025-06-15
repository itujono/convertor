import { useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { FileWithPreview } from "@/hooks/use-file-upload";

export interface ClientConversionOptions {
  targetFormat: "jpeg" | "png" | "webp";
  quality: "low" | "medium" | "high";
  maxWidth?: number;
  maxHeight?: number;
}

export interface ClientConversionResult {
  blob: Blob;
  fileName: string;
  originalSize: number;
  convertedSize: number;
  compressionRatio: number;
  downloadUrl: string;
}

export interface ClientConversionProgress {
  fileId: string;
  progress: number;
  completed: boolean;
  converting: boolean;
  saving?: boolean;
  savedToServer?: boolean;
  result?: ClientConversionResult;
  error?: string;
}

const QUALITY_SETTINGS = {
  low: { quality: 0.6, maxSizeMB: 1 },
  medium: { quality: 0.8, maxSizeMB: 2 },
  high: { quality: 0.9, maxSizeMB: 5 },
};

const SUPPORTED_INPUT_FORMATS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
];

export function isImageFile(file: File | FileWithPreview | { type: string }): boolean {
  const fileType =
    file instanceof File
      ? file.type
      : "file" in file
      ? file.file instanceof File
        ? file.file.type
        : file.file.type
      : file.type;
  return SUPPORTED_INPUT_FORMATS.includes(fileType.toLowerCase());
}

export function canConvertClientSide(
  file: File | FileWithPreview | { type: string; size: number },
  targetFormat: string,
): boolean {
  if (!isImageFile(file)) return false;

  // Get the actual File object for size check
  const actualFile = file instanceof File ? file : "file" in file ? file.file : file;
  const fileSize = actualFile instanceof File ? actualFile.size : actualFile.size;

  // Skip client-side conversion for very large files (>50MB) to avoid browser crashes
  if (fileSize > 50 * 1024 * 1024) return false;

  // Only convert actual File objects on client-side (not FileMetadata)
  if ("file" in file && !(file.file instanceof File)) return false;

  // Always use client-side for supported image formats
  return ["jpeg", "jpg", "png", "webp"].includes(targetFormat.toLowerCase());
}

async function convertImageClientSide(
  file: File,
  options: ClientConversionOptions,
  onProgress?: (progress: number) => void,
): Promise<ClientConversionResult> {
  if (!isImageFile(file)) {
    throw new Error("File is not a supported image format");
  }

  onProgress?.(10);

  try {
    const qualitySettings = QUALITY_SETTINGS[options.quality];

    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    onProgress?.(20);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });

    onProgress?.(40);

    let { width, height } = img;

    if (options.maxWidth || options.maxHeight) {
      const maxW = options.maxWidth || width;
      const maxH = options.maxHeight || height;

      const aspectRatio = width / height;

      if (width > maxW) {
        width = maxW;
        height = width / aspectRatio;
      }

      if (height > maxH) {
        height = maxH;
        width = height * aspectRatio;
      }
    }

    canvas.width = width;
    canvas.height = height;

    onProgress?.(60);

    ctx.drawImage(img, 0, 0, width, height);

    onProgress?.(80);

    const mimeType = `image/${options.targetFormat === "jpeg" ? "jpeg" : options.targetFormat}`;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to convert image"));
          }
        },
        mimeType,
        qualitySettings.quality,
      );
    });

    if (!blob) {
      throw new Error("Failed to generate converted image blob");
    }

    onProgress?.(90);

    let finalBlob = blob;
    if (blob.size > qualitySettings.maxSizeMB * 1024 * 1024) {
      const lowerQuality = Math.max(0.3, qualitySettings.quality - 0.2);
      const compressedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to compress image"));
            }
          },
          mimeType,
          lowerQuality,
        );
      });

      if (compressedBlob && compressedBlob.size < blob.size) {
        finalBlob = compressedBlob;
      }
    }

    onProgress?.(100);

    // Generate new filename
    const originalName = file.name.split(".").slice(0, -1).join(".");
    const extension = options.targetFormat === "jpeg" ? "jpg" : options.targetFormat;
    const newFileName = `${originalName}_converted.${extension}`;

    const downloadUrl = URL.createObjectURL(finalBlob);

    URL.revokeObjectURL(img.src);

    // Calculate size change (positive = compression, negative = expansion)
    const sizeChange = ((file.size - finalBlob.size) / file.size) * 100;

    return {
      blob: finalBlob,
      fileName: newFileName,
      originalSize: file.size,
      convertedSize: finalBlob.size,
      compressionRatio: Math.round(sizeChange),
      downloadUrl,
    };
  } catch (error) {
    throw new Error(`Conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export function useClientImageConverter() {
  const [conversions, setConversions] = useState<ClientConversionProgress[]>([]);
  const { refreshUser } = useAuth();

  const convertFiles = useCallback(
    async (
      files: FileWithPreview[],
      selectedFormats: Record<string, string>,
      selectedQualities: Record<string, string>,
    ) => {
      const imageFiles = files.filter((file) => isImageFile(file));

      if (imageFiles.length === 0) return;

      // Check batch limit before starting conversions
      try {
        await apiClient.checkBatchLimit(imageFiles.length);
      } catch (error) {
        console.error("Batch limit check failed:", error);
        // Show error for all files
        const initialProgress: ClientConversionProgress[] = imageFiles.map((file) => ({
          fileId: file.id,
          progress: 0,
          completed: false,
          converting: false,
          error: error instanceof Error ? error.message : "Conversion limit exceeded",
        }));
        setConversions(initialProgress);
        return;
      }

      // Initialize conversion progress for each file
      const initialProgress: ClientConversionProgress[] = imageFiles.map((file) => ({
        fileId: file.id,
        progress: 0,
        completed: false,
        converting: true,
      }));

      setConversions((prev) => [...prev.filter((c) => !imageFiles.some((f) => f.id === c.fileId)), ...initialProgress]);

      // Process files sequentially to avoid overwhelming the browser
      for (const file of imageFiles) {
        try {
          const targetFormat = selectedFormats[file.id] || "jpeg";
          const quality = selectedQualities[file.id] || "medium";

          // Update progress to show conversion starting
          setConversions((prev) =>
            prev.map((c) => (c.fileId === file.id ? { ...c, progress: 10, converting: true } : c)),
          );

          if (!canConvertClientSide(file, targetFormat)) {
            // Skip client-side conversion for this file
            setConversions((prev) =>
              prev.map((c) =>
                c.fileId === file.id
                  ? { ...c, converting: false, error: "File not suitable for client-side conversion" }
                  : c,
              ),
            );
            continue;
          }

          // Only convert if file.file is an actual File object
          if (!(file.file instanceof File)) {
            setConversions((prev) =>
              prev.map((c) =>
                c.fileId === file.id
                  ? { ...c, converting: false, error: "File metadata cannot be converted client-side" }
                  : c,
              ),
            );
            continue;
          }

          const result = await convertImageClientSide(
            file.file,
            {
              targetFormat: targetFormat as "jpeg" | "png" | "webp",
              quality: quality as "low" | "medium" | "high",
            },
            (progress) => {
              setConversions((prev) => prev.map((c) => (c.fileId === file.id ? { ...c, progress } : c)));
            },
          );

          // Update with completed result - IMMEDIATELY show download button
          setConversions((prev) =>
            prev.map((c) =>
              c.fileId === file.id
                ? {
                    ...c,
                    progress: 100,
                    completed: true,
                    converting: false,
                    saving: false, // Don't show saving state initially
                    result,
                  }
                : c,
            ),
          );

          // Save to server for persistence in the background (no await = async)
          const saveToServer = async () => {
            try {
              // Show saving indicator in the background
              setConversions((prev) => prev.map((c) => (c.fileId === file.id ? { ...c, saving: true } : c)));

              // We already verified file.file is a File instance above
              const originalFileName = file.file.name;
              const originalFormat = originalFileName.split(".").pop()?.toLowerCase() || "";

              await apiClient.saveClientConvertedFile(
                result.blob,
                originalFileName,
                originalFormat,
                targetFormat,
                quality,
              );

              setConversions((prev) =>
                prev.map((c) => (c.fileId === file.id ? { ...c, saving: false, savedToServer: true } : c)),
              );
            } catch (saveError) {
              console.error("Background save to server failed:", saveError);
              setConversions((prev) =>
                prev.map((c) =>
                  c.fileId === file.id
                    ? {
                        ...c,
                        saving: false,
                        savedToServer: false,
                        // Don't show error in main UI since download still works
                      }
                    : c,
                ),
              );
            }
          };

          saveToServer();
        } catch (error) {
          console.error(`Conversion failed for ${file.file.name}:`, error);
          setConversions((prev) =>
            prev.map((c) =>
              c.fileId === file.id
                ? {
                    ...c,
                    progress: 0,
                    completed: false,
                    converting: false,
                    error: error instanceof Error ? error.message : "Conversion failed",
                  }
                : c,
            ),
          );
        }
      }

      try {
        console.log("🔄 Refreshing user data after client-side conversions...");
        // Add a small delay to ensure backend database update is committed
        setTimeout(async () => {
          try {
            await refreshUser();
            console.log("✅ User data refreshed successfully after client-side conversions");
          } catch (error) {
            console.error("❌ Failed to refresh user data after client-side conversions:", error);
          }
        }, 500); // 500ms delay
      } catch (error) {
        console.warn("Failed to refresh user data after conversions:", error);
      }
    },
    [refreshUser],
  );

  const downloadFile = useCallback(
    (fileId: string) => {
      const conversion = conversions.find((c) => c.fileId === fileId);
      if (conversion?.result) {
        const { downloadUrl, fileName } = conversion.result;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    },
    [conversions],
  );

  const downloadAllAsZip = useCallback(async () => {
    const completedConversions = conversions.filter((c) => c.completed && c.result);

    if (completedConversions.length === 0) return;

    try {
      for (const conversion of completedConversions) {
        if (conversion.result) {
          downloadFile(conversion.fileId);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error("Failed to download files:", error);
    }
  }, [conversions, downloadFile]);

  const clearConversions = useCallback(() => {
    conversions.forEach((conversion) => {
      if (conversion.result?.downloadUrl) {
        URL.revokeObjectURL(conversion.result.downloadUrl);
      }
    });
    setConversions([]);
  }, [conversions]);

  const removeConversion = useCallback(
    (fileId: string) => {
      const conversion = conversions.find((c) => c.fileId === fileId);
      if (conversion?.result?.downloadUrl) {
        URL.revokeObjectURL(conversion.result.downloadUrl);
      }
      setConversions((prev) => prev.filter((c) => c.fileId !== fileId));
    },
    [conversions],
  );

  const hasActiveConversions = conversions.some((c) => c.converting);
  const hasCompletedConversions = conversions.some((c) => c.completed && !c.error);
  const areAllConversionsComplete = conversions.length > 0 && conversions.every((c) => c.completed && !c.error);

  return {
    conversions,
    convertFiles,
    downloadFile,
    downloadAllAsZip,
    clearConversions,
    removeConversion,
    hasActiveConversions,
    hasCompletedConversions,
    areAllConversionsComplete,
    canConvertClientSide,
    isImageFile,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
