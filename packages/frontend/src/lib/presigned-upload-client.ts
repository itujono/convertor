import { supabase } from "@/lib/auth-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface PresignedUploadOptions {
  fileName: string;
  fileSize: number;
  mimeType: string;
  onProgress?: (progress: number) => void;
  onComplete?: (filePath: string) => void;
  onError?: (error: string) => void;
  abortSignal?: AbortSignal;
}

export interface PresignedUploadResult {
  uploadId: string;
  uploadUrl?: string;
  multipartUpload?: {
    uploadId: string;
    partUrls: string[];
    completeUrl: string;
    abortUrl: string;
  };
  filePath: string;
  fileName: string;
  publicUrl: string;
}

export class PresignedUploadClient {
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

  async initiateUpload(options: PresignedUploadOptions): Promise<PresignedUploadResult> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/api/upload/presigned`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fileName: options.fileName,
        fileSize: options.fileSize,
        mimeType: options.mimeType,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to initiate upload" }));
      throw new Error(errorData.error || "Failed to initiate upload");
    }

    return response.json();
  }

  async uploadFile(file: File, options: PresignedUploadOptions): Promise<string> {
    try {
      options.onProgress?.(5);

      // Get presigned upload URLs
      const uploadInfo = await this.initiateUpload(options);

      options.onProgress?.(10);

      let filePath: string;

      if (uploadInfo.multipartUpload) {
        // Use multipart upload for large files
        filePath = await this.uploadMultipart(file, uploadInfo, options);
      } else if (uploadInfo.uploadUrl) {
        // Use single upload for smaller files
        filePath = await this.uploadSingle(file, uploadInfo, options);
      } else {
        throw new Error("Invalid upload configuration received");
      }

      options.onProgress?.(100);
      options.onComplete?.(filePath);

      return filePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      options.onError?.(errorMessage);
      throw error;
    }
  }

  private async uploadSingle(
    file: File,
    uploadInfo: PresignedUploadResult,
    options: PresignedUploadOptions,
  ): Promise<string> {
    if (!uploadInfo.uploadUrl) {
      throw new Error("No upload URL provided");
    }

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = 10 + (event.loaded / event.total) * 85; // 10-95%
          options.onProgress?.(Math.round(progress));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200 || xhr.status === 201) {
          options.onProgress?.(95);
          resolve(uploadInfo.filePath);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed due to network error"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload was aborted"));
      });

      // Handle abort signal
      if (options.abortSignal) {
        options.abortSignal.addEventListener("abort", () => {
          xhr.abort();
        });
      }

      xhr.open("PUT", uploadInfo.uploadUrl);
      xhr.setRequestHeader("Content-Type", options.mimeType);
      xhr.send(file);
    });
  }

  private async uploadMultipart(
    file: File,
    uploadInfo: PresignedUploadResult,
    options: PresignedUploadOptions,
  ): Promise<string> {
    if (!uploadInfo.multipartUpload) {
      throw new Error("No multipart upload configuration provided");
    }

    const { uploadId, partUrls } = uploadInfo.multipartUpload;
    const PART_SIZE = 10 * 1024 * 1024; // 10MB parts
    const totalParts = partUrls.length;
    const completedParts: Array<{ PartNumber: number; ETag: string }> = [];

    console.log(`🔄 Starting multipart upload: ${totalParts} parts`);

    // Upload parts in parallel (with concurrency limit)
    const CONCURRENT_UPLOADS = 3;
    const uploadPromises: Promise<void>[] = [];

    for (let i = 0; i < totalParts; i += CONCURRENT_UPLOADS) {
      const batch = [];

      for (let j = 0; j < CONCURRENT_UPLOADS && i + j < totalParts; j++) {
        const partNumber = i + j + 1;
        const partUrl = partUrls[i + j];

        batch.push(this.uploadPart(file, partNumber, partUrl, PART_SIZE, options.abortSignal));
      }

      // Wait for this batch to complete
      const batchResults = await Promise.all(batch);
      completedParts.push(...batchResults);

      // Update progress
      const progress = 10 + (completedParts.length / totalParts) * 80; // 10-90%
      options.onProgress?.(Math.round(progress));

      if (options.abortSignal?.aborted) {
        throw new Error("Upload was aborted");
      }
    }

    options.onProgress?.(90);

    // Complete multipart upload
    await this.completeMultipartUpload(uploadId, uploadInfo.filePath, completedParts);

    return uploadInfo.filePath;
  }

  private async uploadPart(
    file: File,
    partNumber: number,
    partUrl: string,
    partSize: number,
    abortSignal?: AbortSignal,
  ): Promise<{ PartNumber: number; ETag: string }> {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const partBlob = file.slice(start, end);

    const response = await fetch(partUrl, {
      method: "PUT",
      body: partBlob,
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload part ${partNumber}: ${response.status}`);
    }

    const etag = response.headers.get("ETag");
    if (!etag) {
      throw new Error(`No ETag received for part ${partNumber}`);
    }

    return {
      PartNumber: partNumber,
      ETag: etag,
    };
  }

  private async completeMultipartUpload(
    uploadId: string,
    filePath: string,
    parts: Array<{ PartNumber: number; ETag: string }>,
  ): Promise<void> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/api/upload/complete-multipart`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uploadId,
        filePath,
        parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to complete upload" }));
      throw new Error(errorData.error || "Failed to complete upload");
    }
  }

  async abortMultipartUpload(uploadId: string, filePath: string): Promise<void> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/api/upload/abort-multipart`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uploadId,
        filePath,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to abort upload" }));
      throw new Error(errorData.error || "Failed to abort upload");
    }
  }
}

export const presignedUploadClient = new PresignedUploadClient();
