/**
 * Restore Manager Service
 * Orchestrates downloading files from Internxt Drive with parallel processing
 */

import path from "path";
import fs from "fs/promises";
import os from "os";
import { RestoreDownloader, DownloadResult } from "./downloader";
import { FileUploadManager } from "../upload/file-upload-manager";
import { ProgressTracker } from "../upload/progress-tracker";
import { InternxtService } from "../internxt/internxt-service";
import { InternxtFileInfo } from "../../interfaces/internxt";
import * as logger from "../../utils/logger";

export interface RestoreOptions {
  cores?: number;
  force?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

export interface RestoreResult {
  success: boolean;
  totalFiles: number;
  downloaded: number;
  skipped: number;
  failed: number;
}

/**
 * File info for restore operations
 */
interface RestoreFileInfo {
  remotePath: string;
  localPath: string;
  size: number;
  name: string;
}

/**
 * Manages the restore process from Internxt Drive
 */
export class RestoreManager {
  private remotePath: string;
  private localPath: string;
  private options: RestoreOptions;
  private internxtService: InternxtService;
  private downloader: RestoreDownloader;
  private progressTracker: ProgressTracker;
  private verbosity: number;
  private downloadedFiles: Set<string>;
  private skippedFiles: Set<string>;

  constructor(
    remotePath: string,
    localPath: string,
    options: RestoreOptions = {}
  ) {
    this.remotePath = remotePath;
    this.localPath = localPath;
    this.options = options;
    
    // Determine verbosity level
    if (options.quiet) {
      this.verbosity = logger.Verbosity.Quiet;
    } else if (options.verbose) {
      this.verbosity = logger.Verbosity.Verbose;
    } else {
      this.verbosity = logger.Verbosity.Normal;
    }

    this.internxtService = new InternxtService({ verbosity: this.verbosity });
    this.downloader = new RestoreDownloader({ verbosity: this.verbosity });
    this.progressTracker = new ProgressTracker(this.verbosity);
    this.downloadedFiles = new Set();
    this.skippedFiles = new Set();
  }

  /**
   * Start the restore process
   */
  async restore(): Promise<RestoreResult> {
    try {
      // Check Internxt CLI status
      logger.info("Checking Internxt CLI...", this.verbosity);
      const cliStatus = await this.internxtService.checkCLI();

      if (!cliStatus.installed) {
        throw new Error(
          `Internxt CLI not found. Please install it with: npm install -g @internxt/cli\n` +
          `Error: ${cliStatus.error}`
        );
      }

      if (!cliStatus.authenticated) {
        throw new Error(
          `Not authenticated with Internxt. Please run: internxt login\n` +
          `Error: ${cliStatus.error}`
        );
      }

      logger.success(`Internxt CLI v${cliStatus.version} ready`, this.verbosity);

      // List files from the remote path
      logger.info(`Scanning remote path: ${this.remotePath}`, this.verbosity);
      const files = await this.listRemoteFiles(this.remotePath);

      if (files.length === 0) {
        logger.info("No files found to restore.", this.verbosity);
        return {
          success: true,
          totalFiles: 0,
          downloaded: 0,
          skipped: 0,
          failed: 0
        };
      }

      // Filter files that need to be downloaded
      const filesToDownload = await this.filterFilesToDownload(files);

      if (filesToDownload.length === 0) {
        logger.success("All files are up to date. Nothing to download.", this.verbosity);
        return {
          success: true,
          totalFiles: files.length,
          downloaded: 0,
          skipped: files.length,
          failed: 0
        };
      }

      // Download files
      return await this.downloadFiles(filesToDownload, files.length);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error during restore: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Recursively list all files from a remote path
   */
  private async listRemoteFiles(
    remotePath: string,
    basePath: string = ""
  ): Promise<RestoreFileInfo[]> {
    const files: RestoreFileInfo[] = [];
    const listResult = await this.internxtService.listFiles(remotePath);

    if (!listResult.success) {
      logger.error(`Failed to list files at ${remotePath}: ${listResult.error}`);
      return files;
    }

    for (const file of listResult.files) {
      const relativePath = basePath
        ? `${basePath}/${file.name}`
        : file.name;

      if (file.isFolder) {
        // Recursively list files in subdirectories
        const subFiles = await this.listRemoteFiles(file.path, relativePath);
        files.push(...subFiles);
      } else {
        files.push({
          remotePath: file.path,
          localPath: path.join(this.localPath, relativePath),
          size: file.size,
          name: file.name
        });
      }
    }

    return files;
  }

  /**
   * Filter files to only those that need to be downloaded
   */
  private async filterFilesToDownload(
    files: RestoreFileInfo[]
  ): Promise<RestoreFileInfo[]> {
    if (this.options.force) {
      return files;
    }

    const filesToDownload: RestoreFileInfo[] = [];

    for (const file of files) {
      const isUpToDate = await this.downloader.isFileUpToDate(file.localPath, file.size);
      if (isUpToDate) {
        this.skippedFiles.add(file.remotePath);
        logger.verbose(`Skipping up-to-date file: ${file.remotePath}`, this.verbosity);
      } else {
        filesToDownload.push(file);
      }
    }

    return filesToDownload;
  }

  /**
   * Download files with parallel processing
   */
  private async downloadFiles(
    filesToDownload: RestoreFileInfo[],
    totalFiles: number
  ): Promise<RestoreResult> {
    const cores = this.options.cores ?? Math.max(1, Math.floor(os.cpus().length * 2 / 3));
    
    logger.info(
      `Restoring ${filesToDownload.length} files (${this.skippedFiles.size} skipped) with ${cores} concurrent downloads...`,
      this.verbosity
    );

    this.progressTracker.initialize(filesToDownload.length);
    this.progressTracker.startProgressUpdates();

    const failedFiles: RestoreFileInfo[] = [];

    // Create a download handler
    const downloadHandler = async (fileInfo: RestoreFileInfo): Promise<{ success: boolean; filePath: string }> => {
      const result = await this.downloader.downloadFile(fileInfo.remotePath, fileInfo.localPath);
      
      if (result.success) {
        this.downloadedFiles.add(fileInfo.remotePath);
        this.progressTracker.recordSuccess();
      } else {
        failedFiles.push(fileInfo);
        this.progressTracker.recordFailure();
      }

      return {
        success: result.success,
        filePath: fileInfo.localPath
      };
    };

    // Create upload manager for parallel downloads
    const uploadManager = new FileUploadManager(
      cores,
      downloadHandler as any,
      this.verbosity
    );

    try {
      await new Promise<void>((resolve) => {
        uploadManager.setQueue(filesToDownload as any);
        uploadManager.start(resolve);
      });

      this.progressTracker.displaySummary();

      return {
        success: failedFiles.length === 0,
        totalFiles,
        downloaded: this.downloadedFiles.size,
        skipped: this.skippedFiles.size,
        failed: failedFiles.length
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`\nRestore process failed: ${errorMessage}`);
      throw error;
    } finally {
      this.progressTracker.stopProgressUpdates();
    }
  }
}

export default RestoreManager;
