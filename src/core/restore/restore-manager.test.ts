/**
 * Tests for RestoreManager
 */

import { expect, describe, it, beforeEach, afterEach, mock, spyOn, jest } from 'bun:test';
import { RestoreManager, RestoreOptions } from './restore-manager';
import { RestoreDownloader } from './downloader';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('RestoreManager', () => {
  const mockRemotePath = '/Backups/Test';
  const mockLocalPath = '/tmp/restore-test';

  beforeEach(async () => {
    // Mock logger functions to suppress output
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
    
    // Create temp directory for tests
    await fs.mkdir(mockLocalPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rmdir(mockLocalPath, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      expect(manager).toBeDefined();
    });

    it('should initialize with quiet verbosity', () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath, { quiet: true });
      
      expect(manager).toBeDefined();
    });

    it('should initialize with verbose verbosity', () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath, { verbose: true });
      
      expect(manager).toBeDefined();
    });

    it('should initialize with custom cores', () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath, { cores: 4 });
      
      expect(manager).toBeDefined();
    });

    it('should initialize with force option', () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath, { force: true });
      
      expect(manager).toBeDefined();
    });
  });

  describe('restore - CLI checks', () => {
    it('should throw error when CLI is not installed', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      // Mock internxt service to return not installed
      const mockService = {
        checkCLI: mock(() => Promise.resolve({
          installed: false,
          authenticated: false,
          error: 'CLI not found'
        }))
      };
      
      (manager as any).internxtService = mockService;

      await expect(manager.restore()).rejects.toThrow('CLI not found');
    });

    it('should throw error when not authenticated', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      // Mock internxt service to return not authenticated
      const mockService = {
        checkCLI: mock(() => Promise.resolve({
          installed: true,
          authenticated: false,
          version: '1.0.0',
          error: 'Not authenticated'
        }))
      };
      
      (manager as any).internxtService = mockService;

      await expect(manager.restore()).rejects.toThrow('Not authenticated');
    });
  });

  describe('restore - no files', () => {
    it('should return empty result when no files found', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      // Mock internxt service
      const mockService = {
        checkCLI: mock(() => Promise.resolve({
          installed: true,
          authenticated: true,
          version: '1.0.0'
        })),
        listFiles: mock(() => Promise.resolve({
          success: true,
          files: []
        }))
      };
      
      (manager as any).internxtService = mockService;

      const result = await manager.restore();
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(0);
      expect(result.downloaded).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('restore - all files up to date', () => {
    it('should skip all files when they are up to date', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      // Create existing file with same size
      const testFile = path.join(mockLocalPath, 'test.txt');
      await fs.writeFile(testFile, 'test content'); // 12 bytes
      
      // Mock internxt service
      const mockService = {
        checkCLI: mock(() => Promise.resolve({
          installed: true,
          authenticated: true,
          version: '1.0.0'
        })),
        listFiles: mock(() => Promise.resolve({
          success: true,
          files: [{
            name: 'test.txt',
            path: '/Backups/Test/test.txt',
            size: 12, // Same size as local file
            isFolder: false
          }]
        }))
      };
      
      (manager as any).internxtService = mockService;

      const result = await manager.restore();
      
      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(1);
      expect(result.downloaded).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  describe('listRemoteFiles', () => {
    it('should handle empty remote directory', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      const mockService = {
        listFiles: mock(() => Promise.resolve({
          success: true,
          files: []
        }))
      };
      
      (manager as any).internxtService = mockService;

      // Access private method through type assertion
      const files = await (manager as any).listRemoteFiles('/');
      
      expect(files).toHaveLength(0);
    });

    it('should list flat file structure', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      const mockService = {
        listFiles: mock((path) => {
          if (path === '/') {
            return Promise.resolve({
              success: true,
              files: [
                { name: 'file1.txt', path: '/file1.txt', size: 100, isFolder: false },
                { name: 'file2.txt', path: '/file2.txt', size: 200, isFolder: false }
              ]
            });
          }
          return Promise.resolve({ success: true, files: [] });
        })
      };
      
      (manager as any).internxtService = mockService;

      const files = await (manager as any).listRemoteFiles('/');
      
      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('file1.txt');
      expect(files[1].name).toBe('file2.txt');
    });

    it('should recursively list nested directories', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      const mockService = {
        listFiles: mock((path) => {
          if (path === '/') {
            return Promise.resolve({
              success: true,
              files: [
                { name: 'docs', path: '/docs', size: 0, isFolder: true },
                { name: 'readme.txt', path: '/readme.txt', size: 50, isFolder: false }
              ]
            });
          } else if (path === '/docs') {
            return Promise.resolve({
              success: true,
              files: [
                { name: 'doc1.txt', path: '/docs/doc1.txt', size: 100, isFolder: false }
              ]
            });
          }
          return Promise.resolve({ success: true, files: [] });
        })
      };
      
      (manager as any).internxtService = mockService;

      const files = await (manager as any).listRemoteFiles('/');
      
      expect(files).toHaveLength(2);
      expect(files.some(f => f.name === 'readme.txt')).toBe(true);
      expect(files.some(f => f.name === 'doc1.txt')).toBe(true);
    });

    it('should handle listFiles failure gracefully', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      const mockService = {
        listFiles: mock(() => Promise.resolve({
          success: false,
          files: [],
          error: 'Permission denied'
        }))
      };
      
      (manager as any).internxtService = mockService;

      const files = await (manager as any).listRemoteFiles('/');
      
      expect(files).toHaveLength(0);
    });
  });

  describe('filterFilesToDownload', () => {
    it('should download all files when force is true', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath, { force: true });
      
      // Create existing file
      const testFile = path.join(mockLocalPath, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      
      const files = [
        { remotePath: '/remote/test.txt', localPath: testFile, size: 12, name: 'test.txt' }
      ];
      
      // Access private method
      const filesToDownload = await (manager as any).filterFilesToDownload(files);
      
      expect(filesToDownload).toHaveLength(1);
      expect(filesToDownload[0].name).toBe('test.txt');
    });

    it('should skip up-to-date files when force is false', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      // Create existing file with same size
      const testFile = path.join(mockLocalPath, 'test.txt');
      await fs.writeFile(testFile, 'test content'); // 12 bytes
      
      const files = [
        { remotePath: '/remote/test.txt', localPath: testFile, size: 12, name: 'test.txt' }
      ];
      
      const filesToDownload = await (manager as any).filterFilesToDownload(files);
      
      expect(filesToDownload).toHaveLength(0);
    });

    it('should download files with different size', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      // Create existing file with different size
      const testFile = path.join(mockLocalPath, 'test.txt');
      await fs.writeFile(testFile, 'test'); // 4 bytes
      
      const files = [
        { remotePath: '/remote/test.txt', localPath: testFile, size: 12, name: 'test.txt' }
      ];
      
      const filesToDownload = await (manager as any).filterFilesToDownload(files);
      
      expect(filesToDownload).toHaveLength(1);
    });
  });

  describe('downloadFiles', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      if (jest.isFakeTimers()) {
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });

    it('should download files successfully', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      const mockDownloader = {
        downloadFile: mock(() => Promise.resolve({
          success: true,
          filePath: '/local/file.txt'
        })),
        isFileUpToDate: mock(() => Promise.resolve(false))
      };
      
      (manager as any).downloader = mockDownloader;

      const filesToDownload = [
        { remotePath: '/remote/file1.txt', localPath: path.join(mockLocalPath, 'file1.txt'), size: 100, name: 'file1.txt' },
        { remotePath: '/remote/file2.txt', localPath: path.join(mockLocalPath, 'file2.txt'), size: 200, name: 'file2.txt' }
      ];

      // This will use FileUploadManager which has interval-based progress
      const result = await (manager as any).downloadFiles(filesToDownload, 2);
      
      expect(result.success).toBe(true);
      expect(result.downloaded).toBe(2);
    });

    it('should handle download failures', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath);
      
      const mockDownloader = {
        downloadFile: mock((remotePath) => {
          if (remotePath.includes('file1')) {
            return Promise.resolve({ success: true, filePath: '/local/file1.txt' });
          }
          return Promise.resolve({ success: false, filePath: '/local/file2.txt', error: 'Download failed' });
        }),
        isFileUpToDate: mock(() => Promise.resolve(false))
      };
      
      (manager as any).downloader = mockDownloader;

      const filesToDownload = [
        { remotePath: '/remote/file1.txt', localPath: path.join(mockLocalPath, 'file1.txt'), size: 100, name: 'file1.txt' },
        { remotePath: '/remote/file2.txt', localPath: path.join(mockLocalPath, 'file2.txt'), size: 200, name: 'file2.txt' }
      ];

      const result = await (manager as any).downloadFiles(filesToDownload, 2);
      
      expect(result.success).toBe(false);
      expect(result.downloaded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should respect cores option', async () => {
      const manager = new RestoreManager(mockRemotePath, mockLocalPath, { cores: 2 });
      
      let callCount = 0;
      const mockDownloader = {
        downloadFile: mock(() => {
          callCount++;
          return Promise.resolve({ success: true, filePath: '/local/file.txt' });
        }),
        isFileUpToDate: mock(() => Promise.resolve(false))
      };
      
      (manager as any).downloader = mockDownloader;

      const filesToDownload = [
        { remotePath: '/remote/file1.txt', localPath: path.join(mockLocalPath, 'file1.txt'), size: 100, name: 'file1.txt' },
        { remotePath: '/remote/file2.txt', localPath: path.join(mockLocalPath, 'file2.txt'), size: 200, name: 'file2.txt' },
        { remotePath: '/remote/file3.txt', localPath: path.join(mockLocalPath, 'file3.txt'), size: 300, name: 'file3.txt' }
      ];

      const result = await (manager as any).downloadFiles(filesToDownload, 3);
      
      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });
  });
});
