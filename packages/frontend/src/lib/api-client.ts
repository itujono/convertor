import { supabase } from "./auth-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiClient {
  private async getAuthHeaders(): Promise<HeadersInit> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };
    }

    return {
      "Content-Type": "application/json",
    };
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const authHeaders = await this.getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        ...authHeaders,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      console.error(`API request failed: ${response.status} ${response.statusText} for ${endpoint}`);
      const errorData = await response.json().catch(() => ({ error: "Request failed" }));
      console.error("Error data:", errorData);
      throw new Error(errorData.error || "Request failed");
    }

    return response.json();
  }

  async getCurrentUser() {
    return this.request("/api/user");
  }

  async uploadFile(file: File) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append("file", file);

    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10 * 60 * 1000); // 10 minute

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        headers,
        body: formData, // Don't set Content-Type for FormData
        signal: controller.signal,
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
        throw new Error("Upload timeout - file may be too large");
      }
      throw error;
    }
  }

  async convertFile(filePath: string, format: string, quality: string = "medium") {
    return this.request("/api/convert", {
      method: "POST",
      body: JSON.stringify({ filePath, format, quality }),
    });
  }

  async convertFileWithUploadId(uploadId: string, format: string, quality: string = "medium") {
    return this.request("/api/convert", {
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
    return `${API_BASE_URL}/api/download/${filename}`;
  }

  async downloadFile(filename: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/download/${filename}`, {
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
    console.log("Downloading zip with file paths:", fileNames);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/download/zip`, {
      method: "POST",
      headers,
      body: JSON.stringify({ filePaths: fileNames }),
    });

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

  async createCheckoutSession(priceId: string, successUrl?: string, cancelUrl?: string) {
    return this.request("/api/subscription/checkout", {
      method: "POST",
      body: JSON.stringify({ priceId, successUrl, cancelUrl }),
    });
  }

  async getUserSubscription() {
    return this.request("/api/subscription");
  }

  async cancelSubscription() {
    return this.request("/api/subscription/cancel", {
      method: "POST",
    });
  }

  async healthCheck() {
    return this.request("/api/health");
  }

  async getUserFiles() {
    return this.request("/api/user-files");
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

    // Create converted filename
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

    const response = await fetch(`${API_BASE_URL}/api/client-converted`, {
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

export const apiClient = new ApiClient();

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
  fileName?: string; // User-friendly filename for display
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
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
  time_remaining: number; // milliseconds until expiration
}

export interface UserFilesResponse {
  files: UserFile[];
  count: number;
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
