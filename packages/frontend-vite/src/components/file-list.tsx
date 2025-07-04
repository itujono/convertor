"use client";

import {
  Trash2Icon,
  UploadIcon,
  XIcon,
  DownloadIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type FileWithPreview } from "@/hooks/use-file-upload";
import type { UploadProgress } from "@/hooks/use-upload-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { getAvailableFormats, getFileIconType } from "@/lib/file-formats";
import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useAppSettings } from "@/hooks/use-app-settings";

// Helper function to format file size (matching ClientImageConverter)
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface FileListProps {
  files: FileWithPreview[];
  uploadProgress: UploadProgress[];
  clientConversions?: Array<{
    fileId: string;
    progress: number;
    completed: boolean;
    converting: boolean;
    result?: {
      compressionRatio: number;
      convertedSize: number;
    };
    error?: string;
  }>;
  selectedFormats: Record<string, string>;
  selectedQualities: Record<string, string>;
  onFormatChange: (fileId: string, format: string) => void;
  onQualityChange: (fileId: string, quality: string) => void;
  onFileRemove: (fileId: string) => void;
  onOpenFileDialog: () => void;
  onClearAll: () => void;
  onAbortUpload?: (fileId: string) => void;
  onClientFileDownload?: (fileId: string) => void;
}

