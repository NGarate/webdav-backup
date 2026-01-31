/**
 * Restore Downloader Service - Functional exports
 * Handles downloading individual files from Internxt Drive
 */

import path from "node:path";
import * as logger from "../../utils/logger.js";
import { InternxtFileInfo } from "../../interfaces/internxt.js";
import { internxtDownloadFile } from "../internxt/internxt-service.js";

export interface DownloadResult {
  success: boolean;
  filePath: string;
  error?: string;
}

let _verbosity = logger.Verbosity.Normal;

export const initRestoreDownloader = (verbosity: number = logger.Verbosity.Normal): void => {
  _verbosity = verbosity;
};

export const downloadFile = async (
  remotePath: string,
  localPath: string,
  _fileInfo?: InternxtFileInfo
): Promise<DownloadResult> => {
  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(localPath);
    await Bun.write(path.join(parentDir, '.mkdir'), '');
    
    // Actually create directory using fs (Bun.write creates parent dirs automatically for files,
    // but we need the directory to exist before downloading)
    const fs = await import('node:fs/promises');
    await fs.mkdir(parentDir, { recursive: true });

    logger.verbose(`Downloading: ${remotePath} → ${localPath}`, _verbosity);

    // Download the file using functional service
    const result = await internxtDownloadFile(remotePath, localPath);

    if (result.success) {
      logger.success(`Downloaded: ${remotePath}`, _verbosity);
      return { success: true, filePath: localPath };
    } else {
      logger.error(`Failed to download ${remotePath}: ${result.error}`);
      return { success: false, filePath: localPath, error: result.error };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Error downloading ${remotePath}: ${msg}`);
    return { success: false, filePath: localPath, error: msg };
  }
};

export const isFileUpToDate = async (localPath: string, remoteSize: number): Promise<boolean> => {
  try {
    const file = Bun.file(localPath);
    const exists = await file.exists();
    if (!exists) return false;
    return file.size === remoteSize;
  } catch {
    return false;
  }
};
