/**
 * Restore Manager Service - Functional exports
 * Orchestrates downloading files from Internxt Drive with parallel processing
 */

import path from "node:path";
import os from "node:os";
import * as logger from "../../utils/logger.js";
import { initInternxtService, checkInternxtCLI, internxtListFiles } from "../internxt/internxt-service.js";
import { initRestoreDownloader, downloadFile, isFileUpToDate } from "./downloader.js";
import {
  initProgressTracker,
  recordProgressSuccess,
  recordProgressFailure,
  startProgressUpdates,
  stopProgressUpdates,
  displayProgressSummary
} from "../upload/progress-tracker.js";
import { initFileQueue, setFileQueue, startFileQueue } from "../upload/file-upload-manager.js";
import { InternxtFileInfo } from "../../interfaces/internxt.js";

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

interface RestoreFileInfo {
  remotePath: string;
  localPath: string;
  size: number;
  name: string;
}

let _remotePath = "";
let _localPath = "";
let _options: RestoreOptions = {};
let _verbosity = logger.Verbosity.Normal;
let _downloadedFiles = new Set<string>();
let _skippedFiles = new Set<string>();

export const initRestoreManager = (
  remotePath: string,
  localPath: string,
  options: RestoreOptions = {}
): void => {
  _remotePath = remotePath;
  _localPath = localPath;
  _options = options;
  _downloadedFiles.clear();
  _skippedFiles.clear();
  
  // Determine verbosity
  if (options.quiet) {
    _verbosity = logger.Verbosity.Quiet;
  } else if (options.verbose) {
    _verbosity = logger.Verbosity.Verbose;
  } else {
    _verbosity = logger.Verbosity.Normal;
  }

  // Initialize modules
  initInternxtService(_verbosity);
  initRestoreDownloader(_verbosity);
};

const listRemoteFiles = async (
  remotePath: string,
  basePath: string = ""
): Promise<RestoreFileInfo[]> => {
  const files: RestoreFileInfo[] = [];
  const listResult = await internxtListFiles(remotePath);

  if (!listResult.success) {
    logger.error(`Failed to list files at ${remotePath}: ${listResult.error}`);
    return files;
  }

  for (const file of listResult.files) {
    const relativePath = basePath ? `${basePath}/${file.name}` : file.name;

    if (file.isFolder) {
      const subFiles = await listRemoteFiles(file.path, relativePath);
      files.push(...subFiles);
    } else {
      files.push({
        remotePath: file.path,
        localPath: path.join(_localPath, relativePath),
        size: file.size,
        name: file.name
      });
    }
  }

  return files;
};

const filterFilesToDownload = async (files: RestoreFileInfo[]): Promise<RestoreFileInfo[]> => {
  if (_options.force) return files;

  const filesToDownload: RestoreFileInfo[] = [];

  for (const file of files) {
    const isUpToDate = await isFileUpToDate(file.localPath, file.size);
    if (isUpToDate) {
      _skippedFiles.add(file.remotePath);
      logger.verbose(`Skipping up-to-date file: ${file.remotePath}`, _verbosity);
    } else {
      filesToDownload.push(file);
    }
  }

  return filesToDownload;
};

const downloadFiles = async (
  filesToDownload: RestoreFileInfo[],
  totalFiles: number
): Promise<RestoreResult> => {
  const cores = _options.cores ?? Math.max(1, Math.floor(os.cpus().length * 2 / 3));
  
  logger.info(
    `Restoring ${filesToDownload.length} files (${_skippedFiles.size} skipped) with ${cores} concurrent downloads...`,
    _verbosity
  );

  initProgressTracker(filesToDownload.length);
  startProgressUpdates();

  const failedFiles: RestoreFileInfo[] = [];

  // Initialize queue with download handler
  const downloadHandler = async (fileInfo: RestoreFileInfo): Promise<{ success: boolean; filePath: string }> => {
    const result = await downloadFile(fileInfo.remotePath, fileInfo.localPath);
    
    if (result.success) {
      _downloadedFiles.add(fileInfo.remotePath);
      recordProgressSuccess();
    } else {
      failedFiles.push(fileInfo);
      recordProgressFailure();
    }

    return { success: result.success, filePath: fileInfo.localPath };
  };

  initFileQueue(cores, downloadHandler as any, _verbosity);

  try {
    await new Promise<void>((resolve) => {
      setFileQueue(filesToDownload as any);
      startFileQueue(resolve);
    });

    displayProgressSummary();

    return {
      success: failedFiles.length === 0,
      totalFiles,
      downloaded: _downloadedFiles.size,
      skipped: _skippedFiles.size,
      failed: failedFiles.length
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`\nRestore failed: ${msg}`);
    throw error;
  } finally {
    stopProgressUpdates();
  }
};

export const restoreFiles = async (): Promise<RestoreResult> => {
  try {
    logger.info("Checking Internxt CLI...", _verbosity);
    const cliStatus = await checkInternxtCLI();

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

    logger.success(`Internxt CLI v${cliStatus.version} ready`, _verbosity);

    // List files
    logger.info(`Scanning remote path: ${_remotePath}`, _verbosity);
    const files = await listRemoteFiles(_remotePath);

    if (files.length === 0) {
      logger.info("No files found to restore.", _verbosity);
      return { success: true, totalFiles: 0, downloaded: 0, skipped: 0, failed: 0 };
    }

    // Filter files
    const filesToDownload = await filterFilesToDownload(files);

    if (filesToDownload.length === 0) {
      logger.success("All files are up to date. Nothing to download.", _verbosity);
      return { success: true, totalFiles: files.length, downloaded: 0, skipped: files.length, failed: 0 };
    }

    // Download
    return await downloadFiles(filesToDownload, files.length);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Error during restore: ${msg}`);
    throw error;
  }
};
