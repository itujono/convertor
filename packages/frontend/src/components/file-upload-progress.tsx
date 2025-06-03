import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { XIcon, CheckIcon, AlertCircleIcon, LoaderIcon } from "lucide-react";
import type { UploadProgress } from "@/hooks/use-upload-progress";

interface FileUploadProgressProps {
  fileProgress?: UploadProgress;
  onAbort?: (fileId: string) => void;
}

export function FileUploadProgress({ fileProgress, onAbort }: FileUploadProgressProps) {
  if (!fileProgress) {
    return null;
  }

  const { progress, completed, aborted, converting, converted, downloadUrl, error, fileId } = fileProgress;

  if (error) {
    return (
      <div className="mt-1 flex items-center gap-2 text-red-600">
        <AlertCircleIcon className="size-3" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (converted && downloadUrl) {
    return (
      <div className="mt-1 flex items-center gap-2 text-green-600">
        <CheckIcon className="size-3" />
        <span className="text-xs">Conversion complete</span>
      </div>
    );
  }

  if (converting) {
    const conversionProgress = fileProgress.conversionProgress || 0;

    return (
      <div className="mt-1 space-y-1">
        <div className="flex items-center gap-2 text-[#488a60]">
          <LoaderIcon className="size-3 animate-spin" />
          <span className="text-xs">Converting... {conversionProgress}%</span>
        </div>
        {conversionProgress > 0 && <Progress value={conversionProgress} className="h-1.5" />}
      </div>
    );
  }

  if (completed) {
    return (
      <div className="mt-1 flex items-center gap-2 text-green-600">
        <CheckIcon className="size-3" />
        <span className="text-xs">Upload complete</span>
      </div>
    );
  }

  if (aborted) {
    return (
      <div className="mt-1 flex items-center gap-2 text-red-600">
        <AlertCircleIcon className="size-3" />
        <span className="text-xs">Upload cancelled</span>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <Progress value={progress || 0} className="h-1.5 flex-1" />
      {/* <span className="text-muted-foreground w-10 text-xs tabular-nums">{progress || 0}%</span> */}
      {onAbort && (
        <Button
          size="icon"
          variant="ghost"
          className="size-4 text-muted-foreground hover:text-red-600"
          onClick={() => onAbort(fileId)}
          aria-label="Cancel upload"
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}
