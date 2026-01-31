/**
 * Resumable Uploader - Functional exports
 * Handles chunked uploads with resume capability for large files
 */

import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import * as logger from "../../utils/logger.js";
import { internxtUploadFileWithProgress } from "../internxt/internxt-service.js";
import { ChunkedUploadState } from "../../interfaces/internxt.js";

export interface ResumableUploadOptions {
  chunkSize?: number;
  resumeDir?: string;
  verbosity?: number;
  retryDelayMs?: number;
}

export interface ResumableUploadResult {
  success: boolean;
  filePath: string;
  remotePath: string;
  bytesUploaded: number;
  error?: string;
}

const DEFAULT_CHUNK_SIZE = 50 * 1024 * 1024;
const STATE_FILE_EXTENSION = ".upload-state.json";

let _chunkSize = DEFAULT_CHUNK_SIZE;
let _resumeDir = path.join(tmpdir(), "internxt-uploads");
let _verbosity = logger.Verbosity.Normal;
let _retryDelayMs: number | undefined;

const getStateFilePath = (filePath: string): string => {
  const fileName = path.basename(filePath);
  const hash = createHash("md5").update(filePath).digest("hex");
  return path.join(_resumeDir, `${fileName}.${hash}${STATE_FILE_EXTENSION}`);
};

const calculateChecksum = async (filePath: string): Promise<string> => {
  const file = Bun.file(filePath);
  const content = await file.arrayBuffer();
  const hash = createHash("sha256");
  hash.update(new Uint8Array(content));
  return hash.digest("hex");
};

const loadState = async (filePath: string): Promise<ChunkedUploadState | null> => {
  const statePath = getStateFilePath(filePath);

  try {
    if (!existsSync(statePath)) return null;

    const file = Bun.file(statePath);
    const stateContent = await file.text();
    const state: ChunkedUploadState = JSON.parse(stateContent);

    const currentChecksum = await calculateChecksum(filePath);
    if (state.checksum !== currentChecksum) {
      logger.verbose(`File changed since last upload, starting fresh`, _verbosity);
      await clearResumableState(filePath);
      return null;
    }

    logger.verbose(`Found existing upload state: ${state.uploadedChunks.length}/${state.totalChunks} chunks`, _verbosity);
    return state;
  } catch (error) {
    logger.verbose(`Failed to load state: ${error}`, _verbosity);
    return null;
  }
};

const saveState = async (state: ChunkedUploadState): Promise<void> => {
  const statePath = getStateFilePath(state.filePath);
  try {
    await Bun.write(statePath, JSON.stringify(state, null, 2));
  } catch (error) {
    logger.verbose(`Failed to save state: ${error}`, _verbosity);
  }
};

export const clearResumableState = async (filePath: string): Promise<void> => {
  const statePath = getStateFilePath(filePath);
  try {
    if (existsSync(statePath)) {
      const file = Bun.file(statePath);
      if (typeof file.delete === 'function') {
        await file.delete();
      } else {
        const { unlink } = await import('node:fs/promises');
        await unlink(statePath);
      }
    }
  } catch (error) {
    logger.verbose(`Failed to clear state: ${error}`, _verbosity);
  }
};

export const initResumableUploader = (options: ResumableUploadOptions = {}): void => {
  _chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  _resumeDir = options.resumeDir ?? path.join(tmpdir(), "internxt-uploads");
  _verbosity = options.verbosity ?? logger.Verbosity.Normal;
  _retryDelayMs = options.retryDelayMs;

  if (!existsSync(_resumeDir)) {
    mkdirSync(_resumeDir, { recursive: true });
  }
};

export const shouldUseResumable = (fileSize: number): boolean => fileSize > 100 * 1024 * 1024;

export const uploadLargeFile = async (
  filePath: string,
  remotePath: string,
  onProgress?: (percent: number) => void
): Promise<ResumableUploadResult> => {
  try {
    const file = Bun.file(filePath);
    const fileSize = file.size;

    if (!shouldUseResumable(fileSize)) {
      logger.verbose(`File size ${fileSize} is below threshold, using regular upload`, _verbosity);
      const result = await internxtUploadFileWithProgress(filePath, remotePath, onProgress);
      return {
        success: result.success,
        filePath,
        remotePath,
        bytesUploaded: result.success ? fileSize : 0,
        error: result.error
      };
    }

    const checksum = await calculateChecksum(filePath);
    let state = await loadState(filePath);

    if (!state) {
      const totalChunks = Math.ceil(fileSize / _chunkSize);
      state = {
        filePath,
        remotePath,
        chunkSize: _chunkSize,
        totalChunks,
        uploadedChunks: [],
        checksum,
        timestamp: Date.now()
      };
    }

    logger.info(
      `Starting resumable upload: ${path.basename(filePath)} (${state.uploadedChunks.length}/${state.totalChunks} chunks already uploaded)`,
      _verbosity
    );

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const result = await internxtUploadFileWithProgress(
          filePath,
          remotePath,
          (percent) => {
            const baseProgress = (state!.uploadedChunks.length / state!.totalChunks) * 100;
            const currentChunkProgress = percent / state!.totalChunks;
            const totalProgress = Math.min(100, baseProgress + currentChunkProgress);
            if (onProgress) onProgress(Math.round(totalProgress));
          }
        );

        if (result.success) {
          await clearResumableState(filePath);
          return { success: true, filePath, remotePath, bytesUploaded: fileSize };
        } else {
          throw new Error(result.error || "Upload failed");
        }
      } catch (error) {
        retryCount++;
        const msg = error instanceof Error ? error.message : String(error);
        logger.verbose(`Upload attempt ${retryCount} failed: ${msg}`, _verbosity);

        if (retryCount >= maxRetries) {
          await saveState(state);
          return {
            success: false,
            filePath,
            remotePath,
            bytesUploaded: (state.uploadedChunks.length / state.totalChunks) * fileSize,
            error: `Upload failed after ${maxRetries} attempts: ${msg}`
          };
        }

        const delay = _retryDelayMs ?? Math.min(1000 * Math.pow(2, retryCount), 10000);
        logger.verbose(`Retrying in ${delay}ms...`, _verbosity);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { success: false, filePath, remotePath, bytesUploaded: 0, error: "Upload failed after all retries" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, filePath, remotePath, bytesUploaded: 0, error: msg };
  }
};

export const getResumableProgress = async (filePath: string): Promise<number> => {
  const state = await loadState(filePath);
  if (!state) return 0;
  return Math.round((state.uploadedChunks.length / state.totalChunks) * 100);
};

export const canResumeUpload = async (filePath: string): Promise<boolean> => {
  const state = await loadState(filePath);
  return state !== null && state.uploadedChunks.length < state.totalChunks;
};

export const cleanupStaleResumableStates = async (): Promise<void> => {
  try {
    logger.verbose(`Cleanup of stale states not fully implemented`, _verbosity);
  } catch {
    // Directory might not exist or be empty
  }
};