export function FileList({
  files,
  uploadProgress,
  clientConversions = [],
  selectedFormats,
  selectedQualities,
  ...handlers
}: FileListProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="truncate text-sm font-medium">Files ({files.length})</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlers.onOpenFileDialog}
            className="flex-1 sm:flex-none"
          >
            <UploadIcon
              className="-ms-0.5 size-3.5 opacity-60"
              aria-hidden="true"
            />
            Add files
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlers.onClearAll}
            className="flex-1 sm:flex-none"
          >
            <Trash2Icon
              className="-ms-0.5 size-3.5 opacity-60"
              aria-hidden="true"
            />
            Remove all
          </Button>
        </div>
      </div>

      <div className="w-full space-y-2">
        {files.map((file) => {
          const fileProgress = uploadProgress.find((p) => p.fileId === file.id);
          const clientConversion = clientConversions.find(
            (c) => c.fileId === file.id
          );
          const selectedFormat = selectedFormats[file.id] || "";
          const selectedQuality = selectedQualities[file.id] || "medium";

          return (
            <FileCard
              key={file.id}
              file={file}
              fileProgress={fileProgress}
              clientConversion={clientConversion}
              selectedFormat={selectedFormat}
              selectedQuality={selectedQuality}
              onFormatChange={handlers.onFormatChange}
              onQualityChange={handlers.onQualityChange}
              onRemove={handlers.onFileRemove}
              onAbortUpload={handlers.onAbortUpload}
              onClientFileDownload={handlers.onClientFileDownload}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FileCardProps {
  file: FileWithPreview;
  fileProgress?: UploadProgress;
  clientConversion?: {
    fileId: string;
    progress: number;
    completed: boolean;
    converting: boolean;
    result?: {
      compressionRatio: number;
      convertedSize: number;
    };
    error?: string;
  };
  selectedFormat: string;
  selectedQuality: string;
  onFormatChange: (fileId: string, format: string) => void;
  onQualityChange: (fileId: string, quality: string) => void;
  onRemove: (fileId: string) => void;
  onAbortUpload?: (fileId: string) => void;
  onClientFileDownload?: (fileId: string) => void;
}

export function FileCard({
  file,
  fileProgress,
  clientConversion,
  selectedFormat,
  selectedQuality,
  onFormatChange,
  onQualityChange,
  onRemove,
  onAbortUpload,
  onClientFileDownload,
}: FileCardProps) {
  // Server-side states
  const isUploading =
    fileProgress &&
    !fileProgress.completed &&
    !fileProgress.aborted &&
    !fileProgress.error;
  const isServerConverting = fileProgress && fileProgress.converting;
  const isServerCompleted = fileProgress && fileProgress.converted;
  const hasServerError = fileProgress && fileProgress.error;

  // Client-side states
  const isClientConverting = clientConversion && clientConversion.converting;
  const isClientCompleted = clientConversion && clientConversion.completed;
  const hasClientError = clientConversion && clientConversion.error;

  // Unified states
  const isConverting = isServerConverting || isClientConverting;
  const isCompleted = isServerCompleted || isClientCompleted;
  const hasError = hasServerError || hasClientError;
  const isProcessing = isUploading || isConverting;

  // Check if the file is an image
  const fileType = file.file instanceof File ? file.file.type : file.file.type;
  const isImage = fileType.startsWith("image/");
  const fileSize = file.file instanceof File ? file.file.size : file.file.size;

  return (
    <div
      className={cn(
        "border-input flex w-full items-center gap-3 rounded-lg border p-3",
        isCompleted && "bg-green-50/50 border-green-200"
      )}
    >
      <div className="flex items-center gap-3 flex-1">
        {/* File preview/icon */}
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded border-2 border-dashed shrink-0",
            isImage
              ? "border-blue-200 bg-blue-50"
              : "border-gray-200 bg-gray-50"
          )}
        >
          {isImage && file.preview ? (
            <ImageQuickPreview file={file} />
          ) : (
            <FileIcon file={file} />
          )}
        </div>

        {/* File info */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm max-w-[20rem] lg:max-w-[26rem] font-medium">
            {file.file instanceof File ? file.file.name : file.file.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatFileSize(fileSize)}
            {/* Show conversion result info if completed */}
            {isCompleted && (
              <>
                {" → "}
                {(() => {
                  // Server-side conversion result
                  if (isServerCompleted && fileProgress?.convertedFileSize) {
                    const compressionRatio = Math.round(
                      ((fileSize - fileProgress.convertedFileSize) / fileSize) *
                        100
                    );
                    return (
                      <>
                        {formatFileSize(fileProgress.convertedFileSize)}
                        {compressionRatio > 0 ? (
                          <span className="text-green-600 ml-1">
                            (-{compressionRatio}%)
                          </span>
                        ) : compressionRatio < 0 ? (
                          <span className="text-orange-600 ml-1">
                            (+{Math.abs(compressionRatio)}%)
                          </span>
                        ) : (
                          <span className="text-gray-600 ml-1">
                            (same size)
                          </span>
                        )}
                        {" • "}
                      </>
                    );
                  }
                  // Client-side conversion result
                  else if (isClientCompleted && clientConversion?.result) {
                    const compressionRatio =
                      clientConversion.result.compressionRatio || 0;
                    return (
                      <>
                        {formatFileSize(clientConversion.result.convertedSize)}
                        {compressionRatio > 0 ? (
                          <span className="text-green-600 ml-1">
                            (-{compressionRatio}%)
                          </span>
                        ) : compressionRatio < 0 ? (
                          <span className="text-orange-600 ml-1">
                            (+{Math.abs(compressionRatio)}%)
                          </span>
                        ) : (
                          <span className="text-gray-600 ml-1">
                            (same size)
                          </span>
                        )}
                        {" • "}
                      </>
                    );
                  }
                  return null;
                })()}
                <span className="text-green-600">Converted successfully</span>
              </>
            )}
          </p>
          {isImage && fileSize > 50 * 1024 * 1024 && (
            <Badge
              variant="secondary"
              className="mt-1 w-fit text-amber-700 bg-amber-100 border-amber-200"
            >
              Large image: will be processed on server
            </Badge>
          )}
        </div>
      </div>

      {/* Controls */}
      {isCompleted &&
      (fileProgress?.downloadUrl || clientConversion?.result) ? (
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (isServerCompleted && fileProgress?.downloadUrl) {
                window.open(fileProgress.downloadUrl, "_blank");
              } else if (isClientCompleted && onClientFileDownload) {
                onClientFileDownload(file.id);
              }
            }}
            className="h-8 px-3 text-xs flex-1 sm:flex-none"
          >
            <DownloadIcon className="mr-1 size-3" />
            Download
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRemove(file.id)}
            className="size-8 text-muted-foreground hover:text-red-600 shrink-0"
            aria-label="Remove file"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      ) : !isProcessing && !hasError ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full sm:w-auto">
          <div className="flex gap-2 flex-1 sm:flex-none">
            <FileFormatSelector
              fileType={fileType}
              fileId={file.id}
              sourceFile={file.file}
              selectedFormat={selectedFormat}
              onFormatChange={onFormatChange}
            />
            <FileQualitySelector
              fileId={file.id}
              selectedQuality={selectedQuality}
              onQualityChange={onQualityChange}
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRemove(file.id)}
            className="size-8 text-muted-foreground hover:text-red-600 shrink-0 self-end sm:self-auto"
            aria-label="Remove file"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      ) : isProcessing ? (
        <div className="flex items-center gap-2">
          <Progress
            value={(() => {
              if (isClientConverting) return clientConversion?.progress || 0;
              if (isServerConverting)
                return fileProgress?.conversionProgress || 0;
              if (isUploading) return fileProgress?.progress || 0;
              return 0;
            })()}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">
            {Math.round(
              (() => {
                if (isClientConverting) return clientConversion?.progress || 0;
                if (isServerConverting)
                  return fileProgress?.conversionProgress || 0;
                if (isUploading) return fileProgress?.progress || 0;
                return 0;
              })()
            )}
            %
          </span>
          {isClientConverting && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-purple-600">Converting...</span>
            </div>
          )}
          {isServerConverting && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-blue-600">Converting...</span>
            </div>
          )}
          {isUploading && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border border-green-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-green-600">Uploading...</span>
            </div>
          )}
          {onAbortUpload && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onAbortUpload(file.id)}
              className="size-6 text-muted-foreground hover:text-red-600"
              aria-label="Cancel upload"
            >
              <XIcon className="size-3" />
            </Button>
          )}
        </div>
      ) : hasError ? (
        <div className="flex items-center gap-2">
          <AlertCircleIcon className="w-4 h-4 text-red-600" />
          <span className="text-xs text-red-600">
            {hasServerError ? fileProgress?.error : clientConversion?.error}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRemove(file.id)}
            className="size-8 text-muted-foreground hover:text-red-600 shrink-0"
            aria-label="Remove file"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface FileFormatSelectorProps {
  fileType: string;
  fileId: string;
  sourceFile: File | { name: string; size: number; type: string };
  selectedFormat: string;
  onFormatChange: (fileId: string, format: string) => void;
}

