/**
 * ProgressTracker - Functional exports with closure-based state
 * Handles tracking and displaying upload progress
 */

import chalk from "chalk";
import * as logger from "../../utils/logger.js";

let _totalFiles = 0;
let _completedFiles = 0;
let _failedFiles = 0;
let _updateInterval: ReturnType<typeof setInterval> | null = null;
let _isTrackingActive = false;
let _hasDrawnProgressBar = false;
let _lastMessageTime = 0;
let _inOverrideFunction = false;

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error
};

export const initProgressTracker = (totalFiles: number): void => {
  _totalFiles = totalFiles;
  _completedFiles = 0;
  _failedFiles = 0;
  _hasDrawnProgressBar = false;
  _lastMessageTime = 0;
  _inOverrideFunction = false;
  setupConsoleOverrides();
};

const setupConsoleOverrides = (): void => {
  const createOverride = (originalMethod: typeof console.log) => {
    return function(...args: unknown[]) {
      if (_inOverrideFunction) {
        return originalMethod.apply(console, args);
      }

      _inOverrideFunction = true;

      try {
        if (_isTrackingActive) {
          if (_hasDrawnProgressBar) {
            process.stdout.write('\r\x1B[K');
          }

          originalMethod.apply(console, args);

          const lastArg = args[args.length - 1];
          if (typeof lastArg === 'string' && !lastArg.endsWith('\n')) {
            process.stdout.write('\n');
          }

          _lastMessageTime = Date.now();

          const now = Date.now();
          if (now - _lastMessageTime > 100) {
            queueMicrotask(() => displayProgress());
          }
        } else {
          originalMethod.apply(console, args);
        }
      } finally {
        _inOverrideFunction = false;
      }
    };
  };

  console.log = createOverride(originalConsole.log);
  console.info = createOverride(originalConsole.info);
  console.warn = createOverride(originalConsole.warn);
  console.error = createOverride(originalConsole.error);
};

const restoreConsole = (): void => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
};

const displayProgress = (): void => {
  if (!_isTrackingActive) return;
  
  const processed = _completedFiles + _failedFiles;
  const percentage = _totalFiles > 0 ? Math.floor((processed / _totalFiles) * 100) : 0;
  const barWidth = 40;
  const completeWidth = Math.floor((percentage / 100) * barWidth);
  const bar = "█".repeat(completeWidth) + "░".repeat(barWidth - completeWidth);
  
  if (_hasDrawnProgressBar) {
    process.stdout.write('\r\x1B[K');
  } else {
    _hasDrawnProgressBar = true;
  }
  
  process.stdout.write(`[${bar}] ${percentage}% | ${processed}/${_totalFiles}\n`);
  
  if (processed === _totalFiles && _totalFiles > 0) {
    process.stdout.write('\n');
    stopProgressUpdates();
  }
};

export const recordProgressSuccess = (): void => {
  _completedFiles++;
};

export const recordProgressFailure = (): void => {
  _failedFiles++;
};

export const startProgressUpdates = (intervalMs = 250): void => {
  stopProgressUpdates();
  
  _isTrackingActive = true;
  process.stdout.write('\n');
  
  _updateInterval = setInterval(() => displayProgress(), intervalMs);
  displayProgress();
};

export const stopProgressUpdates = (): void => {
  if (_updateInterval) {
    clearInterval(_updateInterval);
    _updateInterval = null;
  }
  
  _isTrackingActive = false;
  restoreConsole();
  
  if (_hasDrawnProgressBar) {
    process.stdout.write('\r\x1B[K');
  }
};

export const displayProgressSummary = (): void => {
  if (_isTrackingActive) {
    stopProgressUpdates();
  }

  process.stdout.write('\n');

  if (_failedFiles === 0) {
    logger.always(chalk.green(`Upload completed successfully! All ${_completedFiles} files uploaded.`));
  } else {
    logger.always(chalk.yellow(`Upload completed with issues: ${_completedFiles} succeeded, ${_failedFiles} failed.`));
  }
};

export const getProgressPercentage = (): number => {
  const processed = _completedFiles + _failedFiles;
  return _totalFiles > 0 ? Math.floor((processed / _totalFiles) * 100) : 0;
};

export const isProgressComplete = (): boolean => {
  return (_completedFiles + _failedFiles) === _totalFiles && _totalFiles > 0;
};

export const resetProgressTracker = (): void => {
  stopProgressUpdates();
  _totalFiles = 0;
  _completedFiles = 0;
  _failedFiles = 0;
  _hasDrawnProgressBar = false;
  _lastMessageTime = 0;
  _inOverrideFunction = false;
};
