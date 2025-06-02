import { useState } from "react";
import { getSmartDefaultFormat } from "@/lib/file-formats";
import type { FileWithPreview } from "./use-file-upload";

export function useFormatSelection() {
  const [selectedFormats, setSelectedFormats] = useState<Record<string, string>>({});

  const handleFormatChange = (fileId: string, format: string) => {
    setSelectedFormats((prev) => ({
      ...prev,
      [fileId]: format,
    }));
  };

  const handleFileRemoved = (fileId: string) => {
    setSelectedFormats((prev) => {
      const updated = { ...prev };
      delete updated[fileId];
      return updated;
    });
  };

  const clearFormats = () => {
    setSelectedFormats({});
  };

  const getSelectedFormat = (fileId: string) => {
    return selectedFormats[fileId] || "";
  };

  const setSmartDefaults = (filesWithPreview: FileWithPreview[]) => {
    const defaults: Record<string, string> = {};
    filesWithPreview.forEach((fileWithPreview) => {
      if (fileWithPreview.file instanceof File) {
        const defaultFormat = getSmartDefaultFormat(fileWithPreview.file);
        if (defaultFormat) {
          defaults[fileWithPreview.id] = defaultFormat;
        }
      }
    });
    setSelectedFormats((prev) => ({
      ...prev,
      ...defaults,
    }));
  };

  return {
    selectedFormats,
    handleFormatChange,
    handleFileRemoved,
    clearFormats,
    getSelectedFormat,
    setSmartDefaults,
  };
}
