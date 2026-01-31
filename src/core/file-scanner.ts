/**
 * File Scanner - Functional exports
 * Handles scanning directories and determining which files need to be uploaded
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as logger from '../utils/logger.js';
import { calculateChecksum, loadJsonFromFile, saveJsonToFile } from '../utils/fs-utils.js';
import { initHashCache, loadHashCache, hashCacheHasChanged } from './upload/hash-cache.js';
import { FileInfo, ScanResult, UploadState } from '../interfaces/file-scanner.js';

let _sourceDir = "";
let _statePath = path.join(os.tmpdir(), "internxt-backup-state.json");
let _uploadState: UploadState = { files: {}, lastRun: "" };
let _verbosity = logger.Verbosity.Normal;
let _forceUpload = false;

export const initFileScanner = (
  sourceDir: string,
  verbosity: number = logger.Verbosity.Normal,
  forceUpload: boolean = false
): void => {
  _sourceDir = path.resolve(sourceDir);
  _verbosity = verbosity;
  _forceUpload = forceUpload;
  _uploadState = { files: {}, lastRun: "" };
  
  // Initialize hash cache
  const cachePath = path.join(os.tmpdir(), "internxt-backup-hash-cache.json");
  initHashCache(cachePath, verbosity);
};

export const loadScannerState = async (): Promise<void> => {
  _uploadState = await loadJsonFromFile(_statePath, { files: {}, lastRun: "" }) as UploadState;
  logger.verbose(`Loaded state with ${Object.keys(_uploadState.files).length} saved file checksums`, _verbosity);
};

export const saveScannerState = async (): Promise<void> => {
  await saveJsonToFile(_statePath, _uploadState);
  logger.verbose(`Saved state with ${Object.keys(_uploadState.files).length} file checksums`, _verbosity);
};

export const updateScannerFileState = (relativePath: string, checksum: string): void => {
  _uploadState.files[relativePath] = checksum;
};

export const recordScannerCompletion = (): void => {
  _uploadState.lastRun = new Date().toISOString();
};

export const scanDirectory = async (dir: string, baseDir: string = _sourceDir): Promise<FileInfo[]> => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Skip hidden files and the state file
      if (entry.name.startsWith(".") || fullPath === _statePath) {
        continue;
      }

      if (entry.isDirectory()) {
        const subDirFiles = await scanDirectory(fullPath, baseDir);
        files.push(...subDirFiles);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        logger.verbose(`Calculating checksum for ${relativePath}`, _verbosity);
        const checksum = await calculateChecksum(fullPath);

        files.push({
          relativePath,
          absolutePath: fullPath,
          size: stats.size,
          checksum,
          hasChanged: null
        });
      }
    }

    return files;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Error scanning directory ${dir}: ${msg}`);
    return [];
  }
};

export const determineFilesToUpload = async (files: FileInfo[]): Promise<FileInfo[]> => {
  const filesToUpload: FileInfo[] = [];
  
  // Ensure hash cache is loaded
  await loadHashCache();
  
  for (const file of files) {
    // If force upload is enabled, mark all files as changed
    if (_forceUpload) {
      file.hasChanged = true;
      filesToUpload.push(file);
      continue;
    }
    
    // Otherwise, check the hash cache
    const hasChanged = await hashCacheHasChanged(file.absolutePath);
    file.hasChanged = hasChanged;
    
    if (hasChanged) {
      filesToUpload.push(file);
    }
  }
  
  return filesToUpload;
};

export const scanFiles = async (): Promise<ScanResult> => {
  logger.info("Scanning directory...", _verbosity);
  
  // Load previous state
  await loadScannerState();

  // Scan for files
  const allFiles = await scanDirectory(_sourceDir);
  logger.info(`Found ${allFiles.length} files.`, _verbosity);

  // Determine which files need uploading
  const filesToUpload = await determineFilesToUpload(allFiles);
  
  if (_forceUpload && filesToUpload.length > 0) {
    logger.info(`Force upload enabled. All ${filesToUpload.length} files will be uploaded.`, _verbosity);
  } else {
    logger.info(`${filesToUpload.length} files need to be uploaded.`, _verbosity);
  }

  // Calculate total size
  const totalSizeBytes = filesToUpload.reduce((sum, file) => sum + file.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  
  if (filesToUpload.length > 0) {
    logger.info(`Total upload size: ${totalSizeMB} MB.`, _verbosity);
  }

  return {
    allFiles,
    filesToUpload,
    totalSizeBytes,
    totalSizeMB
  };
};
