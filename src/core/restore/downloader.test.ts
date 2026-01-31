/**
 * Tests for RestoreDownloader
 */

import { expect, describe, it, beforeEach, mock, spyOn } from 'bun:test';
import { RestoreDownloader } from './downloader';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('RestoreDownloader', () => {
  beforeEach(() => {
    // Mock logger functions to suppress output
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should initialize with default verbosity', () => {
      const downloader = new RestoreDownloader();
      expect(downloader).toBeDefined();
      expect(typeof downloader.downloadFile).toBe('function');
      expect(typeof downloader.isFileUpToDate).toBe('function');
    });

    it('should initialize with custom verbosity', () => {
      const downloader = new RestoreDownloader({ verbosity: Verbosity.Verbose });
      expect(downloader).toBeDefined();
    });

    it('should initialize with quiet verbosity', () => {
      const downloader = new RestoreDownloader({ verbosity: Verbosity.Quiet });
      expect(downloader).toBeDefined();
    });
  });

  describe('downloadFile', () => {
    it('should have downloadFile method', () => {
      const downloader = new RestoreDownloader();
      expect(typeof downloader.downloadFile).toBe('function');
    });

    it('should return a DownloadResult structure with success true', async () => {
      const downloader = new RestoreDownloader();
      
      // Create a temp directory for the local path
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localFile = path.join(tempDir, 'file.txt');
      
      // Mock the internxt service to return success
      const mockService = {
        downloadFile: mock(() => Promise.resolve({
          success: true,
          filePath: localFile,
          remotePath: '/remote/file.txt',
          output: 'Download successful'
        }))
      };
      
      (downloader as any).internxtService = mockService;

      try {
        const result = await downloader.downloadFile('/remote/file.txt', localFile);
        
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('filePath');
        expect(result.success).toBe(true);
        expect(result.filePath).toBe(localFile);
      } finally {
        await fs.rmdir(tempDir);
      }
    });

    it('should return a DownloadResult structure with success false on error', async () => {
      const downloader = new RestoreDownloader();
      
      // Create a temp directory for the local path
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localFile = path.join(tempDir, 'file.txt');
      
      // Mock the internxt service to return failure
      const mockService = {
        downloadFile: mock(() => Promise.resolve({
          success: false,
          filePath: localFile,
          remotePath: '/remote/file.txt',
          error: 'Download failed'
        }))
      };
      
      (downloader as any).internxtService = mockService;

      try {
        const result = await downloader.downloadFile('/remote/file.txt', localFile);
        
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('filePath');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Download failed');
      } finally {
        await fs.rmdir(tempDir);
      }
    });

    it('should handle exceptions during download', async () => {
      const downloader = new RestoreDownloader();
      
      // Create a temp directory for the local path
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const localFile = path.join(tempDir, 'file.txt');
      
      // Mock the internxt service to throw
      const mockService = {
        downloadFile: mock(() => Promise.reject(new Error('Network error')))
      };
      
      (downloader as any).internxtService = mockService;

      try {
        const result = await downloader.downloadFile('/remote/file.txt', localFile);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
      } finally {
        await fs.rmdir(tempDir);
      }
    });
  });

  describe('isFileUpToDate', () => {
    it('should have isFileUpToDate method', () => {
      const downloader = new RestoreDownloader();
      expect(typeof downloader.isFileUpToDate).toBe('function');
    });

    it('should return false for non-existent files', async () => {
      const downloader = new RestoreDownloader();
      
      const result = await downloader.isFileUpToDate('/nonexistent/file.txt', 1024);
      
      expect(result).toBe(false);
    });

    it('should return false when file size differs', async () => {
      const downloader = new RestoreDownloader();
      
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const tempFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(tempFile, 'test content'); // 12 bytes
      
      try {
        // Check with different size (1024 bytes)
        const result = await downloader.isFileUpToDate(tempFile, 1024);
        expect(result).toBe(false);
      } finally {
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);
      }
    });

    it('should return true when file exists with same size', async () => {
      const downloader = new RestoreDownloader();
      
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      const tempFile = path.join(tempDir, 'test.txt');
      const content = 'test content';
      await fs.writeFile(tempFile, content);
      
      try {
        // Check with same size (12 bytes)
        const result = await downloader.isFileUpToDate(tempFile, content.length);
        expect(result).toBe(true);
      } finally {
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);
      }
    });

    it('should return false for directories', async () => {
      const downloader = new RestoreDownloader();
      
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
      
      try {
        // Directories should not be considered up-to-date
        const result = await downloader.isFileUpToDate(tempDir, 1024);
        expect(result).toBe(false);
      } finally {
        await fs.rmdir(tempDir);
      }
    });
  });

  describe('getInternxtService', () => {
    it('should return the internxt service instance', () => {
      const downloader = new RestoreDownloader();
      const service = downloader.getInternxtService();
      
      expect(service).toBeDefined();
      expect(typeof service.downloadFile).toBe('function');
      expect(typeof service.listFiles).toBe('function');
    });
  });
});
