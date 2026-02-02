/**
 * Behavioral tests for file-sync.ts
 * Tests what syncFiles does, not that it exports functions
 */

import { expect, describe, beforeEach, it, mock, spyOn } from 'bun:test';
import * as logger from './utils/logger';
import { Verbosity } from './interfaces/logger';

// Mock dependencies
const mockCheckInternxtCLI = mock(() => Promise.resolve({
  installed: true,
  authenticated: true,
  version: '1.0.0'
}));

const mockScanFiles = mock(() => Promise.resolve({
  allFiles: [],
  filesToUpload: [],
  totalSizeBytes: 0,
  totalSizeMB: '0.00'
}));

const mockStartUpload = mock(() => Promise.resolve());

const mockInitFileScanner = mock(() => {});
const mockInitUploader = mock(() => {});
const mockInitInternxtService = mock(() => {});

mock.module('./core/internxt/internxt-service.js', () => ({
  checkInternxtCLI: mockCheckInternxtCLI,
  initInternxtService: mockInitInternxtService,
  // Additional exports needed by other test files
  internxtUploadFile: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Uploaded' })),
  internxtUploadFileWithProgress: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Uploaded' })),
  internxtCreateFolder: mock(() => Promise.resolve({ success: true, path: '/remote' })),
  internxtListFiles: mock(() => Promise.resolve({ success: true, files: [] })),
  internxtFileExists: mock(() => Promise.resolve(false)),
  internxtDeleteFile: mock(() => Promise.resolve(true)),
  internxtDownloadFile: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Downloaded' })),
  internxtDownloadFileWithProgress: mock(() => Promise.resolve({ success: true, filePath: '/local', remotePath: '/remote', output: 'Downloaded' }))
}));

mock.module('./core/file-scanner.js', () => ({
  initFileScanner: mockInitFileScanner,
  scanFiles: mockScanFiles
}));

mock.module('./core/upload/uploader.js', () => ({
  initUploader: mockInitUploader,
  startUpload: mockStartUpload
}));

// Import after mocking
const { syncFiles } = await import('./file-sync');

