/**
 * Internxt Uploader - Functional exports
 * Handles file uploads to Internxt Drive with improved modularity
 */

import path from "node:path";
import os from "node:os";
import { FileInfo } from "../../interfaces/file-scanner.js";
import { Verbosity } from "../../interfaces/logger.js";
import * as logger from "../../utils/logger.js";
import {
  initInternxtService,
  checkInternxtCLI,
  internxtCreateFolder,
  internxtUploadFile
} from "../internxt/internxt-service.js";
import {
  initResumableUploader,
  shouldUseResumable,
  uploadLargeFile
} from "./resumable-uploader.js";
import {
  initHashCache,
  loadHashCache,
  hashCacheHasChanged
} from "./hash-cache.js";
import {
  initProgressTracker,
  recordProgressSuccess,
  recordProgressFailure,
  startProgressUpdates,
  stopProgressUpdates,
  displayProgressSummary
} from "./progress-tracker.js";
import {
  initFileQueue,
  setFileQueue,
  startFileQueue
} from "./file-upload-manager.js";
import {
  updateScannerFileState,
  recordScannerCompletion,
  saveScannerState
} from "../file-scanner.js";

export interface UploaderOptions {
  resume?: boolean;
  chunkSize?: number;
}

interface PathInfo {
  normalizedPath: string;
  directory: string;
  targetPath: string;
  fullDirectoryPath: string;
}

let _targetDir = "";
let _verbosity = Verbosity.Normal;
let _useResume = false;
let _uploadedFiles = new Set<string>();
let _normalizedPaths = new Map<string, PathInfo>();
let _createdDirectories = new Set<string>();

export const initUploader = (
  concurrentUploads: number,
  targetDir: string = "",
  verbosity: number = Verbosity.Normal,
  options: UploaderOptions = {}
): void => {
  _targetDir = targetDir.trim().replace(/^\/+|\/+/g, "");
  _verbosity = verbosity;
  _useResume = options.resume ?? false;
  _uploadedFiles.clear();
  _normalizedPaths.clear();
  _createdDirectories.clear();

  // Initialize all functional modules
  initInternxtService(verbosity);
  
  if (_useResume) {
    initResumableUploader({
      chunkSize: options.chunkSize ? options.chunkSize * 1024 * 1024 : undefined,
      verbosity
    });
  }

  const cachePath = path.join(os.tmpdir(), "internxt-backup-hash-cache.json");
  initHashCache(cachePath, verbosity);
  
  initProgressTracker(0); // Will be initialized with count later
  initFileQueue(concurrentUploads, handleFileUpload, verbosity);
  
  // Load hash cache
  loadHashCache();
};

const ensureDirectoryExists = async (directory: string): Promise<boolean> => {
  if (!directory) return true;
  if (_createdDirectories.has(directory)) {
    logger.verbose(`Directory already created: ${directory}`, _verbosity);
    return true;
  }

  const result = await internxtCreateFolder(directory);
  if (result.success) {
    _createdDirectories.add(directory);
  }
  return result.success;
};

const getPathInfo = (fileInfo: FileInfo): PathInfo => {
  let pathInfo = _normalizedPaths.get(fileInfo.relativePath);
  
  if (!pathInfo) {
    const normalizedPath = fileInfo.relativePath.replace(/\\/g, "/");
    const lastSlashIndex = normalizedPath.lastIndexOf("/");
    const directory = lastSlashIndex > 0 ? normalizedPath.substring(0, lastSlashIndex) : "";
    const targetPath = _targetDir ? `${_targetDir}/${normalizedPath}` : normalizedPath;
    const fullDirectoryPath = directory
      ? (_targetDir ? `${_targetDir}/${directory}` : directory)
      : _targetDir;

    pathInfo = { normalizedPath, directory, targetPath, fullDirectoryPath };
    _normalizedPaths.set(fileInfo.relativePath, pathInfo);
  }
  
  return pathInfo;
};

