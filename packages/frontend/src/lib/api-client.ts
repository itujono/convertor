import { supabase } from "./auth-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export class ApiClient {
  private baseUrl: string;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      // Check if token is clearly expired (not just about to expire)
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const now = Date.now();

      if (expiresAt > 0 && expiresAt < now) {
        console.log("Token is expired, attempting refresh...");
        try {
          const {
            data: { session: refreshedSession },
            error,
          } = await supabase.auth.refreshSession();
          if (!error && refreshedSession?.access_token) {
            console.log("Token refreshed successfully");
            return {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshedSession.access_token}`,
            };
          } else {
            console.log("Token refresh failed:", error);
            throw new Error("Session expired and refresh failed");
          }
        } catch (refreshError) {
          console.error("Failed to refresh expired token:", refreshError);
          throw new Error("Session expired and refresh failed");
        }
      }

      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };
    }

    return {
      "Content-Type": "application/json",
    };
  }

  cancelGetUserFiles(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async getUserFiles(): Promise<UserFilesResponse> {
    this.cancelGetUserFiles();

    this.abortController = new AbortController();
    const currentController = this.abortController;

    const headers = await this.getAuthHeaders();

    try {
      const response = await fetch(`${this.baseUrl}/api/user-files`, {
        method: "GET",
        headers,
        signal: currentController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (this.abortController === currentController) {
        this.abortController = null;
      }

      return data;
    } catch (error) {
      if (this.abortController === currentController) {
        this.abortController = null;
      }

      if (error instanceof Error && error.name === "AbortError") {
        console.log("getUserFiles request was cancelled");
        return { files: [], count: 0, cancelled: true };
      }

      throw error;
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const authHeaders = await this.getAuthHeaders();

    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...authHeaders,
          ...options.headers,
        },
        signal: controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`API request failed: ${response.status} ${response.statusText} for ${endpoint}`);
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        console.error("Error data:", errorData);
        throw new Error(errorData.error || "Request failed");
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Request timeout - please check your connection");
        }
        throw error;
      }

      throw new Error("Request failed");
    }
  }

  private async requestWithLongTimeout(endpoint: string, options: RequestInit = {}) {
    const authHeaders = await this.getAuthHeaders();

    // Create an AbortController for longer timeout for conversions
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minute timeout for conversions

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...authHeaders,
          ...options.headers,
        },
        signal: controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`API request failed: ${response.status} ${response.statusText} for ${endpoint}`);
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        console.error("Error data:", errorData);
        throw new Error(errorData.error || "Request failed");
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Conversion timeout - large files may take longer to process");
        }
        throw error;
      }

      throw new Error("Request failed");
    }
  }

  async getCurrentUser() {
    return this.request("/api/user");
  }

  async uploadFile(file: File, abortSignal?: AbortSignal) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append("file", file);

    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const internalController = new AbortController();
    const timeoutId = setTimeout(() => {
      internalController.abort();
    }, 10 * 60 * 1000); // 10 minute timeout

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        internalController.abort();
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: "POST",
        headers,
        body: formData,
        signal: internalController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(errorData.error || "Upload failed");
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        if (abortSignal?.aborted) {
          throw new Error("Upload cancelled by user");
        }
        throw new Error("Upload timeout - file may be too large");
      }
      throw error;
    }
  }

  async convertFile(filePath: string, format: string, quality: string = "medium") {
    return this.requestWithLongTimeout("/api/convert", {
      method: "POST",
      body: JSON.stringify({ filePath, format, quality }),
    });
  }

  async convertFileWithUploadId(uploadId: string, format: string, quality: string = "medium") {
    return this.requestWithLongTimeout("/api/convert", {
      method: "POST",
      body: JSON.stringify({ uploadId, format, quality }),
    });
  }

  async checkUploadStatus(uploadId: string) {
    return this.request(`/api/upload/status/${uploadId}`);
  }

  async checkBatchLimit(fileCount: number) {
    return this.request("/api/check-batch-limit", {
      method: "POST",
      body: JSON.stringify({ fileCount }),
    });
  }

  getDownloadUrl(filename: string) {
    return `${this.baseUrl}/api/download/${filename}`;
  }

  async downloadFile(filename: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${this.baseUrl}/api/download/${filename}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Download failed" }));
      throw new Error(errorData.error || "Download failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async downloadZip(fileNames: string[]) {
    console.log("🗜️ downloadZip called with file paths:", fileNames);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const requestBody = { filePaths: fileNames };
    console.log("📦 Sending request body:", requestBody);
    console.log("🌐 Request URL:", `${this.baseUrl}/api/download/zip`);

    const response = await fetch(`${this.baseUrl}/api/download/zip`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log("📡 Response status:", response.status);
    console.log("📡 Response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to download zip" }));
      throw new Error(errorData.error || "Failed to download zip");
    }

    const blob = await response.blob();
    console.log("Received zip blob size:", blob.size, "bytes");

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `converted_files_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async getUserSubscription() {
    return this.request("/api/subscription");
  }

  async healthCheck() {
    return this.request("/api/health");
  }

  async markFileDownloaded(fileId: string) {
    return this.request("/api/user-files/mark-downloaded", {
      method: "POST",
      body: JSON.stringify({ fileId }),
    });
  }

  async deleteUserFile(fileId: string) {
    return this.request(`/api/user-files/${fileId}`, {
      method: "DELETE",
    });
  }

  async saveClientConvertedFile(
    blob: Blob,
    originalFileName: string,
    originalFormat: string,
    convertedFormat: string,
    quality: string,
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const formData = new FormData();

    const baseName = originalFileName.split(".").slice(0, -1).join(".");
    const convertedFileName = `${baseName}_converted.${convertedFormat === "jpeg" ? "jpg" : convertedFormat}`;

    formData.append("file", blob, convertedFileName);
    formData.append("originalFileName", originalFileName);
    formData.append("originalFormat", originalFormat);
    formData.append("convertedFormat", convertedFormat);
    formData.append("quality", quality);
    formData.append("source", "client-side");

    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${this.baseUrl}/api/client-converted`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to save converted file" }));
      throw new Error(errorData.error || "Failed to save converted file");
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

export interface User {
  id: string;
  email: string;
  name: string;
  plan: "free" | "premium";
  conversionCount: number;
  lastReset: string;
}

export interface UploadResponse {
  message: string;
  filePath?: string; // For synchronous uploads (small files)
  uploadId?: string; // For asynchronous uploads (large files)
  fileName: string;
  fileSize: number;
}

export interface ConversionResponse {
  message: string;
  outputPath: string;
  downloadUrl: string;
  fileName?: string;
  fileSize?: number;
}

export interface Subscription {
  plan: "free" | "premium";
}

export interface UserFile {
  id: string;
  user_id: string;
  original_file_name: string;
  converted_file_name: string;
  original_format: string;
  converted_format: string;
  file_path: string;
  download_url: string | null;
  file_size: number;
  quality: string;
  status: "ready" | "expired" | "downloaded";
  expires_at: string;
  created_at: string;
  last_downloaded_at?: string;
  time_remaining: number;
}

export interface UserFilesResponse {
  files: UserFile[];
  count: number;
  cancelled?: boolean;
}

export interface UploadStatusResponse {
  uploadId: string;
  status: "pending" | "uploading" | "completed" | "failed";
  fileName: string;
  fileSize: number;
  filePath?: string; // Available when status is "completed"
  publicUrl?: string; // Available when status is "completed"
  error?: string; // Available when status is "failed"
  createdAt: string;
  completedAt?: string;
}
