"use client";

import { Trash2Icon, UploadIcon, XIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type FileWithPreview, formatBytes } from "@/hooks/use-file-upload";
import type { UploadProgress } from "@/hooks/use-upload-progress";
import { FileUploadProgress } from "./file-upload-progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { getAvailableFormats, getFileIconType } from "@/lib/file-formats";
import { useId } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface FileListProps {
  files: FileWithPreview[];
  uploadProgress: UploadProgress[];
  selectedFormats: Record<string, string>;
  selectedQualities: Record<string, string>;
  availableQualities: Array<{ value: string; label: string }>;
  onFormatChange: (fileId: string, format: string) => void;
  onQualityChange: (fileId: string, quality: string) => void;
  onFileRemove: (fileId: string) => void;
  onOpenFileDialog: () => void;
  onClearAll: () => void;
  onAbortUpload?: (fileId: string) => void;
}

export function FileList({
  files,
  uploadProgress,
  selectedFormats,
  selectedQualities,
  availableQualities,
  ...handlers
}: FileListProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="truncate text-sm font-medium">Files ({files.length})</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlers.onOpenFileDialog} className="flex-1 sm:flex-none">
            <UploadIcon className="-ms-0.5 size-3.5 opacity-60" aria-hidden="true" />
            Add files
          </Button>
          <Button variant="outline" size="sm" onClick={handlers.onClearAll} className="flex-1 sm:flex-none">
            <Trash2Icon className="-ms-0.5 size-3.5 opacity-60" aria-hidden="true" />
            Remove all
          </Button>
        </div>
      </div>

      <div className="w-full space-y-2">
        {files.map((file) => {
          const fileProgress = uploadProgress.find((p) => p.fileId === file.id);
          const selectedFormat = selectedFormats[file.id] || "";
          const selectedQuality = selectedQualities[file.id] || "medium";

          return (
            <FileCard
              key={file.id}
              file={file}
              fileProgress={fileProgress}
              selectedFormat={selectedFormat}
              selectedQuality={selectedQuality}
              availableQualities={availableQualities}
              onFormatChange={handlers.onFormatChange}
              onQualityChange={handlers.onQualityChange}
              onRemove={handlers.onFileRemove}
              onAbortUpload={handlers.onAbortUpload}
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
  selectedFormat: string;
  selectedQuality: string;
  availableQualities: Array<{ value: string; label: string }>;
  onFormatChange: (fileId: string, format: string) => void;
  onQualityChange: (fileId: string, quality: string) => void;
  onRemove: (fileId: string) => void;
  onAbortUpload?: (fileId: string) => void;
}

export function FileCard({
  file,
  fileProgress,
  selectedFormat,
  selectedQuality,
  availableQualities,
  onFormatChange,
  onQualityChange,
  onRemove,
  onAbortUpload,
}: FileCardProps) {
  const isUploading = fileProgress && !fileProgress.completed;
  const isProcessing = fileProgress && (isUploading || fileProgress.converting);
  const isCompleted = fileProgress && fileProgress.converted;

  // Check if the file is an image
  const fileType = file.file instanceof File ? file.file.type : file.file.type;
  const isImage = fileType.startsWith("image/");

  return (
    <div
      data-uploading={isUploading || undefined}
      className="flex flex-col gap-2 rounded-lg border p-3 transition-opacity duration-300"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 overflow-hidden in-data-[uploading=true]:opacity-50 min-w-0 flex-1">
          <div
            className={cn(
              "flex aspect-square size-10 shrink-0 items-center justify-center rounded overflow-hidden",
              isImage ? "border-none" : "border",
            )}
          >
            {isImage && file.preview ? <ImageQuickPreview file={file} /> : <FileIcon file={file} />}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-[13px] font-medium">
              {file.file instanceof File ? file.file.name : file.file.name}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatBytes(file.file instanceof File ? file.file.size : file.file.size)}
            </p>
          </div>
        </div>

        {/* Show download button when converted, format selector and remove button when not processing and not completed */}
        {isCompleted && fileProgress?.downloadUrl ? (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(fileProgress.downloadUrl, "_blank")}
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
                availableQualities={availableQualities}
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
        ) : null}
      </div>

      {fileProgress && <FileUploadProgress fileProgress={fileProgress} onAbort={onAbortUpload} />}
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
    <Select value={selectedFormat} onValueChange={(value: string) => onFormatChange(fileId, value)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <label htmlFor={fileId} className="text-xs text-muted-foreground whitespace-nowrap">
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
  availableQualities: Array<{ value: string; label: string }>;
  onQualityChange: (fileId: string, quality: string) => void;
}

export function FileQualitySelector({
  fileId,
  selectedQuality,
  availableQualities,
  onQualityChange,
}: FileQualitySelectorProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <label htmlFor={`${fileId}-quality`} className="text-xs text-muted-foreground whitespace-nowrap">
        Quality
      </label>
      <RadioGroup
        value={selectedQuality}
        onValueChange={(value: string) => onQualityChange(fileId, value)}
        className="flex gap-0 -space-x-px rounded-md shadow-xs w-full sm:w-auto"
      >
        {availableQualities.map((quality) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <label
                key={quality.value}
                className="border-input has-data-[state=checked]:border-primary/50 has-focus-visible:border-ring has-focus-visible:ring-ring/50 relative flex h-7 min-w-10 flex-1 cursor-pointer items-center justify-center border px-1.5 text-center text-xs font-medium transition-[color,box-shadow] outline-none first:rounded-s-md last:rounded-e-md has-focus-visible:ring-[3px] has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50 has-data-[state=checked]:z-10 has-data-[state=checked]:bg-primary/5"
              >
                <RadioGroupItem
                  id={`${id}-${quality.value}`}
                  value={quality.value}
                  className="sr-only after:absolute after:inset-0"
                />
                {quality.label.charAt(0).toUpperCase()}
              </label>
            </TooltipTrigger>
            <TooltipContent>{quality.label}</TooltipContent>
          </Tooltip>
        ))}
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
        <Image
          width={40}
          height={40}
          src={file.preview}
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
          src={file.preview}
          alt={file.file instanceof File ? file.file.name : file.file.name}
          className="size-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
