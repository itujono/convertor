import {
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HeadphonesIcon,
  ImageIcon,
  VideoIcon,
} from "lucide-react";

export interface FileFormat {
  value: string;
  label: string;
  icon: typeof ImageIcon;
}

export const imageFormats: FileFormat[] = [
  { value: "jpg", label: "JPG", icon: ImageIcon },
  { value: "png", label: "PNG", icon: ImageIcon },
  { value: "webp", label: "WebP", icon: ImageIcon },
  { value: "gif", label: "GIF", icon: ImageIcon },
  { value: "bmp", label: "BMP", icon: ImageIcon },
  { value: "tiff", label: "TIFF", icon: ImageIcon },
];

export const videoFormats: FileFormat[] = [
  { value: "mp4", label: "MP4", icon: VideoIcon },
  { value: "webm", label: "WebM", icon: VideoIcon },
  { value: "avi", label: "AVI", icon: VideoIcon },
  { value: "mov", label: "MOV", icon: VideoIcon },
  { value: "mkv", label: "MKV", icon: VideoIcon },
  { value: "wmv", label: "WMV", icon: VideoIcon },
];

export const audioFormats: FileFormat[] = [
  { value: "mp3", label: "MP3", icon: HeadphonesIcon },
  { value: "wav", label: "WAV", icon: HeadphonesIcon },
  { value: "ogg", label: "OGG", icon: HeadphonesIcon },
  { value: "m4a", label: "M4A", icon: HeadphonesIcon },
  { value: "aac", label: "AAC", icon: HeadphonesIcon },
];

export const getAvailableFormats = (fileType: string, sourceFile?: File): FileFormat[] => {
  const isImage = fileType.startsWith("image/");
  const isVideo = fileType.startsWith("video/");
  const isAudio = fileType.startsWith("audio/");

  let formats: FileFormat[] = [];

  if (isImage) formats = imageFormats;
  else if (isVideo) formats = videoFormats;
  else if (isAudio) formats = audioFormats;
  else return [];

  if (sourceFile) {
    const sourceFormat = getSourceFileFormat(sourceFile);
    if (sourceFormat) {
      formats = formats.filter((format) => format.value !== sourceFormat);
    }
  }

  return formats;
};

const getSourceFileFormat = (file: File): string | null => {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  // Image formats
  if (fileType.startsWith("image/")) {
    if (
      fileType.includes("jpeg") ||
      fileType.includes("jpg") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg")
    ) {
      return "jpg";
    }
    if (fileType.includes("png") || fileName.endsWith(".png")) {
      return "png";
    }
    if (fileType.includes("webp") || fileName.endsWith(".webp")) {
      return "webp";
    }
    if (fileType.includes("gif") || fileName.endsWith(".gif")) {
      return "gif";
    }
    if (fileType.includes("bmp") || fileName.endsWith(".bmp")) {
      return "bmp";
    }
    if (fileType.includes("tiff") || fileName.endsWith(".tiff")) {
      return "tiff";
    }
  }

  // Video formats
  if (fileType.startsWith("video/")) {
    if (fileType.includes("mp4") || fileName.endsWith(".mp4")) {
      return "mp4";
    }
    if (fileType.includes("webm") || fileName.endsWith(".webm")) {
      return "webm";
    }
    if (fileType.includes("avi") || fileName.endsWith(".avi")) {
      return "avi";
    }
    if (fileType.includes("mov") || fileName.endsWith(".mov")) {
      return "mov";
    }
    if (fileType.includes("mkv") || fileName.endsWith(".mkv")) {
      return "mkv";
    }
    if (fileType.includes("wmv") || fileName.endsWith(".wmv")) {
      return "wmv";
    }
  }

  // Audio formats
  if (fileType.startsWith("audio/")) {
    if (fileType.includes("mp3") || fileName.endsWith(".mp3")) {
      return "mp3";
    }
    if (fileType.includes("wav") || fileName.endsWith(".wav")) {
      return "wav";
    }
    if (fileType.includes("ogg") || fileName.endsWith(".ogg")) {
      return "ogg";
    }
    if (fileType.includes("m4a") || fileName.endsWith(".m4a")) {
      return "m4a";
    }
    if (fileType.includes("aac") || fileName.endsWith(".aac")) {
      return "aac";
    }
  }

  return null;
};

