/**
 * FileQueue - Functional exports with closure-based state
 * Manages the concurrent upload of files to Internxt Drive
 */

import { FileInfo } from "../../interfaces/file-scanner.js";
import * as logger from "../../utils/logger.js";

let _pendingFiles: FileInfo[] = [];
let _activeUploads = new Set<string>();
let _handler: ((f: FileInfo) => Promise<{ success: boolean; filePath: string }>) | null = null;
let _maxConcurrency = 1;
let _verbosity = logger.Verbosity.Normal;
let _completionCallback: (() => void) | null = null;
let _checkInterval: ReturnType<typeof setInterval> | null = null;

const processNextFile = (): void => {
  if (_pendingFiles.length === 0) {
    if (_activeUploads.size === 0 && _completionCallback) {
      _completionCallback();
    }
    return;
  }

  if (_activeUploads.size < _maxConcurrency && _handler) {
    const fileInfo = _pendingFiles.shift()!;
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    _activeUploads.add(uploadId);
    logger.verbose(`Starting upload for ${fileInfo.relativePath}`, _verbosity);
    
    _handler(fileInfo)
      .then(() => {
        _activeUploads.delete(uploadId);
        processNextFile();
      })
      .catch((error: Error) => {
        _activeUploads.delete(uploadId);
        logger.error(`Upload failed for ${fileInfo.relativePath}: ${error.message}`);
        processNextFile();
      });
  }
};

export const initFileQueue = (
  maxConcurrency: number,
  handler: typeof _handler,
  verbosity: number = logger.Verbosity.Normal
): void => {
  _maxConcurrency = maxConcurrency;
  _handler = handler;
  _verbosity = verbosity;
  _pendingFiles = [];
  _activeUploads.clear();
  _completionCallback = null;
};

export const setFileQueue = (files: FileInfo[]): void => {
  _pendingFiles.length = 0;
  _pendingFiles.push(...files);
  logger.verbose(`Upload queue set with ${files.length} files`, _verbosity);
};

export const startFileQueue = (onComplete?: () => void): void => {
  _completionCallback = onComplete || null;
  
  logger.info(`Starting parallel upload with ${_maxConcurrency} concurrent uploads...`, _verbosity);
  
  const initialBatchSize = Math.min(_maxConcurrency, _pendingFiles.length);
  for (let i = 0; i < initialBatchSize; i++) {
    processNextFile();
  }
  
  if (_completionCallback) {
    _checkInterval = setInterval(() => {
      if (_pendingFiles.length === 0 && _activeUploads.size === 0) {
        if (_checkInterval) {
          clearInterval(_checkInterval);
          _checkInterval = null;
        }
        _completionCallback!();
      }
    }, 500);
  }
};

export const cancelFileQueue = (): void => {
  logger.info(`Cancelling ${_pendingFiles.length} pending uploads`, _verbosity);
  _pendingFiles.length = 0;
  
  if (_checkInterval) {
    clearInterval(_checkInterval);
    _checkInterval = null;
  }
};

export const fileQueuePendingCount = (): number => _pendingFiles.length;

export const fileQueueActiveCount = (): number => _activeUploads.size;

export const isFileQueueIdle = (): boolean => _pendingFiles.length === 0 && _activeUploads.size === 0;

export const resetFileQueue = (): void => {
  cancelFileQueue();
  _activeUploads.clear();
  _handler = null;
  _maxConcurrency = 1;
};
