import {
  AlertCircleIcon,
  FileUpIcon,
  DownloadIcon,
  CircleAlertIcon,
} from "lucide-react";
import { useFileUpload, formatBytes } from "@/hooks/use-file-upload";
import { useUploadProgress } from "@/hooks/use-upload-progress";
import { useFormatSelection } from "@/hooks/use-format-selection";
import { useQualitySelection } from "@/hooks/use-quality-selection";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useOnlineDetector } from "@/hooks/use-online-detector";
import { PlanBadge } from "@/components/plan-badge";
import { GlobalQualitySelector } from "@/components/global-quality-selector";
import { FileList } from "@/components/file-list";
import { PricingModal } from "@/components/pricing-modal";
import {
  canConvertClientSide,
  isImageFile,
  useClientImageConverter,
} from "@/hooks/use-client-image-converter";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useDownloadZip } from "@/lib/api-hooks";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function UploadWithProgress() {
  const { planLimits, shouldShowUpgrade } = useAppSettings();
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const { isOnline, checkConnectivity } = useOnlineDetector();
  const downloadZip = useDownloadZip();

  const {
    uploadProgress,
    handleFilesAdded,
    handleFileRemoved: handleProgressFileRemoved,
    clearProgress,
    abortUpload,
    hasActiveOperations,
    getConvertedFilePaths,
    hasAnyCompletedFiles,
  } = useUploadProgress();
  const formatSelection = useFormatSelection();
  const qualitySelection = useQualitySelection();

  const {
    convertFiles: convertClientSide,
    clearConversions,
    conversions: clientConversions,
    hasActiveConversions: hasActiveClientConversions,
    hasCompletedConversions: hasCompletedClientConversions,
    downloadFile: downloadClientFile,
  } = useClientImageConverter();

  const [{ files, isDragging, errors }, fileUploadActions] = useFileUpload({
    multiple: true,
    maxFiles: planLimits.maxFiles,
    maxSize: planLimits.maxFileSizeBytes,
    initialFiles: [],
    onFilesAdded: (addedFiles) => {
      formatSelection.setSmartDefaults(addedFiles);
      qualitySelection.setDefaultQualities(addedFiles);
    },
  });

  const handleFileRemove = async (fileId: string) => {
    await handleProgressFileRemoved(fileId);
    formatSelection.handleFileRemoved(fileId);
    qualitySelection.handleFileRemoved(fileId);
    fileUploadActions.removeFile(fileId);
  };

  const handleClearAll = async () => {
    await clearProgress();
    clearConversions();
    formatSelection.clearFormats();
    qualitySelection.clearQualities();
    fileUploadActions.clearFiles();
  };

  const handleStartConversion = async () => {
    const clientSideFiles = files.filter((file) => {
      if (!isImageFile(file)) return false;
      const targetFormat = formatSelection.selectedFormats[file.id] || "jpeg";
      return canConvertClientSide(file, targetFormat);
    });

    const serverSideFiles = files.filter((file) => {
      if (isImageFile(file)) {
        const targetFormat = formatSelection.selectedFormats[file.id] || "jpeg";
        return !canConvertClientSide(file, targetFormat);
      }
      return true;
    });

    if (clientSideFiles.length > 0) {
      await convertClientSide(
        clientSideFiles,
        formatSelection.selectedFormats,
        qualitySelection.selectedQualities
      );
    }

    if (serverSideFiles.length > 0) {
      handleFilesAdded(
        serverSideFiles,
        formatSelection.selectedFormats,
        qualitySelection.selectedQualities
      );
    }
  };

  const areAllUnifiedConversionsComplete = () => {
    const allFileIds = files.map((f) => f.id);

    if (allFileIds.length === 0) return false;

    const allConverted = allFileIds.every((fileId) => {
      const clientConversion = clientConversions.find(
        (c) => c.fileId === fileId
      );
      if (clientConversion) {
        return clientConversion.completed && !clientConversion.error;
      }

      const serverConversion = uploadProgress.find((p) => p.fileId === fileId);
      if (serverConversion) {
        return serverConversion.converted && !serverConversion.error;
      }

      return false;
    });

    return allConverted;
  };

  const hasUnifiedActiveOperations = () => {
    if (hasActiveClientConversions) return true;

    if (hasActiveOperations()) return true;

    return false;
  };

  const hasFilesToConvert = () => {
    const unprocessedFiles = files.filter((file) => {
      const clientConversion = clientConversions.find(
        (c) => c.fileId === file.id
      );
      if (
        clientConversion &&
        (clientConversion.completed || clientConversion.converting)
      ) {
        return false;
      }

      const serverProgress = uploadProgress.find((p) => p.fileId === file.id);
      if (
        serverProgress &&
        (serverProgress.converted ||
          serverProgress.converting ||
          !serverProgress.error)
      ) {
        return false;
      }

      return true;
    });

    const filesReadyToConvert = uploadProgress.filter(
      (p) => !p.converted && !p.error && !p.aborted && p.completed
    );

    return unprocessedFiles.length > 0 || filesReadyToConvert.length > 0;
  };

  const getSmartConvertButtonText = () => {
    if (files.length === 0) return "Convert files";

    const fileTypes = files.map((fileWithPreview) => {
      const fileType = fileWithPreview.file.type.toLowerCase();
      if (fileType.startsWith("image/")) return "image";
      if (fileType.startsWith("video/")) return "video";
      if (fileType.startsWith("audio/")) return "audio";
      return "file";
    });

    const uniqueTypes = Array.from(new Set(fileTypes));
    const typeCounts = fileTypes.reduce(
      (acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    if (uniqueTypes.length > 1) {
      return "Convert all these files";
    }

    const singleType = uniqueTypes[0];
    const count = typeCounts[singleType];

    if (singleType === "image") {
      return count === 1 ? "Convert the image" : "Convert the images";
    }
    if (singleType === "video") {
      return count === 1 ? "Convert the video" : "Convert the videos";
    }
    if (singleType === "audio") {
      return count === 1 ? "Convert the audio" : "Convert the audio files";
    }

    return count === 1 ? "Convert the file" : "Convert all files";
  };

  const handleDownloadAllAsZip = async () => {
    try {
      setIsDownloadingZip(true);

      const clientSideConversions = clientConversions.filter(
        (c) => c.completed && c.result
      );
      const convertedFilePaths = getConvertedFilePaths();
      const totalFiles =
        clientSideConversions.length + convertedFilePaths.length;

      if (totalFiles === 0) {
        toast.error("No files to download", {
          description: "No converted files are available for download.",
        });
        return;
      }

      if (
        totalFiles > 1 ||
        (clientSideConversions.length > 0 && convertedFilePaths.length > 0)
      ) {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();

        for (const conversion of clientSideConversions) {
          if (conversion.result) {
            const response = await fetch(conversion.result.downloadUrl);
            const blob = await response.blob();
            zip.file(conversion.result.fileName, blob);
          }
        }

        if (convertedFilePaths.length > 0) {
          for (const filePath of convertedFilePaths) {
            try {
              const response = await fetch(
                `/api/download/${encodeURIComponent(filePath)}`
              );
              if (response.ok) {
                const blob = await response.blob();
                const fileName = filePath.split("/").pop() || "converted-file";
                zip.file(fileName, blob);
              }
            } catch (error) {
              console.warn(`Failed to add ${filePath} to ZIP:`, error);
            }
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `converted-files-${new Date().getTime()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("ZIP download started", {
          description: `Downloading ${totalFiles} file${totalFiles > 1 ? "s" : ""} as ZIP`,
        });
      } else if (
        clientSideConversions.length === 1 &&
        convertedFilePaths.length === 0
      ) {
        const conversion = clientSideConversions[0];
        if (conversion.result) {
          const { downloadUrl, fileName } = conversion.result;
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        toast.success("Download started", {
          description: "Downloading converted file",
        });
      } else if (
        convertedFilePaths.length === 1 &&
        clientSideConversions.length === 0
      ) {
        try {
          await downloadZip.mutateAsync(convertedFilePaths);

          toast.success("Download started", {
            description: "Downloading converted file",
          });
        } catch (error) {
          console.error("downloadZip failed:", error);
          throw error;
        }
      }
    } catch (error) {
      console.error("Failed to download files:", error);
      toast.error("Download failed", {
        description:
          error instanceof Error ? error.message : "Failed to prepare files",
      });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleAbortAll = async () => {
    await clearProgress();
    clearConversions();
    formatSelection.clearFormats();
    qualitySelection.clearQualities();
    fileUploadActions.clearFiles();
  };

  const UpgradeButton = () => (
    <button
      onClick={() => setIsPricingModalOpen(true)}
      className="text-sm hover:text-primary/80 hover:underline text-primary"
    >
      Upgrade?
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Main Upload Area */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PlanBadge
              showUpgradeButton={shouldShowUpgrade}
              onUpgradeClick={() => {}}
              UpgradeComponent={shouldShowUpgrade ? UpgradeButton : undefined}
            />
          </div>
          <GlobalQualitySelector
            globalQuality={qualitySelection.globalQuality}
            onGlobalQualityChange={qualitySelection.handleGlobalQualityChange}
          />
        </div>

        <div className="flex flex-col gap-4">
          {/* Offline indicator */}
          {!isOnline && (
            <div className="flex items-center justify-between gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">
                  📡 Offline
                </Badge>
                <span className="text-sm text-destructive">
                  No internet connection. Uploads and conversions are paused.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkConnectivity(true)}
                className="text-xs h-7 px-2"
              >
                Check Again
              </Button>
            </div>
          )}

          {/* Show upload box when there are no active operations */}
          {!hasUnifiedActiveOperations() && (
            <div
              role="button"
              onClick={fileUploadActions.openFileDialog}
              onDragEnter={fileUploadActions.handleDragEnter}
              onDragLeave={fileUploadActions.handleDragLeave}
              onDragOver={fileUploadActions.handleDragOver}
              onDrop={fileUploadActions.handleDrop}
              data-dragging={isDragging || undefined}
              className={cn(
                "flex min-h-32 sm:min-h-40 flex-col items-center justify-center rounded-xl p-4 bg-background/20",
                "border-2 border-dashed border-background",
                "py-12 sm:py-16",
                "cursor-pointer transition-colors",
                "hover:bg-background/70 data-[dragging=true]:bg-background/70",
                "has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 has-[input:focus]:ring-[3px]",
                "has-disabled:pointer-events-none has-disabled:opacity-50"
              )}
            >
              <input
                {...fileUploadActions.getInputProps()}
                className="sr-only"
                aria-label="Upload files"
              />
              <div className="flex flex-col items-center gap-2">
                <div className="flex size-8 sm:size-10 items-center justify-center rounded-full border-2 border-background">
                  <FileUpIcon className="size-3 sm:size-4" aria-hidden="true" />
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-medium">
                    {hasAnyCompletedFiles()
                      ? "Add more files to convert"
                      : "Choose files or drag and drop"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Up to {planLimits.maxFiles} files,{" "}
                    {formatBytes(planLimits.maxFileSizeBytes)} each
                  </p>
                </div>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((error, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-red-600"
                >
                  <AlertCircleIcon className="size-4" />
                  <span className="text-sm">{error}</span>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <>
              {/* Unified File List - handles both client-side and server-side processing */}
              <FileList
                files={files}
                uploadProgress={uploadProgress}
                clientConversions={clientConversions}
                selectedFormats={formatSelection.selectedFormats}
                selectedQualities={qualitySelection.selectedQualities}
                onFormatChange={formatSelection.handleFormatChange}
                onQualityChange={qualitySelection.handleQualityChange}
                onFileRemove={handleFileRemove}
                onOpenFileDialog={fileUploadActions.openFileDialog}
                onClearAll={handleClearAll}
                onAbortUpload={abortUpload}
                onClientFileDownload={downloadClientFile}
              />

              {/* Unified Action Buttons */}
              <div className="flex flex-col items-center mt-6 gap-2">
                {areAllUnifiedConversionsComplete() ? (
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      onClick={handleDownloadAllAsZip}
                      size="lg"
                      className="w-full sm:w-auto px-8"
                      disabled={isDownloadingZip}
                    >
                      <DownloadIcon className="w-4 h-4 mr-2" />
                      {isDownloadingZip
                        ? "Preparing zip..."
                        : "Download all converted files"}
                    </Button>
                    <Button
                      onClick={() => handleClearAll()}
                      variant="link"
                      size="sm"
                      className="w-full sm:w-auto px-6 mt-2"
                    >
                      Upload more files
                    </Button>
                  </div>
                ) : hasUnifiedActiveOperations() ? (
                  <>
                    <Button
                      size="lg"
                      className="w-full sm:w-auto px-8"
                      disabled
                    >
                      Processing...
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="link" className="text-destructive">
                          Abort all...
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <div className="flex flex-col gap-2 max-sm:items-center sm:flex-row sm:gap-4">
                          <div
                            className="flex size-9 shrink-0 items-center justify-center rounded-full border"
                            aria-hidden="true"
                          >
                            <CircleAlertIcon
                              className="opacity-80 text-destructive"
                              size={16}
                            />
                          </div>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to abort all operations?
                              This will cancel all uploads and conversions in
                              progress.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleAbortAll}>
                            Confirm
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : hasFilesToConvert() ? (
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      onClick={handleStartConversion}
                      size="lg"
                      className="w-full sm:w-auto px-8"
                      disabled={!isOnline}
                    >
                      {!isOnline ? (
                        "Offline - Cannot Convert"
                      ) : (
                        <>
                          {getSmartConvertButtonText()}{" "}
                          <span role="img" aria-label="Lightning">
                            ⚡️
                          </span>
                        </>
                      )}
                    </Button>
                    {(() => {
                      const clientSideCount = files.filter((file) => {
                        if (!isImageFile(file)) return false;
                        const targetFormat =
                          formatSelection.selectedFormats[file.id] || "jpeg";
                        return canConvertClientSide(file, targetFormat);
                      }).length;

                      const serverSideCount = files.length - clientSideCount;

                      if (clientSideCount > 0 && serverSideCount > 0) {
                        return (
                          <p className="text-xs text-muted-foreground text-center">
                            {clientSideCount} image
                            {clientSideCount !== 1 ? "s" : ""} convert instantly
                            • {serverSideCount} file
                            {serverSideCount !== 1 ? "s" : ""} upload to server
                          </p>
                        );
                      } else if (clientSideCount > 0) {
                        return (
                          <p className="text-xs text-muted-foreground text-center">
                            All files convert instantly in your browser
                          </p>
                        );
                      } else {
                        return (
                          <p className="text-xs text-muted-foreground text-center">
                            Files will be uploaded and processed on our servers
                          </p>
                        );
                      }
                    })()}
                  </div>
                ) : hasAnyCompletedFiles() || hasCompletedClientConversions ? (
                  <div className="flex flex-col items-center gap-2">
                    {(getConvertedFilePaths().length > 0 ||
                      clientConversions.some(
                        (c) => c.completed && c.result
                      )) && (
                      <Button
                        onClick={handleDownloadAllAsZip}
                        size="lg"
                        className="w-full sm:w-auto px-8"
                        disabled={isDownloadingZip}
                      >
                        <DownloadIcon className="w-4 h-4 mr-2" />
                        {isDownloadingZip
                          ? "Preparing zip..."
                          : "Download converted files"}
                      </Button>
                    )}
                    <Button
                      onClick={() => handleClearAll()}
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto px-6 mt-2"
                    >
                      Upload more files
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pricing Modal */}
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
      />
    </div>
  );
}