export const getSmartDefaultFormat = (file: File): string => {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const sourceFormat = getSourceFileFormat(file);

  // Image defaults
  if (fileType.startsWith("image/")) {
    if (fileType.includes("png") || fileName.endsWith(".png")) {
      return "jpg"; // PNG -> JPG (most popular)
    }
    if (
      fileType.includes("jpeg") ||
      fileType.includes("jpg") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg")
    ) {
      return "png"; // JPG -> PNG (popular alternative)
    }
    if (fileType.includes("gif") || fileName.endsWith(".gif")) {
      return "webp";
    }
    if (fileType.includes("webp") || fileName.endsWith(".webp")) {
      return "jpg";
    }
    if (fileType.includes("bmp") || fileName.endsWith(".bmp")) {
      return "png";
    }
    if (fileType.includes("tiff") || fileName.endsWith(".tiff")) {
      return "jpg";
    }
    return sourceFormat === "jpg" ? "png" : "jpg";
  }

  // Video defaults
  if (fileType.startsWith("video/")) {
    if (fileType.includes("mp4") || fileName.endsWith(".mp4")) {
      return "webm";
    }
    if (fileType.includes("avi") || fileName.endsWith(".avi")) {
      return "mp4";
    }
    if (fileType.includes("mov") || fileName.endsWith(".mov")) {
      return "mp4";
    }
    if (fileType.includes("mkv") || fileName.endsWith(".mkv")) {
      return "mp4";
    }
    if (fileType.includes("webm") || fileName.endsWith(".webm")) {
      return "mp4";
    }
    if (fileType.includes("wmv") || fileName.endsWith(".wmv")) {
      return "mp4";
    }
    return sourceFormat === "mp4" ? "webm" : "mp4";
  }

  // Audio defaults
  if (fileType.startsWith("audio/")) {
    if (fileType.includes("mp3") || fileName.endsWith(".mp3")) {
      return "wav";
    }
    if (fileType.includes("wav") || fileName.endsWith(".wav")) {
      return "mp3";
    }
    if (fileType.includes("m4a") || fileName.endsWith(".m4a")) {
      return "mp3";
    }
    if (fileType.includes("aac") || fileName.endsWith(".aac")) {
      return "mp3";
    }
    if (fileType.includes("ogg") || fileName.endsWith(".ogg")) {
      return "mp3";
    }
    return sourceFormat === "mp3" ? "wav" : "mp3";
  }

  return "";
};

export interface FileIconMap {
  pdf: {
    icon: typeof FileTextIcon;
    conditions: (type: string, name: string) => boolean;
  };
  archive: {
    icon: typeof FileArchiveIcon;
    conditions: (type: string, name: string) => boolean;
  };
  excel: {
    icon: typeof FileSpreadsheetIcon;
    conditions: (type: string, name: string) => boolean;
  };
  video: {
    icon: typeof VideoIcon;
    conditions: (type: string) => boolean;
  };
  audio: {
    icon: typeof HeadphonesIcon;
    conditions: (type: string) => boolean;
  };
  image: {
    icon: typeof ImageIcon;
    conditions: (type: string) => boolean;
  };
}

export const fileIconMap: FileIconMap = {
  pdf: {
    icon: FileTextIcon,
    conditions: (type: string, name: string) =>
      type.includes("pdf") ||
      name.endsWith(".pdf") ||
      type.includes("word") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx"),
  },
  archive: {
    icon: FileArchiveIcon,
    conditions: (type: string, name: string) =>
      type.includes("zip") || type.includes("archive") || name.endsWith(".zip") || name.endsWith(".rar"),
  },
  excel: {
    icon: FileSpreadsheetIcon,
    conditions: (type: string, name: string) =>
      type.includes("excel") || name.endsWith(".xls") || name.endsWith(".xlsx"),
  },
  video: {
    icon: VideoIcon,
    conditions: (type: string) => type.includes("video/"),
  },
  audio: {
    icon: HeadphonesIcon,
    conditions: (type: string) => type.includes("audio/"),
  },
  image: {
    icon: ImageIcon,
    conditions: (type: string) => type.startsWith("image/"),
  },
};

export const getFileIconType = (file: { file: File | { type: string; name: string } }) => {
  const fileType = file.file instanceof File ? file.file.type : file.file.type;
  const fileName = file.file instanceof File ? file.file.name : file.file.name;

  for (const [key, { icon, conditions }] of Object.entries(fileIconMap)) {
    if (conditions(fileType, fileName)) {
      return { key, icon };
    }
  }

  return { key: "default", icon: FileIcon };
};