describe('syncFiles', () => {
  beforeEach(() => {
    // Reset all mocks
    mockCheckInternxtCLI.mockClear();
    mockScanFiles.mockClear();
    mockStartUpload.mockClear();
    mockInitFileScanner.mockClear();
    mockInitUploader.mockClear();
    mockInitInternxtService.mockClear();

    // Silence logger
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
  });

  describe('CLI validation', () => {
    it('should check CLI before scanning', async () => {
      await syncFiles('/test/source', { target: '/backup' });

      expect(mockCheckInternxtCLI).toHaveBeenCalled();
      expect(mockInitInternxtService).toHaveBeenCalled();
    });

    it('should throw when CLI not installed', async () => {
      mockCheckInternxtCLI.mockImplementationOnce(() =>
        Promise.resolve({
          installed: false,
          authenticated: false,
          error: 'Internxt CLI not found'
        })
      );

      await expect(syncFiles('/test/source', {})).rejects.toThrow('Internxt CLI not found');
    });

    it('should throw when not authenticated', async () => {
      mockCheckInternxtCLI.mockImplementationOnce(() =>
        Promise.resolve({
          installed: true,
          authenticated: false,
          version: '1.0.0',
          error: 'Not authenticated'
        })
      );

      await expect(syncFiles('/test/source', {})).rejects.toThrow('Not authenticated');
    });

    it('should log CLI version on success', async () => {
      const successSpy = spyOn(logger, 'success');

      await syncFiles('/test/source', {});

      expect(successSpy).toHaveBeenCalled();
      const calls = successSpy.mock.calls.map(c => c[0]);
      expect(calls.some(msg => msg.includes('1.0.0'))).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should initialize scanner with source directory', async () => {
      await syncFiles('/test/source', { target: '/backup' });

      expect(mockInitFileScanner).toHaveBeenCalledWith('/test/source', expect.any(Number), undefined);
    });

    it('should initialize uploader with correct options', async () => {
      await syncFiles('/test/source', { target: '/backup', cores: 4 });

      expect(mockInitUploader).toHaveBeenCalledWith(
        expect.any(Number),
        '/backup',
        expect.any(Number),
        expect.objectContaining({ resume: undefined, chunkSize: undefined })
      );
    });

    it('should pass resume options to uploader when enabled', async () => {
      await syncFiles('/test/source', { target: '/backup', resume: true, chunkSize: 50 });

      expect(mockInitUploader).toHaveBeenCalledWith(
        expect.any(Number),
        '/backup',
        expect.any(Number),
        expect.objectContaining({ resume: true, chunkSize: 50 })
      );
    });
  });

  describe('file scanning and upload', () => {
    it('should scan and upload files', async () => {
      const filesToUpload = [
        { relativePath: 'file1.txt', absolutePath: '/test/file1.txt', size: 100, checksum: 'abc', hasChanged: true }
      ];

      mockScanFiles.mockImplementationOnce(() =>
        Promise.resolve({
          allFiles: filesToUpload,
          filesToUpload: filesToUpload,
          totalSizeBytes: 100,
          totalSizeMB: '0.10'
        })
      );

      await syncFiles('/test/source', { target: '/backup' });

      expect(mockScanFiles).toHaveBeenCalled();
      expect(mockStartUpload).toHaveBeenCalledWith(filesToUpload);
    });

    it('should skip upload when all files up to date', async () => {
      mockScanFiles.mockImplementationOnce(() =>
        Promise.resolve({
          allFiles: [],
          filesToUpload: [],
          totalSizeBytes: 0,
          totalSizeMB: '0.00'
        })
      );

      const successSpy = spyOn(logger, 'success');

      await syncFiles('/test/source', { target: '/backup' });

      expect(mockStartUpload).not.toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
      const calls = successSpy.mock.calls.map(c => c[0]);
      expect(calls.some(msg => msg.includes('up to date'))).toBe(true);
    });

    it('should log file count after scanning', async () => {
      const filesToUpload = [
        { relativePath: 'file1.txt', absolutePath: '/test/file1.txt', size: 100, checksum: 'abc', hasChanged: true },
        { relativePath: 'file2.txt', absolutePath: '/test/file2.txt', size: 200, checksum: 'def', hasChanged: true }
      ];

      mockScanFiles.mockImplementationOnce(() =>
        Promise.resolve({
          allFiles: filesToUpload,
          filesToUpload: filesToUpload,
          totalSizeBytes: 300,
          totalSizeMB: '0.29'
        })
      );

      const infoSpy = spyOn(logger, 'info');

      await syncFiles('/test/source', { target: '/backup' });

      expect(infoSpy).toHaveBeenCalled();
    });
  });

  describe('verbosity settings', () => {
    it('should set quiet verbosity when options.quiet is true', async () => {
      await syncFiles('/test/source', { quiet: true });

      expect(mockInitFileScanner).toHaveBeenCalledWith(
        expect.any(String),
        Verbosity.Quiet,
        undefined
      );
    });

    it('should set verbose verbosity when options.verbose is true', async () => {
      await syncFiles('/test/source', { verbose: true });

      expect(mockInitFileScanner).toHaveBeenCalledWith(
        expect.any(String),
        Verbosity.Verbose,
        undefined
      );
    });

    it('should use normal verbosity by default', async () => {
      await syncFiles('/test/source', {});

      expect(mockInitFileScanner).toHaveBeenCalledWith(
        expect.any(String),
        Verbosity.Normal,
        undefined
      );
    });
  });

  describe('force upload', () => {
    it('should pass force flag to scanner', async () => {
      await syncFiles('/test/source', { force: true });

      expect(mockInitFileScanner).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        true
      );
    });
  });

  describe('error handling', () => {
    it('should log error and rethrow on scanner error', async () => {
      mockScanFiles.mockImplementationOnce(() =>
        Promise.reject(new Error('Scan failed'))
      );

      const errorSpy = spyOn(logger, 'error');

      await expect(syncFiles('/test/source', {})).rejects.toThrow('Scan failed');

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log error and rethrow on upload error', async () => {
      mockScanFiles.mockImplementationOnce(() =>
        Promise.resolve({
          allFiles: [{ relativePath: 'file.txt' }],
          filesToUpload: [{ relativePath: 'file.txt' }],
          totalSizeBytes: 100,
          totalSizeMB: '0.10'
        })
      );

      mockStartUpload.mockImplementationOnce(() =>
        Promise.reject(new Error('Upload failed'))
      );

      const errorSpy = spyOn(logger, 'error');

      await expect(syncFiles('/test/source', {})).rejects.toThrow('Upload failed');

      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
