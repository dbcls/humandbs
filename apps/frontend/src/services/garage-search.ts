import { S3Client } from "bun";

import { credentials } from "./garage";

interface SearchOptions {
  prefix?: string;
  maxKeys?: number;
  searchTerm?: string;
  caseSensitive?: boolean;
}

interface FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

class GarageSearchClient {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName?: string) {
    this.bucketName = bucketName ?? credentials.bucket!;

    this.s3Client = new S3Client({
      ...credentials,
      bucket: this.bucketName,
    });
  }

  /**
   * Search files by prefix (directory-based search)
   * Most efficient for searching within specific folders
   */
  async searchByPrefix(prefix: string, maxKeys = 1000): Promise<FileInfo[]> {
    try {
      const response = await this.s3Client.list({
        prefix: prefix,
        maxKeys: maxKeys,
      });

      return (response.contents || []).map((item) => ({
        key: item.key || "",
        size: item.size || 0,
        lastModified: new Date(item.lastModified || ""),
        etag: item.eTag || "",
      }));
    } catch (error) {
      console.error("Error searching by prefix:", error);
      throw error;
    }
  }

  /**
   * Search files by partial filename
   * Less efficient but more flexible for filename matching
   */
  async searchByFilename(
    searchTerm: string,
    options: SearchOptions = {}
  ): Promise<FileInfo[]> {
    const { prefix = "", maxKeys = 1000, caseSensitive = false } = options;

    try {
      const response = await this.s3Client.list({ prefix, maxKeys });

      const allFiles = (response.contents || []).map((item) => ({
        key: item.key || "",
        size: item.size || 0,
        lastModified: new Date(item.lastModified || ""),
        etag: item.eTag || "",
      }));

      // Filter by filename
      const searchTermProcessed = caseSensitive
        ? searchTerm
        : searchTerm.toLowerCase();

      return allFiles.filter((file) => {
        const filename = caseSensitive ? file.key : file.key.toLowerCase();
        return filename.includes(searchTermProcessed);
      });
    } catch (error) {
      console.error("Error searching by filename:", error);
      throw error;
    }
  }

  /**
   * Search files by extension
   */
  async searchByExtension(
    extension: string,
    options: SearchOptions = {}
  ): Promise<FileInfo[]> {
    const normalizedExt = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    return this.searchByFilename(normalizedExt, options);
  }

  /**
   * Advanced search with multiple criteria
   */
  async advancedSearch(criteria: {
    filename?: string;
    extension?: string;
    prefix?: string;
    minSize?: number;
    maxSize?: number;
    modifiedAfter?: Date;
    modifiedBefore?: Date;
    caseSensitive?: boolean;
    maxResults?: number;
  }): Promise<FileInfo[]> {
    const {
      filename,
      extension,
      prefix = "",
      minSize,
      maxSize,
      modifiedAfter,
      modifiedBefore,
      caseSensitive = false,
      maxResults = 1000,
    } = criteria;

    try {
      // Start with prefix search for efficiency
      const response = await this.s3Client.list({
        prefix: prefix,
        maxKeys: maxResults,
      });

      let results = (response.contents || []).map((item) => ({
        key: item.key || "",
        size: item.size || 0,
        lastModified: new Date(item.lastModified || ""),
        etag: item.eTag || "",
      }));

      // Apply filename filter
      if (filename) {
        const searchTerm = caseSensitive ? filename : filename.toLowerCase();
        results = results.filter((file) => {
          const key = caseSensitive ? file.key : file.key.toLowerCase();
          return key.includes(searchTerm);
        });
      }

      // Apply extension filter
      if (extension) {
        const ext = extension.startsWith(".") ? extension : `.${extension}`;
        const searchExt = caseSensitive ? ext : ext.toLowerCase();
        results = results.filter((file) => {
          const key = caseSensitive ? file.key : file.key.toLowerCase();
          return key.endsWith(searchExt);
        });
      }

      // Apply size filters
      if (minSize !== undefined) {
        results = results.filter((file) => file.size >= minSize);
      }
      if (maxSize !== undefined) {
        results = results.filter((file) => file.size <= maxSize);
      }

      // Apply date filters
      if (modifiedAfter) {
        results = results.filter((file) => file.lastModified >= modifiedAfter);
      }
      if (modifiedBefore) {
        results = results.filter((file) => file.lastModified <= modifiedBefore);
      }

      return results;
    } catch (error) {
      console.error("Error in advanced search:", error);
      throw error;
    }
  }

  /**
   * Get file count for a search
   */
  async getFileCount(searchTerm?: string, prefix?: string): Promise<number> {
    if (searchTerm) {
      const files = await this.searchByFilename(searchTerm, { prefix });
      return files.length;
    } else {
      const files = await this.searchByPrefix(prefix || "");
      return files.length;
    }
  }

  /**
   * Check if a file exists with exact match
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.exists(key);
      return true;
    } catch {
      return false;
    }
  }
}

// Create instances for different buckets
export const cmsSearch = new GarageSearchClient(process.env.GARAGE_BUCKET_CMS);

// Export the class for custom bucket usage
export { GarageSearchClient };
export type { FileInfo, SearchOptions };
