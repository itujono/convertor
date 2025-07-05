import { useState, useEffect, useCallback, useRef } from "react";
import {
  DownloadIcon,
  TrashIcon,
  ClockIcon,
  RefreshCwIcon,
  PackageIcon,
  ImageIcon,
  VideoIcon,
  HeadphonesIcon,
  FileIcon,
  TriangleAlert,
  CircleAlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useUserFiles,
  useDeleteUserFile,
  useDownloadZip,
  useDownloadFile,
  type UserFile,
} from "@/lib/api-hooks";
import { formatBytes } from "@/hooks/use-file-upload";
import { useAuth } from "@/lib/auth-context";

const FILES_PER_PAGE = 5;
const TIME_FOR_NEW_ZIP_MESSAGE = 6000;

function isUrlLikelyExpired(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const expires = urlObj.searchParams.get("X-Amz-Expires");
    const date = urlObj.searchParams.get("X-Amz-Date");

    if (expires && date) {
      const expirySeconds = parseInt(expires);
      const urlDate = new Date(
        date.replace(
          /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
          "$1-$2-$3T$4:$5:$6Z"
        )
      );
      const expiryTime = urlDate.getTime() + expirySeconds * 1000;
      const timeUntilExpiry = expiryTime - Date.now();

      return timeUntilExpiry < 30000;
    }

    return true;
  } catch {
    return true;
  }
}

function ImagePreview({ file }: { file: UserFile }) {
  const [imageError, setImageError] = useState(false);
  const isImage = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "bmp",
    "tiff",
    "svg",
  ].includes(file.converted_format.toLowerCase());

  const urlExpired = file.download_url
    ? isUrlLikelyExpired(file.download_url)
    : true;

  if (!isImage || !file.download_url || imageError || urlExpired) {
    const FileIcon = getIconForFormat(file.converted_format);
    return <FileIcon className="size-4 text-muted-foreground" />;
  }

  return (
    <Dialog>
      <DialogTrigger asChild className="cursor-pointer">
        <img
          width={40}
          height={40}
          src={file.download_url}
          alt={file.original_file_name}
          className="size-full object-cover rounded"
          onError={() => setImageError(true)}
        />
      </DialogTrigger>
      <DialogContent className="max-w-screen-md p-0 pt-8">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {file.original_file_name}
          </DialogTitle>
        </DialogHeader>
        <img
          width={800}
          height={600}
          src={file.download_url}
          alt={file.original_file_name}
          className="w-full h-auto object-contain max-h-[80vh]"
          onError={() => setImageError(true)}
        />
      </DialogContent>
    </Dialog>
  );
}

const getIconForFormat = (format: string) => {
  const lowerFormat = format.toLowerCase();

  if (
    ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "svg"].includes(
      lowerFormat
    )
  ) {
    return ImageIcon;
  }

  if (["mp4", "webm", "avi", "mov", "mkv", "wmv"].includes(lowerFormat)) {
    return VideoIcon;
  }

  if (["mp3", "wav", "ogg", "m4a", "aac"].includes(lowerFormat)) {
    return HeadphonesIcon;
  }

  return FileIcon;
};

const formatRelativeTime = (dateString: string) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "Just now";
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
};

function FileCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg">
      <div className="flex gap-3 flex-1 min-w-0">
        <Skeleton className="aspect-square size-10 shrink-0 rounded" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 mb-1">
            <Skeleton className="h-4 w-32 sm:w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 sm:gap-x-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Skeleton className="h-8 w-20 flex-1 sm:flex-none" />
        <Skeleton className="h-8 w-8 shrink-0" />
      </div>
    </div>
  );
}

