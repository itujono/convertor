import { useState } from "react";
import { useAppSettings } from "./use-app-settings";
import type { FileWithPreview } from "./use-file-upload";

export function useQualitySelection() {
  const { planLimits, settings } = useAppSettings();
  const [globalQuality, setGlobalQuality] = useState<string>("medium");
  const [selectedQualities, setSelectedQualities] = useState<Record<string, string>>({});

  const handleQualityChange = (fileId: string, quality: string) => {
    setSelectedQualities((prev) => ({
      ...prev,
      [fileId]: quality,
    }));
  };

  const handleGlobalQualityChange = (quality: string) => {
    setGlobalQuality(quality);
    // Apply to all existing files that don't have a custom quality set
    setSelectedQualities((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((fileId) => {
        if (!updated[fileId] || updated[fileId] === globalQuality) {
          updated[fileId] = quality;
        }
      });
      return updated;
    });
  };

  const applyGlobalQualityToAll = () => {
    setSelectedQualities((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((fileId) => {
        updated[fileId] = globalQuality;
      });
      return updated;
    });
  };

  const handleFileRemoved = (fileId: string) => {
    setSelectedQualities((prev) => {
      const updated = { ...prev };
      delete updated[fileId];
      return updated;
    });
  };

  const clearQualities = () => {
    setSelectedQualities({});
  };

  const getSelectedQuality = (fileId: string) => {
    return selectedQualities[fileId] || globalQuality;
  };

  const setDefaultQualities = (filesWithPreview: FileWithPreview[]) => {
    const defaults: Record<string, string> = {};
    filesWithPreview.forEach((fileWithPreview) => {
      defaults[fileWithPreview.id] = globalQuality;
    });
    setSelectedQualities((prev) => ({
      ...prev,
      ...defaults,
    }));
  };

  const getAvailableQualities = () => {
    return planLimits.qualityPresets.map((preset) => ({
      value: preset,
      label: preset.charAt(0).toUpperCase() + preset.slice(1),
    }));
  };

  const getAllQualities = () => {
    const allQualities = settings.conversion.qualityPresets;
    return allQualities.map((preset) => ({
      value: preset,
      label: preset.charAt(0).toUpperCase() + preset.slice(1),
    }));
  };

  return {
    globalQuality,
    selectedQualities,
    handleQualityChange,
    handleGlobalQualityChange,
    applyGlobalQualityToAll,
    handleFileRemoved,
    clearQualities,
    getSelectedQuality,
    setDefaultQualities,
    getAvailableQualities,
    getAllQualities,
  };
}