export function FileFormatSelector({
  fileType,
  fileId,
  sourceFile,
  selectedFormat,
  onFormatChange,
}: FileFormatSelectorProps) {
  const availableFormats = getAvailableFormats(fileType, sourceFile as File);

  if (availableFormats.length === 0) {
    return null;
  }

  return (
    <Select
      value={selectedFormat}
      onValueChange={(value: string) => onFormatChange(fileId, value)}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <label
          htmlFor={fileId}
          className="text-xs text-muted-foreground whitespace-nowrap"
        >
          Convert to
        </label>
        <SelectTrigger className="h-8 w-full sm:w-28 text-xs">
          <SelectValue placeholder="Convert to" />
        </SelectTrigger>
        <SelectContent>
          {availableFormats.map((format) => {
            const Icon = format.icon;
            return (
              <SelectItem key={format.value} value={format.value}>
                <span className="flex items-center gap-2">
                  <Icon className="size-3.5" />
                  <span className="truncate">{format.label}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </div>
    </Select>
  );
}

interface FileQualitySelectorProps {
  fileId: string;
  selectedQuality: string;
  onQualityChange: (fileId: string, quality: string) => void;
}

export function FileQualitySelector({
  fileId,
  selectedQuality,
  onQualityChange,
}: FileQualitySelectorProps) {
  const id = useId();
  const { planLimits, settings } = useAppSettings();

  const availableQualities = planLimits.qualityPresets.map((preset) => ({
    value: preset,
    label: preset.charAt(0).toUpperCase() + preset.slice(1),
  }));

  const allQualities = settings.conversion.qualityPresets.map((preset) => ({
    value: preset,
    label: preset.charAt(0).toUpperCase() + preset.slice(1),
  }));

  const availableValues = new Set(availableQualities.map((q) => q.value));

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <label
        htmlFor={`${fileId}-quality`}
        className="text-xs text-muted-foreground whitespace-nowrap"
      >
        Quality
      </label>
      <RadioGroup
        value={selectedQuality}
        onValueChange={(value: string) => onQualityChange(fileId, value)}
        className="flex gap-0 -space-x-px rounded-md shadow-xs w-full sm:w-auto"
      >
        {allQualities.map((quality) => {
          const isDisabled = !availableValues.has(quality.value);

          const radioButton = (
            <label
              key={quality.value}
              className={`border-input has-data-[state=checked]:border-primary/50 has-focus-visible:border-ring has-focus-visible:ring-ring/50 relative flex h-7 min-w-10 flex-1 cursor-pointer items-center justify-center border px-1.5 text-center text-xs font-medium transition-[color,box-shadow] outline-none first:rounded-s-md last:rounded-e-md has-focus-visible:ring-[3px] has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50 has-data-[state=checked]:z-10 has-data-[state=checked]:bg-primary/5 ${
                isDisabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <RadioGroupItem
                id={`${id}-${quality.value}`}
                value={quality.value}
                disabled={isDisabled}
                className="sr-only after:absolute after:inset-0"
              />
              {quality.label.charAt(0).toUpperCase()}
            </label>
          );

          if (isDisabled) {
            return (
              <Tooltip key={quality.value}>
                <TooltipTrigger asChild>{radioButton}</TooltipTrigger>
                <TooltipContent
                  className="bg-black text-white"
                  arrowClassName="fill-black"
                >
                  <p>Only available in premium</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={quality.value}>
              <TooltipTrigger asChild>{radioButton}</TooltipTrigger>
              <TooltipContent>{quality.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </RadioGroup>
    </div>
  );
}

interface FileIconProps {
  file: FileWithPreview;
}

export function FileIcon({ file }: FileIconProps) {
  const { icon: IconComponent } = getFileIconType(file);
  return <IconComponent className="size-4 opacity-60" />;
}

function ImageQuickPreview({ file }: { file: FileWithPreview }) {
  return (
    <Dialog>
      <DialogTrigger asChild className="cursor-pointer">
        <img
          width={40}
          height={40}
          src={file.preview}
          alt={file.file instanceof File ? file.file.name : file.file.name}
          className="size-full object-contain rounded"
        />
      </DialogTrigger>
      <DialogContent className="max-w-screen-md p-0 pt-8">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {file.file instanceof File ? file.file.name : file.file.name}
          </DialogTitle>
        </DialogHeader>
        <img
          width={260}
          height={260}
          src={file.preview}
          alt={file.file instanceof File ? file.file.name : file.file.name}
          className="size-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
