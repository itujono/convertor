import { supabase } from "@/lib/auth-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface AbortResult {
  success: boolean;
  message: string;
  abortedCount?: number;
}

export class AbortClient {
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

  // Abort a specific upload
  async abortUpload(uploadId: string): Promise<AbortResult> {
    try {
      const headers = await this.getAuthHeaders();

      const response = await fetch(`${API_BASE_URL}/api/abort/upload`, {
        method: "POST",
        headers,
        body: JSON.stringify({ uploadId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to abort upload");
      }

      return {
        success: data.success,
        message: data.message,
      };
    } catch (error) {
      console.error("Failed to abort upload:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to abort upload",
      };
    }
  }

  // Abort all uploads for the current user
  async abortAllUploads(): Promise<AbortResult> {
    try {
      const headers = await this.getAuthHeaders();

      const response = await fetch(`${API_BASE_URL}/api/abort/all-uploads`, {
        method: "POST",
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to abort all uploads");
      }

      return {
        success: data.success,
        message: data.message,
        abortedCount: data.abortedCount,
      };
    } catch (error) {
      console.error("Failed to abort all uploads:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to abort all uploads",
      };
    }
  }

  // Abort conversion and cleanup files
  async abortConversion(filePath?: string, uploadId?: string): Promise<AbortResult> {
    try {
      if (!filePath && !uploadId) {
        throw new Error("Either filePath or uploadId is required");
      }

      const headers = await this.getAuthHeaders();

      const response = await fetch(`${API_BASE_URL}/api/abort/conversion`, {
        method: "POST",
        headers,
        body: JSON.stringify({ filePath, uploadId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to abort conversion");
      }

      return {
        success: data.success,
        message: data.message,
      };
    } catch (error) {
      console.error("Failed to abort conversion:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to abort conversion",
      };
    }
  }

  // Delete specific files from S3
  async deleteFiles(filePaths: string[]): Promise<AbortResult> {
    try {
      if (!filePaths || filePaths.length === 0) {
        return { success: true, message: "No files to delete" };
      }

      const headers = await this.getAuthHeaders();

      const response = await fetch(`${API_BASE_URL}/api/files`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ filePaths }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete files");
      }

      return {
        success: data.success,
        message: data.message,
      };
    } catch (error) {
      console.error("Failed to delete files:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete files",
      };
    }
  }

  // Abort multipart upload (for presigned uploads)
  async abortMultipartUpload(uploadId: string, filePath: string): Promise<AbortResult> {
    try {
      const headers = await this.getAuthHeaders();

      const response = await fetch(`${API_BASE_URL}/api/upload/abort-multipart`, {
        method: "POST",
        headers,
        body: JSON.stringify({ uploadId, filePath }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to abort multipart upload");
      }

      return {
        success: true,
        message: "Multipart upload aborted successfully",
      };
    } catch (error) {
      console.error("Failed to abort multipart upload:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to abort multipart upload",
      };
    }
  }
}

// Export singleton instance
export const abortClient = new AbortClient();
