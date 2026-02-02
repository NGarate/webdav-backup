/**
 * Behavioral tests for RestoreDownloader
 * Tests what the functions do, not that they exist
 */

import { expect, describe, beforeEach, it, spyOn, mock } from 'bun:test';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock the internxt-service module with ALL exports to avoid conflicts with other test files
const mockInternxtDownloadFile = mock((remotePath: string, localPath: string) =>
  Promise.resolve({ success: true, filePath: localPath, remotePath, output: 'Downloaded' })
);

mock.module('../internxt/internxt-service.js', () => ({
  // Core exports needed by this test
  internxtDownloadFile: mockInternxtDownloadFile,
  initInternxtService: () => {},
  // Additional exports needed by other test files to avoid "undefined" errors
  checkInternxtCLI: mock(() => Promise.resolve({ installed: true, authenticated: true, version: '1.0.0' })),
  internxtUploadFile: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Uploaded' })),
  internxtUploadFileWithProgress: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Uploaded' })),
  internxtCreateFolder: mock(() => Promise.resolve({ success: true, path: '/remote' })),
  internxtListFiles: mock(() => Promise.resolve({ success: true, files: [] })),
  internxtFileExists: mock(() => Promise.resolve(false)),
  internxtDeleteFile: mock(() => Promise.resolve(true)),
  internxtDownloadFileWithProgress: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Downloaded' }))
}));

// Import downloader after mocking
const { initRestoreDownloader, downloadFile, isFileUpToDate } = await import('./downloader');

describe('RestoreDownloader', () => {
  beforeEach(() => {
    // Reset mocks
    mockInternxtDownloadFile.mockClear();

    // Silence logger output during tests
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});

    initRestoreDownloader();
  });

  describe('downloadFile', () => {
    it('should create parent directory before downloading', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'nested', 'deep', 'file.txt');

      try {
        await downloadFile('/remote/file.txt', localPath);

        // Verify parent directory was created
        const parentDir = path.dirname(localPath);
        const stats = await fs.stat(parentDir);
        expect(stats.isDirectory()).toBe(true);
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    it('should call internxtDownloadFile with correct paths', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'file.txt');

      try {
        await downloadFile('/remote/file.txt', localPath);

        expect(mockInternxtDownloadFile).toHaveBeenCalledWith('/remote/file.txt', localPath);
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    it('should return success on successful download', async () => {
      mockInternxtDownloadFile.mockImplementationOnce(() =>
        Promise.resolve({ success: true, filePath: '/local/file.txt', remotePath: '/remote/file.txt', output: 'Downloaded' })
      );

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'file.txt');

      try {
        const result = await downloadFile('/remote/file.txt', localPath);

        expect(result.success).toBe(true);
        expect(result.filePath).toBe(localPath);
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    it('should return failure when download fails', async () => {
      mockInternxtDownloadFile.mockImplementationOnce(() =>
        Promise.resolve({ success: false, filePath: '/local/file.txt', remotePath: '/remote/file.txt', error: 'Network error' })
      );

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'file.txt');

      try {
        const result = await downloadFile('/remote/file.txt', localPath);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    it('should log success on download', async () => {
      mockInternxtDownloadFile.mockImplementationOnce(() =>
        Promise.resolve({ success: true, filePath: '/local/file.txt', remotePath: '/remote/file.txt', output: 'Downloaded' })
      );

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'file.txt');
      const successSpy = spyOn(logger, 'success').mockImplementation(() => {});

      try {
        await downloadFile('/remote/file.txt', localPath);

        expect(successSpy).toHaveBeenCalled();
      } finally {
        await fs.rm(tempDir, { recursive: true });
        successSpy.mockRestore();
      }
    });

    it('should log error on failure', async () => {
      mockInternxtDownloadFile.mockImplementationOnce(() =>
        Promise.resolve({ success: false, filePath: '/local/file.txt', remotePath: '/remote/file.txt', error: 'Network error' })
      );

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'file.txt');
      const errorSpy = spyOn(logger, 'error').mockImplementation(() => {});

      try {
        await downloadFile('/remote/file.txt', localPath);

        expect(errorSpy).toHaveBeenCalled();
      } finally {
        await fs.rm(tempDir, { recursive: true });
        errorSpy.mockRestore();
      }
    });

    it('should return failure on exception', async () => {
      mockInternxtDownloadFile.mockImplementationOnce(() =>
        Promise.reject(new Error('Unexpected error'))
      );

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localPath = path.join(tempDir, 'file.txt');

      try {
        const result = await downloadFile('/remote/file.txt', localPath);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unexpected error');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });
  });

  describe('isFileUpToDate', () => {
    it('should return false for non-existent files', async () => {
      const result = await isFileUpToDate('/nonexistent/file.txt', 1024);
      expect(result).toBe(false);
    });

    it('should return false when file size differs', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const tempFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(tempFile, 'test content'); // 12 bytes

      try {
        const result = await isFileUpToDate(tempFile, 1024);
        expect(result).toBe(false);
      } finally {
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);
      }
    });

    it('should return true when file exists with same size', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const tempFile = path.join(tempDir, 'test.txt');
      const content = 'test content';
      await fs.writeFile(tempFile, content);

      try {
        const result = await isFileUpToDate(tempFile, content.length);
        expect(result).toBe(true);
      } finally {
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);
      }
    });
  });
});
