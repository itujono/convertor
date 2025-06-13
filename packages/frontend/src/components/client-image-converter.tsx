"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAppSettings } from "@/hooks/use-app-settings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DownloadIcon, AlertCircleIcon, ZapIcon, UploadIcon, Trash2Icon, XIcon } from "lucide-react";
import { useClientImageConverter, formatFileSize } from "@/hooks/use-client-image-converter";
import { FileFormatSelector, FileQualitySelector, FileIcon } from "@/components/file-list";
import type { FileWithPreview } from "@/hooks/use-file-upload";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ClientImageConverterProps {
  files: FileWithPreview[];
  selectedFormats: Record<string, string>;
  selectedQualities: Record<string, string>;
  onFormatChange: (fileId: string, format: string) => void;
  onQualityChange: (fileId: string, quality: string) => void;
  onFileRemove: (fileId: string) => void;
  onClearAll: () => void;
  onOpenFileDialog?: () => void;
  className?: string;
}

function ImageQuickPreview({ file }: { file: FileWithPreview }) {
  return (
    <Dialog>
      <DialogTrigger asChild className="cursor-pointer">
        <Image
          width={40}
          height={40}
          src={file.preview!}
          alt={file.file instanceof File ? file.file.name : file.file.name}
          className="size-full object-contain rounded"
        />
      </DialogTrigger>
      <DialogContent className="max-w-screen-md p-0 pt-8">
        <DialogHeader>
          <DialogTitle className="sr-only">{file.file instanceof File ? file.file.name : file.file.name}</DialogTitle>
        </DialogHeader>
        <Image
          width={260}
          height={260}
          src={file.preview!}
          alt={file.file instanceof File ? file.file.name : file.file.name}
          className="size-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

export function ClientImageConverter({
  files,
  selectedFormats,
  selectedQualities,
  onFormatChange,
  onQualityChange,
  onFileRemove,
  onClearAll,
  onOpenFileDialog,
  className,
}: ClientImageConverterProps) {
  const {
    conversions,
    convertFiles,
    downloadFile,
    clearConversions,
    removeConversion,
    hasActiveConversions,
    hasCompletedConversions,
    areAllConversionsComplete,
    canConvertClientSide,
    isImageFile,
  } = useClientImageConverter();

  const { user, getRemainingConversions } = useAppSettings();
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Filter to only show image files that can be converted client-side
  const clientSideFiles = files.filter((file) => {
    if (!isImageFile(file)) return false;
    const targetFormat = selectedFormats[file.id] || "jpeg";
    return canConvertClientSide(file, targetFormat);
  });

  // Check if we should show client-side conversion UI
  const shouldShowClientSide = clientSideFiles.length > 0;

  const handleStartConversion = async () => {
    // Check remaining conversions before starting
    const remaining = getRemainingConversions();

    if (remaining.daily === 0) {
      console.warn("No remaining conversions for today");
      return;
    }

    if (clientSideFiles.length > remaining.daily) {
      console.warn(`Attempting to convert ${clientSideFiles.length} files but only ${remaining.daily} remaining`);
    }

    await convertFiles(clientSideFiles, selectedFormats, selectedQualities);
  };

  const handleClearAndReset = () => {
    clearConversions();
    onClearAll();
  };

  const getConversionForFile = (fileId: string) => {
    return conversions.find((c) => c.fileId === fileId);
  };

  // Create ZIP download with all converted files
  const downloadAllAsZip = async () => {
    const completedConversions = conversions.filter((c) => c.completed && c.result);

    if (completedConversions.length === 0) return;

    try {
      setIsDownloadingZip(true);

      // Dynamic import to reduce bundle size
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Add each converted file to the ZIP
      for (const conversion of completedConversions) {
        if (conversion.result) {
          zip.file(conversion.result.fileName, conversion.result.blob);
        }
      }

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download the ZIP
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `converted-images-${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to create ZIP:", error);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  if (!shouldShowClientSide) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <ZapIcon className="w-3 h-3" />
            Client-side Processing
          </Badge>
          <span className="text-sm text-muted-foreground">Fast & Private</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onOpenFileDialog} className="flex-1 sm:flex-none">
            <UploadIcon className="-ms-0.5 size-3.5 opacity-60" aria-hidden="true" />
            Add files
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAndReset} className="flex-1 sm:flex-none">
            <Trash2Icon className="-ms-0.5 size-3.5 opacity-60" aria-hidden="true" />
            Remove all
          </Button>
        </div>
      </div>

      <div className="w-full space-y-2">
        {clientSideFiles.map((file) => {
          const conversion = getConversionForFile(file.id);
          const selectedFormat = selectedFormats[file.id] || "";
          const selectedQuality = selectedQualities[file.id] || "medium";

          const isImage = (file.file instanceof File ? file.file.type : file.file.type).startsWith("image/");
          const isProcessing = conversion?.converting;
          const isCompleted = conversion?.completed;

          return (
            <div
              key={file.id}
              className={cn(
                "border-input flex w-full items-center gap-3 rounded-lg border p-3",
                isCompleted && "bg-green-50/50 border-green-200",
              )}
            >
              <div className="flex items-center gap-3 flex-1">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded border-2 border-dashed shrink-0",
                    isImage ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50",
                  )}
                >
                  {isImage && file.preview ? <ImageQuickPreview file={file} /> : <FileIcon file={file} />}
                </div>

                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-[13px] font-medium">
                    {file.file instanceof File ? file.file.name : file.file.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatFileSize(file.file instanceof File ? file.file.size : file.file.size)}
                    {conversion?.result && (
                      <>
                        {" → "}
                        {formatFileSize(conversion.result.convertedSize)}
                        {conversion.result.compressionRatio > 0 ? (
                          <span className="text-green-600 ml-1">(-{conversion.result.compressionRatio}%)</span>
                        ) : conversion.result.compressionRatio < 0 ? (
                          <span className="text-orange-600 ml-1">
                            (+{Math.abs(conversion.result.compressionRatio)}%)
                          </span>
                        ) : (
                          <span className="text-gray-600 ml-1">(same size)</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {isCompleted && conversion?.result ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(file.id)}
                    className="h-8 px-3 text-xs flex-1 sm:flex-none"
                  >
                    <DownloadIcon className="mr-1 size-3" />
                    Download
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      removeConversion(file.id);
                      onFileRemove(file.id);
                    }}
                    className="size-8 text-muted-foreground hover:text-red-600 shrink-0"
                    aria-label="Remove file"
                  >
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ) : !isProcessing ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full sm:w-auto">
                  <div className="flex gap-2 flex-1 sm:flex-none">
                    <FileFormatSelector
                      fileType={file.file instanceof File ? file.file.type : file.file.type}
                      fileId={file.id}
                      sourceFile={file.file}
                      selectedFormat={selectedFormat}
                      onFormatChange={onFormatChange}
                    />
                    <FileQualitySelector
                      fileId={file.id}
                      selectedQuality={selectedQuality}
                      availableQualities={[
                        { value: "low", label: "Low" },
                        { value: "medium", label: "Medium" },
                        { value: "high", label: "High" },
                      ]}
                      onQualityChange={onQualityChange}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      removeConversion(file.id);
                      onFileRemove(file.id);
                    }}
                    className="size-8 text-muted-foreground hover:text-red-600 shrink-0 self-end sm:self-auto"
                    aria-label="Remove file"
                  >
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Progress value={conversion?.progress || 0} className="w-20" />
                  <span className="text-xs text-muted-foreground">{Math.round(conversion?.progress || 0)}%</span>
                  {conversion?.saving && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-blue-600">Backing up...</span>
                    </div>
                  )}
                  {conversion?.savedToServer && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-green-600">Backed up</span>
                    </div>
                  )}
                  {conversion?.error && <AlertCircleIcon className="w-4 h-4 text-red-600" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 pt-4">
        {areAllConversionsComplete && hasCompletedConversions ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2">
              <Button onClick={downloadAllAsZip} className="px-6" disabled={isDownloadingZip}>
                <DownloadIcon className="w-4 h-4 mr-2" />
                {isDownloadingZip ? "Creating ZIP..." : "Download all as ZIP"}
              </Button>
              <Button variant="outline" onClick={handleClearAndReset}>
                Convert More Files
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              All conversions completed instantly! Downloads ready now, server backup in progress.
            </p>
          </div>
        ) : hasActiveConversions ? (
          <div className="flex flex-col items-center gap-2">
            <Button disabled className="px-6">
              <ZapIcon className="w-4 h-4 mr-2 animate-pulse" />
              Converting...
            </Button>
            <p className="text-xs text-muted-foreground">Processing files locally...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button
              onClick={handleStartConversion}
              size="lg"
              className="px-8"
              disabled={user && getRemainingConversions().daily === 0}
            >
              <ZapIcon className="w-4 h-4 mr-2" />
              Convert Instantly
            </Button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Fast client-side conversion + automatic server backup!</p>
              {user && (
                <p className="text-xs text-muted-foreground mt-1">
                  {getRemainingConversions().daily} conversions remaining today
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* {!hasActiveConversions && !hasCompletedConversions && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
          <div className="flex items-start gap-2">
            <ZapIcon className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-medium mb-1">Client-side processing benefits:</p>
              <ul className="space-y-0.5">
                <li>• Instant conversion (no upload time)</li>
                <li>• Complete privacy (files never leave your device)</li>
                <li>• No server load or bandwidth usage</li>
              </ul>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
}