export function ReadyDownloads() {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipDownloadMessage, setZipDownloadMessage] =
    useState("Creating ZIP...");
  const [fileToDelete, setFileToDelete] = useState<UserFile | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const zipMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();

  // Use our new hooks - so much cleaner! 🎉
  const {
    data: userFilesData,
    isLoading: loading,
    error,
    refetch,
    isRefetching: refreshing,
  } = useUserFiles();

  const deleteFile = useDeleteUserFile();
  const downloadZip = useDownloadZip();
  const downloadFile = useDownloadFile();

  const userFiles = userFilesData?.files || [];

  const handleRefresh = useCallback(async () => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    return () => {
      if (zipMessageTimeoutRef.current) {
        clearTimeout(zipMessageTimeoutRef.current);
      }
    };
  }, []);

  const handleDownload = async (file: UserFile) => {
    if (!file.file_path) return;

    try {
      // Use the full file path as the S3 key (not just the filename)
      const filePath = file.file_path;

      console.log(
        `📥 Downloading file: ${filePath} (${file.converted_file_name || file.original_file_name})`
      );

      // Use the proper download hook that handles authentication and blob download
      await downloadFile.mutateAsync(filePath);

      console.log(
        `✅ Downloaded: ${file.converted_file_name || file.original_file_name}`
      );
    } catch (err) {
      console.error("Download failed:", err);

      // Fallback: Try the direct S3 URL
      if (file.download_url) {
        console.log("Attempting fallback download via direct URL...");
        try {
          const response = await fetch(file.download_url);
          if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.converted_file_name || file.original_file_name;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            console.log(
              `✅ Downloaded via fallback: ${file.converted_file_name || file.original_file_name}`
            );
          } else {
            throw new Error(`Fetch failed: ${response.status}`);
          }
        } catch (fallbackErr) {
          console.error("Fallback download also failed:", fallbackErr);
          // Last resort: open in new tab
          window.open(file.download_url, "_blank");
        }
      } else {
        alert("Download failed. File not available.");
      }
    }
  };

  const handleDeleteClick = (file: UserFile) => {
    setFileToDelete(file);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;

    try {
      await deleteFile.mutateAsync(fileToDelete.id);
      setFileToDelete(null);

      // Reset to page 1 if current page becomes empty after deletion
      const totalPages = Math.ceil((userFiles.length - 1) / FILES_PER_PAGE);
      if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  };

  const handleDownloadAllAsZip = async () => {
    try {
      setDownloadingZip(true);
      setZipDownloadMessage("Creating ZIP...");

      zipMessageTimeoutRef.current = setTimeout(() => {
        setZipDownloadMessage("This might take a while...");
      }, TIME_FOR_NEW_ZIP_MESSAGE);

      const filePaths = userFiles
        .filter((file) => file.download_url && file.file_path)
        .map((file) => file.file_path);

      console.log(
        `📦 Attempting to download ${filePaths.length} files:`,
        filePaths
      );
      console.log(
        "📋 File details:",
        userFiles.map((f) => ({
          name: f.original_file_name,
          path: f.file_path,
          hasUrl: !!f.download_url,
        }))
      );

      if (filePaths.length > 0) {
        await downloadZip.mutateAsync(filePaths);
        console.log("✅ Zip download completed successfully");
      } else {
        console.warn("⚠️ No files found for zip download");
        throw new Error("No files available for download");
      }
    } catch (err) {
      console.error("Failed to download zip:", err);

      // Show user-friendly error message
      if (err instanceof Error && err.message.includes("No files available")) {
        alert(
          "No files are available for download. Please convert some files first."
        );
      } else {
        alert(
          "Failed to create zip file. Please try again or download files individually."
        );
      }
    } finally {
      setDownloadingZip(false);
      setZipDownloadMessage("Creating ZIP...");

      if (zipMessageTimeoutRef.current) {
        clearTimeout(zipMessageTimeoutRef.current);
        zipMessageTimeoutRef.current = null;
      }
    }
  };

  const formatTimeRemaining = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getExpirationStatus = (timeRemaining: number) => {
    const hoursRemaining = timeRemaining / (1000 * 60 * 60);

    if (hoursRemaining < 1) {
      return { variant: "destructive" as const, text: "Expires soon" };
    } else if (hoursRemaining < 6) {
      return { variant: "secondary" as const, text: "Expires today" };
    }
    return { variant: "outline" as const, text: "Available" };
  };

  // Pagination calculations
  const totalPages = Math.ceil(userFiles.length / FILES_PER_PAGE);
  const startIndex = (currentPage - 1) * FILES_PER_PAGE;
  const endIndex = startIndex + FILES_PER_PAGE;
  const currentFiles = userFiles.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  if (!user) return null;

  if (loading) {
    return (
      <Card className="relative bottom-10 rounded-t-none pt-8 pb-8 px-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Ready to Download</CardTitle>
            <div className="flex gap-2 flex-row sm:items-center sm:gap-2">
              <Skeleton className="h-8 w-32 sm:w-auto" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
          <div className="rounded-md border border-amber-500/50 px-4 py-3 text-amber-600 mt-4 w-fit">
            <p className="text-sm">
              <TriangleAlert
                className="me-3 -mt-0.5 inline-flex text-amber-500"
                size={16}
                aria-hidden="true"
              />
              Files are automatically removed after 24 hours
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <FileCardSkeleton key={index} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="relative bottom-10 rounded-t-none pt-8 pb-8 px-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Ready to Download
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCwIcon
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            {error?.message || "Failed to load files"}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (userFiles.length === 0) {
    return (
      <Card className="relative bottom-10 rounded-t-none pt-8 pb-8 px-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ready to Download</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCwIcon
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No files ready for download
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative bottom-10 rounded-t-none pt-8 pb-8 px-6">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Ready to Download ({userFiles.length})</CardTitle>
          <div className="flex gap-2 flex-row sm:items-center sm:gap-2">
            {userFiles.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllAsZip}
                disabled={downloadingZip}
                className="h-8 px-3 w-full sm:w-auto"
              >
                <PackageIcon
                  className={`size-3 mr-1 ${downloadingZip ? "animate-spin" : ""}`}
                />
                {downloadingZip ? zipDownloadMessage : "Download all as zip"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 w-8 p-0 self-end sm:self-auto"
            >
              <RefreshCwIcon
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
        <div className="rounded-md border border-amber-500/50 px-4 py-3 text-amber-600 mt-4 w-fit">
          <p className="text-sm">
            <TriangleAlert
              className="me-3 -mt-0.5 inline-flex text-amber-500"
              size={16}
              aria-hidden="true"
            />
            Files are automatically removed after 24 hours
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {currentFiles.map((file) => {
            const expirationStatus = getExpirationStatus(file.time_remaining);

            return (
              <div
                key={file.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg"
              >
                <div className="flex gap-3 flex-1 min-w-0">
                  <div className="flex aspect-square size-10 shrink-0 items-center justify-center rounded border overflow-hidden">
                    <ImagePreview file={file} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 mb-1">
                      <p className="font-medium truncate text-sm">
                        {file.original_file_name}
                      </p>
                      <Badge
                        variant={expirationStatus.variant}
                        className="text-xs w-fit"
                      >
                        {expirationStatus.text}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 sm:gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {file.original_format.toUpperCase()} →{" "}
                        {file.converted_format.toUpperCase()}
                      </span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span>{formatBytes(file.file_size)}</span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {formatTimeRemaining(file.time_remaining)} left
                      </span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span className="text-xs">
                        {formatRelativeTime(file.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    onClick={() => handleDownload(file)}
                    disabled={!file.download_url}
                    className="h-8 flex-1 sm:flex-none"
                  >
                    <DownloadIcon className="size-3 mr-1" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteClick(file)}
                    className="h-8 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0 border-transparent shadow-none"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(page)}
                    className="h-8 w-8 p-0"
                  >
                    {page}
                  </Button>
                )
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0 border-transparent shadow-none"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
      <AlertDialog
        open={!!fileToDelete}
        onOpenChange={(open) => !open && setFileToDelete(null)}
      >
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
              <AlertDialogTitle>Delete file?</AlertDialogTitle>
              <AlertDialogDescription>
                You haven&apos;t downloaded this file yet. Are you sure you want
                to delete <strong>{fileToDelete?.original_file_name}</strong>?
                You won&apos;t be able to download it again.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFileToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
