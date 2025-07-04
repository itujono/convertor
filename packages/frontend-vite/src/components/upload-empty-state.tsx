import { ImageIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadEmptyStateProps {
  maxFiles: number;
  maxSizeMB: number;
  onOpenFileDialog: () => void;
}

export function UploadEmptyState({ maxFiles, maxSizeMB, onOpenFileDialog }: UploadEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
      <div
        className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
        aria-hidden="true"
      >
        <ImageIcon className="size-4 opacity-60" />
      </div>
      <p className="mb-1.5 text-sm font-medium">Drop your files here</p>
      <p className="text-muted-foreground text-xs">
        Max {maxFiles} files ∙ Up to {maxSizeMB}MB
      </p>
      <Button variant="outline" className="mt-4" onClick={onOpenFileDialog}>
        <UploadIcon className="-ms-1 opacity-60" aria-hidden="true" />
        Video, image, or audio files
      </Button>
    </div>
  );
}
