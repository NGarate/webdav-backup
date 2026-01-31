/**
 * Internxt File Synchronization Tool
 * Optimized for Bun's runtime for maximum performance
 */

import chalk from "chalk";
import { getOptimalConcurrency } from "./utils/env-utils.js";
import * as logger from "./utils/logger.js";
import { initFileScanner, scanFiles } from "./core/file-scanner.js";
import { initUploader, startUpload } from "./core/upload/uploader.js";
import { initInternxtService, checkInternxtCLI } from "./core/internxt/internxt-service.js";
import { formatError } from "./utils/error-handler.js";

export interface SyncOptions {
  cores?: number;
  target?: string;
  quiet?: boolean;
  verbose?: boolean;
  force?: boolean;
  resume?: boolean;
  chunkSize?: number;
}

/**
 * Main synchronization function that can be called from CLI or programmatically
 */
export async function syncFiles(sourceDir: string, options: SyncOptions): Promise<void> {
  try {
    // Determine verbosity level
    let verbosity: logger.Verbosity;
    if (options.quiet) {
      verbosity = logger.Verbosity.Quiet;
    } else if (options.verbose) {
      verbosity = logger.Verbosity.Verbose;
    } else {
      verbosity = logger.Verbosity.Normal;
    }

    // Initialize services
    initInternxtService(verbosity);
    
    // Check Internxt CLI status
    logger.info("Checking Internxt CLI...", verbosity);
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

    logger.success(`Internxt CLI v${cliStatus.version} ready`, verbosity);

    // Initialize scanner and uploader
    initFileScanner(sourceDir, verbosity, options.force);
    
    const concurrentUploads = getOptimalConcurrency(options.cores);
    initUploader(
      concurrentUploads,
      options.target || "/",
      verbosity,
      {
        resume: options.resume,
        chunkSize: options.chunkSize
      }
    );

    // Scan and upload
    const scanResult = await scanFiles();

    if (scanResult.filesToUpload.length === 0) {
      logger.success("All files are up to date. Nothing to upload.", verbosity);
    } else {
      await startUpload(scanResult.filesToUpload);
    }
  } catch (error) {
    const errorMessage = formatError(error);
    logger.error(`Error during file sync: ${errorMessage}`);
    throw error;
  }
}
