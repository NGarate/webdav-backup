/**
 * Restore Downloader Service
 * Handles downloading individual files from Internxt Drive
 */

import path from "path";
import fs from "fs/promises";
import { InternxtService } from "../internxt/internxt-service";
import { InternxtFileInfo } from "../../interfaces/internxt";
import * as logger from "../../utils/logger";

export interface DownloaderOptions {
  verbosity?: number;
}

export interface DownloadResult {
  success: boolean;
  filePath: string;
  error?: string;
}

/**
 * Handles downloading files from Internxt Drive
 */
export class RestoreDownloader {
  private internxtService: InternxtService;
  private verbosity: number;

  constructor(options: DownloaderOptions = {}) {
    this.verbosity = options.verbosity ?? logger.Verbosity.Normal;
    this.internxtService = new InternxtService({ verbosity: this.verbosity });
  }

  /**
   * Download a single file from Internxt Drive
   * @param remotePath - Path to the file in Internxt Drive
   * @param localPath - Local destination path
   * @returns Download result
   */
  async downloadFile(
    remotePath: string,
    localPath: string,
    fileInfo?: InternxtFileInfo
  ): Promise<DownloadResult> {
    try {
      // Ensure the parent directory exists
      const parentDir = path.dirname(localPath);
      await fs.mkdir(parentDir, { recursive: true });

      logger.verbose(`Downloading: ${remotePath} → ${localPath}`, this.verbosity);

      // Download the file
      const result = await this.internxtService.downloadFile(remotePath, localPath);

      if (result.success) {
        logger.success(`Downloaded: ${remotePath}`, this.verbosity);
        return {
          success: true,
          filePath: localPath
        };
      } else {
        logger.error(`Failed to download ${remotePath}: ${result.error}`);
        return {
          success: false,
          filePath: localPath,
          error: result.error
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error downloading ${remotePath}: ${errorMessage}`);
      return {
        success: false,
        filePath: localPath,
        error: errorMessage
      };
    }
  }

  /**
   * Check if a local file exists and has the same size as the remote file
   * @param localPath - Local file path
   * @param remoteSize - Expected size from remote
   * @returns True if file exists and matches size
   */
  async isFileUpToDate(localPath: string, remoteSize: number): Promise<boolean> {
    try {
      const stats = await fs.stat(localPath);
      return stats.isFile() && stats.size === remoteSize;
    } catch {
      return false;
    }
  }

  /**
   * Get the Internxt service instance
   */
  getInternxtService(): InternxtService {
    return this.internxtService;
  }
}

export default RestoreDownloader;
