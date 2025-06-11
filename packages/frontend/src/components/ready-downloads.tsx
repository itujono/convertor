"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { apiClient, type UserFile, type UserFilesResponse } from "@/lib/api-client";
import { formatBytes } from "@/hooks/use-file-upload";
import { useAuth } from "@/lib/auth-context";

const getIconForFormat = (format: string) => {
  const lowerFormat = format.toLowerCase();

  if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "svg"].includes(lowerFormat)) {
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

export function ReadyDownloads() {
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<UserFile | null>(null);
  const { user } = useAuth();

  const fetchUserFiles = useCallback(async () => {
    try {
      setLoading(true);
      const response: UserFilesResponse = await apiClient.getUserFiles();
      setUserFiles(response.files);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch user files:", err);
      setError("Failed to load your files");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const response: UserFilesResponse = await apiClient.getUserFiles();
      setUserFiles(response.files);
      setError(null);
    } catch (err) {
      console.error("Failed to refresh user files:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserFiles();
    }
  }, [user, fetchUserFiles]);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      handleRefresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const handleDownload = async (file: UserFile) => {
    if (!file.download_url) return;

    try {
      window.open(file.download_url, "_blank");

      await apiClient.markFileDownloaded(file.id);

      fetchUserFiles();
    } catch (err) {
      console.error("Failed to download file:", err);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await apiClient.deleteUserFile(fileId);
      fetchUserFiles();
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  };

  const handleDeleteClick = (file: UserFile) => {
    setFileToDelete(file);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;

    try {
      await apiClient.deleteUserFile(fileToDelete.id);
      setFileToDelete(null);
      fetchUserFiles();
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  };

  const handleDownloadAllAsZip = async () => {
    try {
      const filePaths = userFiles.filter((file) => file.download_url).map((file) => file.file_path);

      if (filePaths.length > 0) {
        await apiClient.downloadZip(filePaths);
      }
    } catch (err) {
      console.error("Failed to download zip:", err);
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
      return { variant: "destructive" as const, text: "Expires soon!" };
    } else if (hoursRemaining < 6) {
      return { variant: "secondary" as const, text: "Expires today" };
    }
    return { variant: "outline" as const, text: "Available" };
  };

  if (!user) return null;

  if (loading) {
    return (
      <Card className="relative bottom-10 rounded-t-none pt-8 pb-8 px-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Ready to Download</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading your files...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="relative bottom-10 rounded-t-none pt-8 pb-8 px-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">Ready to Download</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8 w-8 p-0">
              <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">{error}</div>
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
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8 w-8 p-0">
              <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">No files ready for download</div>
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
                className="h-8 px-3 w-full sm:w-auto"
              >
                <PackageIcon className="size-3 mr-1" />
                Download all as zip
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 w-8 p-0 self-end sm:self-auto"
            >
              <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <div className="rounded-md border border-amber-500/50 px-4 py-3 text-amber-600 mt-4 w-fit">
          <p className="text-sm">
            <TriangleAlert className="me-3 -mt-0.5 inline-flex text-amber-500" size={16} aria-hidden="true" />
            Files are automatically removed as soon as they are downloaded or after 24 hours
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {userFiles.map((file) => {
            const expirationStatus = getExpirationStatus(file.time_remaining);
            const FileIcon = getIconForFormat(file.converted_format);

            return (
              <div
                key={file.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg"
              >
                <div className="flex gap-3 flex-1 min-w-0">
                  <div className="flex aspect-square size-10 shrink-0 items-center justify-center rounded border">
                    <FileIcon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 mb-1">
                      <p className="font-medium truncate text-sm">{file.original_file_name}</p>
                      <Badge variant={expirationStatus.variant} className="text-xs w-fit">
                        {expirationStatus.text}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 sm:gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {file.original_format.toUpperCase()} → {file.converted_format.toUpperCase()}
                      </span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span>{formatBytes(file.file_size)}</span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {formatTimeRemaining(file.time_remaining)} left
                      </span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span className="text-xs">{formatRelativeTime(file.created_at)}</span>
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
        <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
          <AlertDialogContent>
            <div className="flex flex-col gap-2 max-sm:items-center sm:flex-row sm:gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border" aria-hidden="true">
                <CircleAlertIcon className="opacity-80 text-destructive" size={16} />
              </div>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete file?</AlertDialogTitle>
                <AlertDialogDescription>
                  You haven&apos;t downloaded this file yet. Are you sure you want to delete{" "}
                  <strong>{fileToDelete?.original_file_name}</strong>? You won&apos;t be able to download it again.
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setFileToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
