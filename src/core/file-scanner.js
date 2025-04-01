/**
 * File Scanner for Internxt WebDAV Uploader
 * Handles scanning directories and determining which files need to be uploaded
 */

import fs from 'fs';
import path from 'path';
import * as logger from '../utils/logger.js';
import { calculateChecksum, loadJsonFromFile, saveJsonToFile } from '../utils/fs-utils.js';

/**
 * File Scanner class to handle directory scanning and file selection
 */
export default class FileScanner {
  /**
   * Create a new FileScanner
   * @param {string} sourceDir - The source directory to scan
   * @param {number} verbosity - Verbosity level
   */
  constructor(sourceDir, verbosity = logger.Verbosity.Normal) {
    this.sourceDir = path.resolve(sourceDir);
    this.statePath = path.join(this.sourceDir, ".internxt-upload-state.json");
    this.uploadState = { files: {}, lastRun: "" };
    this.verbosity = verbosity;
  }

  /**
   * Load the saved state from the state file
   */
  async loadState() {
    this.uploadState = await loadJsonFromFile(this.statePath, { files: {}, lastRun: "" });
    logger.verbose(`Loaded state with ${Object.keys(this.uploadState.files).length} saved file checksums`, this.verbosity);
  }

  /**
   * Save the current state to the state file
   */
  async saveState() {
    await saveJsonToFile(this.statePath, this.uploadState);
    logger.verbose(`Saved state with ${Object.keys(this.uploadState.files).length} file checksums`, this.verbosity);
  }

  /**
   * Update the state with a successfully uploaded file
   * @param {string} relativePath - Relative path of the file
   * @param {string} checksum - Checksum of the file
   */
  updateFileState(relativePath, checksum) {
    this.uploadState.files[relativePath] = checksum;
  }

  /**
   * Record the upload completion time
   */
  recordCompletion() {
    this.uploadState.lastRun = new Date().toISOString();
  }

  /**
   * Scan a directory recursively to find all files
   * @param {string} dir - Directory to scan
   * @param {string} baseDir - Base directory for calculating relative paths
   * @returns {Promise<Array>} Array of file information objects
   */
  async scanDirectory(dir, baseDir = this.sourceDir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Skip hidden files and the state file
        if (entry.name.startsWith(".") || fullPath === this.statePath) {
          continue;
        }

        if (entry.isDirectory()) {
          const subDirFiles = await this.scanDirectory(fullPath, baseDir);
          files.push(...subDirFiles);
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          logger.verbose(`Calculating checksum for ${relativePath}`, this.verbosity);
          const checksum = await calculateChecksum(fullPath);

          files.push({
            relativePath,
            absolutePath: fullPath,
            size: stats.size,
            checksum,
          });
        }
      }

      return files;
    } catch (error) {
      logger.error(`Error scanning directory ${dir}: ${error.message}`);
      return [];
    }
  }

  /**
   * Determine which files need to be uploaded based on checksum changes
   * @param {Array} files - Array of file information objects
   * @returns {Array} Array of files that need to be uploaded
   */
  determineFilesToUpload(files) {
    return files.filter((file) => {
      const existingChecksum = this.uploadState.files[file.relativePath];
      return !existingChecksum || existingChecksum !== file.checksum;
    });
  }

  /**
   * Scan the source directory and determine which files need to be uploaded
   * @returns {Promise<Object>} Object containing scan results
   */
  async scan() {
    logger.info("Scanning directory...", this.verbosity);
    
    // Load previous state
    await this.loadState();

    // Scan for files
    const allFiles = await this.scanDirectory(this.sourceDir);
    logger.info(`Found ${allFiles.length} files.`, this.verbosity);

    // Determine which files need uploading
    const filesToUpload = this.determineFilesToUpload(allFiles);
    logger.info(`${filesToUpload.length} files need to be uploaded.`, this.verbosity);

    // Calculate total size
    const totalSizeBytes = filesToUpload.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
    
    if (filesToUpload.length > 0) {
      logger.info(`Total upload size: ${totalSizeMB} MB.`, this.verbosity);
    }

    return {
      allFiles,
      filesToUpload,
      totalSizeBytes,
      totalSizeMB
    };
  }
} 