const handleFileUpload = async (fileInfo: FileInfo): Promise<{ success: boolean; filePath: string }> => {
  try {
    if (_uploadedFiles.has(fileInfo.relativePath)) {
      logger.verbose(`File ${fileInfo.relativePath} already uploaded, skipping`, _verbosity);
      return { success: true, filePath: fileInfo.relativePath };
    }

    if (fileInfo.hasChanged === false) {
      logger.verbose(`File ${fileInfo.relativePath} unchanged, skipping`, _verbosity);
      recordProgressSuccess();
      return { success: true, filePath: fileInfo.relativePath };
    }

    if (fileInfo.hasChanged === null) {
      const hasChanged = await hashCacheHasChanged(fileInfo.absolutePath);
      if (!hasChanged) {
        logger.verbose(`File ${fileInfo.relativePath} unchanged, skipping`, _verbosity);
        recordProgressSuccess();
        return { success: true, filePath: fileInfo.relativePath };
      }
    }

    logger.verbose(`Uploading ${fileInfo.relativePath}...`, _verbosity);

    if (_targetDir) {
      await ensureDirectoryExists(_targetDir);
    }

    const pathInfo = getPathInfo(fileInfo);

    if (pathInfo.directory) {
      logger.verbose(`Creating directory: ${pathInfo.directory}`, _verbosity);
      await ensureDirectoryExists(pathInfo.fullDirectoryPath);
    }

    let result;
    const finalRemotePath = pathInfo.targetPath;

    if (_useResume && shouldUseResumable(fileInfo.size)) {
      result = await uploadLargeFile(
        fileInfo.absolutePath,
        finalRemotePath,
        (percent) => {
          logger.verbose(`Progress: ${percent}%`, _verbosity);
        }
      );
      result = {
        success: result.success,
        filePath: fileInfo.absolutePath,
        remotePath: finalRemotePath,
        output: result.error
      };
    } else {
      result = await internxtUploadFile(fileInfo.absolutePath, finalRemotePath);
    }

    if (result.success) {
      _uploadedFiles.add(fileInfo.relativePath);
      logger.success(`Uploaded ${fileInfo.relativePath}`, _verbosity);
      updateScannerFileState(fileInfo.relativePath, fileInfo.checksum);
      recordProgressSuccess();
      return { success: true, filePath: fileInfo.relativePath };
    } else {
      logger.error(`Failed ${fileInfo.relativePath}: ${result.output}`);
      recordProgressFailure();
      return { success: false, filePath: fileInfo.relativePath };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Error uploading ${fileInfo.relativePath}: ${msg}`);
    recordProgressFailure();
    return { success: false, filePath: fileInfo.relativePath };
  }
};

export const startUpload = async (filesToUpload: FileInfo[]): Promise<void> => {
  const cliStatus = await checkInternxtCLI();
  if (!cliStatus.installed || !cliStatus.authenticated) {
    logger.error("Internxt CLI not ready.");
    if (cliStatus.error) logger.error(cliStatus.error);
    return;
  }

  if (_targetDir) {
    const dirResult = await ensureDirectoryExists(_targetDir);
    logger.verbose(`Target directory: ${dirResult ? "success" : "failed"}`, _verbosity);
  }

  if (filesToUpload.length === 0) {
    logger.success("All files are up to date.", _verbosity);
    return;
  }

  _uploadedFiles.clear();
  _createdDirectories.clear();

  // Pre-create directories
  if (filesToUpload.length > 1) {
    const uniqueDirectories = new Set<string>();
    for (const fileInfo of filesToUpload) {
      const pathInfo = getPathInfo(fileInfo);
      if (pathInfo.directory) {
        uniqueDirectories.add(pathInfo.fullDirectoryPath);
      }
    }

    logger.verbose(`Creating ${uniqueDirectories.size} directories...`, _verbosity);
    for (const dir of uniqueDirectories) {
      await ensureDirectoryExists(dir);
    }
  }

  // Initialize progress
  initProgressTracker(filesToUpload.length);
  startProgressUpdates();

  // Set up queue
  setFileQueue(filesToUpload);

  try {
    // Start upload
    await new Promise<void>((resolve) => {
      startFileQueue(resolve);
    });

    recordScannerCompletion();
    await saveScannerState();
    displayProgressSummary();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`\nUpload failed: ${msg}`);
    await saveScannerState();
  } finally {
    stopProgressUpdates();
  }
};
