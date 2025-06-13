"use client";

import { AlertCircleIcon, FileUpIcon, DownloadIcon, CircleAlertIcon } from "lucide-react";
import { useFileUpload, formatBytes } from "@/hooks/use-file-upload";
import { useUploadProgress } from "@/hooks/use-upload-progress";
import { useFormatSelection } from "@/hooks/use-format-selection";
import { useQualitySelection } from "@/hooks/use-quality-selection";
import { useAppSettings } from "@/hooks/use-app-settings";
import { PlanBadge } from "@/components/plan-badge";
import { GlobalQualitySelector } from "@/components/global-quality-selector";
import { FileList } from "@/components/file-list";
import { PricingModal } from "@/components/pricing-modal";
import { ClientImageConverter } from "@/components/client-image-converter";
import { canConvertClientSide, isImageFile } from "@/hooks/use-client-image-converter";
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
import { apiClient } from "@/lib/api-client";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function UploadWithProgress() {
  const { planLimits, shouldShowUpgrade } = useAppSettings();
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const {
    uploadProgress,
    handleFilesAdded,
    handleFileRemoved: handleProgressFileRemoved,
    clearProgress,
    abortUpload,
    areAllConversionsComplete,
    hasActiveOperations,
    getConvertedFileNames,
    getConvertedFilePaths,
    hasConvertibleFiles,
    hasAnyCompletedFiles,
  } = useUploadProgress();
  const formatSelection = useFormatSelection();
  const qualitySelection = useQualitySelection();

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

  const handleFileRemove = (fileId: string) => {
    handleProgressFileRemoved(fileId);
    formatSelection.handleFileRemoved(fileId);
    qualitySelection.handleFileRemoved(fileId);
    fileUploadActions.removeFile(fileId);
  };

  const handleClearAll = () => {
    clearProgress();
    formatSelection.clearFormats();
    qualitySelection.clearQualities();
    fileUploadActions.clearFiles();
  };

  const handleStartConversion = () => {
    handleFilesAdded(files, formatSelection.selectedFormats, qualitySelection.selectedQualities);
  };

  // Check if there are files ready to be converted (either uploaded and ready, or not yet started)
  const hasFilesToConvert = () => {
    // Files that haven't been uploaded yet (no progress entry)
    const filesNotStarted = files.filter((file) => !uploadProgress.find((p) => p.fileId === file.id));

    // Files that are uploaded but not converted/failed
    const filesReadyToConvert = uploadProgress.filter((p) => !p.converted && !p.error && !p.aborted && p.completed);

    return filesNotStarted.length > 0 || filesReadyToConvert.length > 0;
  };

  const handleDownloadAllAsZip = async () => {
    try {
      setIsDownloadingZip(true);
      const convertedFilePaths = getConvertedFilePaths();
      if (convertedFilePaths.length > 0) {
        await apiClient.downloadZip(convertedFilePaths);
      }
    } catch (error) {
      console.error("Failed to download zip:", error);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleAbortAll = () => {
    clearProgress();
    formatSelection.clearFormats();
    qualitySelection.clearQualities();
    fileUploadActions.clearFiles();
  };

  const UpgradeButton = () => (
    <PricingModal>
      <button className="text-sm hover:text-primary/80 hover:underline text-primary">Upgrade?</button>
    </PricingModal>
  );

  return (
    <div className="flex flex-col gap-4">
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
          availableQualities={qualitySelection.getAvailableQualities()}
          allQualities={qualitySelection.getAllQualities()}
          onGlobalQualityChange={qualitySelection.handleGlobalQualityChange}
        />
      </div>

      <div className="flex flex-col gap-4">
        {/* Show upload box when there are no active operations */}
        {!hasActiveOperations() && (
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
              "has-disabled:pointer-events-none has-disabled:opacity-50",
            )}
          >
            <input {...fileUploadActions.getInputProps()} className="sr-only" aria-label="Upload files" />
            <div className="flex flex-col items-center gap-2">
              <div className="flex size-8 sm:size-10 items-center justify-center rounded-full border-2 border-background">
                <FileUpIcon className="size-3 sm:size-4" aria-hidden="true" />
              </div>
              <div className="text-center px-4">
                <p className="text-sm font-medium">
                  {hasAnyCompletedFiles() ? "Add more files to convert" : "Choose files or drag and drop"}
                </p>
                <p className="text-muted-foreground text-xs">
                  Up to {planLimits.maxFiles} files, {formatBytes(planLimits.maxFileSizeBytes)} each
                </p>
              </div>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="space-y-1">
            {errors.map((error, index) => (
              <div key={index} className="flex items-center gap-2 text-red-600">
                <AlertCircleIcon className="size-4" />
                <span className="text-sm">{error}</span>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <>
            {/* Check if we have image files that can be converted client-side */}
            {(() => {
              const imageFiles = files.filter((file) => {
                if (!isImageFile(file)) return false;
                const targetFormat = formatSelection.selectedFormats[file.id] || "jpeg";
                return canConvertClientSide(file, targetFormat);
              });

              if (imageFiles.length > 0) {
                return (
                  <ClientImageConverter
                    files={files}
                    selectedFormats={formatSelection.selectedFormats}
                    selectedQualities={qualitySelection.selectedQualities}
                    onFormatChange={formatSelection.handleFormatChange}
                    onQualityChange={qualitySelection.handleQualityChange}
                    onFileRemove={handleFileRemove}
                    onClearAll={handleClearAll}
                    onOpenFileDialog={fileUploadActions.openFileDialog}
                  />
                );
              }

              // Fallback to regular server-side processing
              return (
                <FileList
                  files={files}
                  uploadProgress={uploadProgress}
                  selectedFormats={formatSelection.selectedFormats}
                  selectedQualities={qualitySelection.selectedQualities}
                  availableQualities={qualitySelection.getAvailableQualities()}
                  onFormatChange={formatSelection.handleFormatChange}
                  onQualityChange={qualitySelection.handleQualityChange}
                  onFileRemove={handleFileRemove}
                  onOpenFileDialog={fileUploadActions.openFileDialog}
                  onClearAll={handleClearAll}
                  onAbortUpload={abortUpload}
                />
              );
            })()}

            {/* Only show action buttons for server-side conversion */}
            {(() => {
              const imageFiles = files.filter((file) => {
                if (!isImageFile(file)) return false;
                const targetFormat = formatSelection.selectedFormats[file.id] || "jpeg";
                return canConvertClientSide(file, targetFormat);
              });

              // If all files are client-side processable, don't show server-side buttons
              if (imageFiles.length === files.length) {
                return null;
              }

              return (
                <div className="flex flex-col items-center mt-6 gap-2">
                  {areAllConversionsComplete() ? (
                    <div className="flex flex-col items-center gap-2">
                      <Button
                        onClick={handleDownloadAllAsZip}
                        size="lg"
                        className="w-full sm:w-auto px-8"
                        disabled={isDownloadingZip}
                      >
                        <DownloadIcon className="w-4 h-4 mr-2" />
                        {isDownloadingZip ? "Preparing zip..." : "Download all as zip"}
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
                  ) : hasActiveOperations() ? (
                    <>
                      <Button size="lg" className="w-full sm:w-auto px-8" disabled>
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
                              <CircleAlertIcon className="opacity-80 text-destructive" size={16} />
                            </div>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to abort all operations? This will cancel all uploads and
                                conversions in progress.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleAbortAll}>Confirm</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : hasFilesToConvert() ? (
                    <Button onClick={handleStartConversion} size="lg" className="w-full sm:w-auto px-8">
                      Start converting now{" "}
                      <span role="img" aria-label="Lightning">
                        ⚡️
                      </span>
                    </Button>
                  ) : hasAnyCompletedFiles() ? (
                    <div className="flex flex-col items-center gap-2">
                      {getConvertedFilePaths().length > 0 && (
                        <Button
                          onClick={handleDownloadAllAsZip}
                          size="lg"
                          className="w-full sm:w-auto px-8"
                          disabled={isDownloadingZip}
                        >
                          <DownloadIcon className="w-4 h-4 mr-2" />
                          {isDownloadingZip ? "Preparing zip..." : "Download converted files"}
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
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
