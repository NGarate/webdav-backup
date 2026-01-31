/**
 * Tests for ResumableUploader functional exports
 */

import { expect, describe, beforeEach, afterEach, it, mock, jest } from 'bun:test';
import {
  initResumableUploader,
  shouldUseResumable,
  uploadLargeFile,
  getResumableProgress,
  canResumeUpload,
  clearResumableState,
  cleanupStaleResumableStates
} from './resumable-uploader';
import { Verbosity } from '../../interfaces/logger';
import { mkdir, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as internxtService from '../internxt/internxt-service';

// Mock the internxt service
const mockUploadFileWithProgress = mock(() => Promise.resolve({
  success: true,
  filePath: '/local/path',
  remotePath: '/remote/path',
  output: 'Upload successful',
  error: undefined
}));

describe('ResumableUploader', () => {
  let tempDir: string;
  let resumeDir: string;

  beforeEach(async () => {
    jest.useFakeTimers();
    tempDir = join(tmpdir(), `resumable-test-${Date.now()}`);
    resumeDir = join(tempDir, 'resume');
    await mkdir(tempDir, { recursive: true });

    initResumableUploader({
      verbosity: Verbosity.Normal,
      resumeDir
    });

    // Setup mock
    mockUploadFileWithProgress.mockClear();
  });

  afterEach(async () => {
    if (jest.isFakeTimers()) {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
    try {
      if (existsSync(tempDir)) {
        await rmdir(tempDir, { recursive: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    mockUploadFileWithProgress.mockClear();
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      initResumableUploader();
      expect(typeof uploadLargeFile).toBe('function');
    });

    it('should initialize with custom options', () => {
      const customResumeDir = join(tempDir, 'custom-resume');
      initResumableUploader({
        chunkSize: 1024 * 1024,
        verbosity: Verbosity.Verbose,
        resumeDir: customResumeDir
      });
      expect(typeof uploadLargeFile).toBe('function');
    });
  });

  describe('shouldUseResumable', () => {
    it('should return false for files under 100MB', () => {
      expect(shouldUseResumable(50 * 1024 * 1024)).toBe(false);
      expect(shouldUseResumable(99 * 1024 * 1024)).toBe(false);
      expect(shouldUseResumable(1024)).toBe(false);
    });

    it('should return true for files larger than 100MB', () => {
      expect(shouldUseResumable(100 * 1024 * 1024 + 1)).toBe(true);
      expect(shouldUseResumable(200 * 1024 * 1024)).toBe(true);
      expect(shouldUseResumable(1024 * 1024 * 1024)).toBe(true);
    });
  });

  describe('uploadLargeFile', () => {
    it('should use regular upload for small files', async () => {
      const testFile = join(tempDir, 'small.txt');
      await Bun.write(testFile, 'small content');

      mockUploadFileWithProgress.mockImplementation(() => Promise.resolve({
        success: true,
        filePath: testFile,
        remotePath: '/remote/small.txt',
        output: 'Upload successful'
      }));

      const result = await uploadLargeFile(testFile, '/remote/small.txt');

      expect(result.success).toBe(true);
    });

    it('should call progress callback', async () => {
      const testFile = join(tempDir, 'progress-test.txt');
      await Bun.write(testFile, Buffer.alloc(101 * 1024 * 1024, 0));

      const progressCallback = mock(() => {});

      mockUploadFileWithProgress.mockImplementation((path: string, remote: string, onProgress?: (percent: number) => void) => {
        if (onProgress) {
          onProgress(50);
        }
        return Promise.resolve({
          success: true,
          filePath: testFile,
          remotePath: '/remote/progress.bin',
          output: 'Upload successful'
        });
      });

      await uploadLargeFile(testFile, '/remote/progress.bin', progressCallback);

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('clearResumableState', () => {
    it('should handle non-existent state file gracefully', async () => {
      const testFile = join(tempDir, 'no-state.txt');

      // Should not throw
      await clearResumableState(testFile);
    });
  });

  describe('getResumableProgress', () => {
    it('should return 0 when no state exists', async () => {
      const progress = await getResumableProgress('/nonexistent/file.bin');
      expect(progress).toBe(0);
    });
  });

  describe('canResumeUpload', () => {
    it('should return false when no state exists', async () => {
      const canResume = await canResumeUpload('/nonexistent/file.bin');
      expect(canResume).toBe(false);
    });
  });

  describe('cleanupStaleResumableStates', () => {
    it('should run without errors', async () => {
      await cleanupStaleResumableStates();
    });
  });
});
