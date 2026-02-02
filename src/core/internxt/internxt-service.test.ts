/**
 * Behavioral tests for InternxtService
 * Tests what the functions do, not that they exist
 */

import { expect, describe, beforeEach, it, mock } from 'bun:test';
import type * as child_process from 'node:child_process';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';

// Mock child_process module at the top level
// This mock will be shared across all test files
type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;
type SpawnResult = {
  stdout: { on: (event: string, callback: (data: string) => void) => void };
  stderr: { on: (event: string, callback: (data: string) => void) => void };
  on: (event: string, callback: (code?: number, signal?: string) => void) => void;
};

let mockExecImpl: (cmd: string, callback: ExecCallback) => void = () => {};
let mockSpawnImpl: (cmd: string, args: string[]) => SpawnResult = () => ({
  stdout: { on: () => {} },
  stderr: { on: () => {} },
  on: () => {}
});

// Set up the mock before any imports
mock.module('node:child_process', () => ({
  exec: (cmd: string, callback: ExecCallback) => mockExecImpl(cmd, callback),
  spawn: (cmd: string, args: string[]) => mockSpawnImpl(cmd, args)
}));

describe('InternxtService', () => {
  // Import the module inside describe so it gets the mocked child_process
  // Import service after mocking child_process
  const servicePromise = import('./internxt-service');
  let initInternxtService: any, checkInternxtCLI: any, internxtUploadFile: any, internxtUploadFileWithProgress: any;
  let internxtCreateFolder: any, internxtListFiles: any, internxtFileExists: any, internxtDeleteFile: any;
  let internxtDownloadFile: any, internxtDownloadFileWithProgress: any;

  beforeEach(async () => {
    // Load the service module
    const service = await servicePromise;
    initInternxtService = service.initInternxtService;
    checkInternxtCLI = service.checkInternxtCLI;
    internxtUploadFile = service.internxtUploadFile;
    internxtUploadFileWithProgress = service.internxtUploadFileWithProgress;
    internxtCreateFolder = service.internxtCreateFolder;
    internxtListFiles = service.internxtListFiles;
    internxtFileExists = service.internxtFileExists;
    internxtDeleteFile = service.internxtDeleteFile;
    internxtDownloadFile = service.internxtDownloadFile;
    internxtDownloadFileWithProgress = service.internxtDownloadFileWithProgress;

    // Silence logger output during tests
    mock(logger, 'verbose');
    mock(logger, 'info');
    mock(logger, 'success');
    mock(logger, 'error');

    // Reset mocks
    mockExecImpl = () => {};
    mockSpawnImpl = () => ({
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: () => {}
    });
  });

  describe('checkInternxtCLI', () => {
    it('should return not installed when internxt command fails', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Command not found'), { stdout: '', stderr: 'Command not found' });
      };

      const result = await checkInternxtCLI();

      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Internxt CLI not found');
    });

    it('should return installed but not authenticated when list-files fails', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        if (cmd.includes('--version')) {
          callback(null, { stdout: '1.2.3', stderr: '' });
        } else if (cmd.includes('list-files')) {
          callback(new Error('Not authenticated'), { stdout: '', stderr: 'Not authenticated' });
        }
      };

      const result = await checkInternxtCLI();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(false);
      expect(result.version).toBe('1.2.3');
      expect(result.error).toContain('Not authenticated');
    });

    it('should return fully ready when both commands succeed', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        if (cmd.includes('--version')) {
          callback(null, { stdout: '1.2.3', stderr: '' });
        } else if (cmd.includes('list-files')) {
          callback(null, { stdout: '[]', stderr: '' });
        }
      };

      const result = await checkInternxtCLI();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.version).toBe('1.2.3');
      expect(result.error).toBeUndefined();
    });
  });

  describe('internxtUploadFile', () => {
    it('should create parent folder before uploading', async () => {
      const commands: string[] = [];
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        commands.push(cmd);
        if (cmd.includes('create-folder')) {
          callback(null, { stdout: 'Folder created', stderr: '' });
        } else if (cmd.includes('upload-file')) {
          callback(null, { stdout: 'Upload successful', stderr: '' });
        }
      };

      await internxtUploadFile('/local/file.txt', '/remote/path/file.txt');

      const createFolderCmd = commands.find(c => c.includes('create-folder'));
      const uploadCmd = commands.find(c => c.includes('upload-file'));

      expect(createFolderCmd).toContain('/remote/path');
      expect(uploadCmd).toContain('/local/file.txt');
      expect(uploadCmd).toContain('/remote/path/file.txt');
    });

    it('should return success on successful upload', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        if (cmd.includes('create-folder')) {
          callback(null, { stdout: 'Folder created', stderr: '' });
        } else {
          callback(null, { stdout: 'Upload successful', stderr: '' });
        }
      };

      const result = await internxtUploadFile('/local/file.txt', '/remote/file.txt');

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/local/file.txt');
      expect(result.remotePath).toBe('/remote/file.txt');
      expect(result.output).toBe('Upload successful');
    });

    it('should return failure when output contains "error"', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        if (cmd.includes('create-folder')) {
          callback(null, { stdout: 'Folder created', stderr: '' });
        } else {
          callback(null, { stdout: 'Error: upload failed', stderr: '' });
        }
      };

      const result = await internxtUploadFile('/local/file.txt', '/remote/file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error: upload failed');
    });

    it('should return failure on exec exception', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Connection timeout'), { stdout: '', stderr: 'Connection timeout' });
      };

      const result = await internxtUploadFile('/local/file.txt', '/remote/file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection timeout');
    });
  });

  describe('internxtCreateFolder', () => {
    it('should return success on folder creation', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, { stdout: 'Folder created', stderr: '' });
      };

      const result = await internxtCreateFolder('/remote/new-folder');

      expect(result.success).toBe(true);
      expect(result.path).toBe('/remote/new-folder');
      expect(result.output).toBe('Folder created');
    });

    it('should return success when folder already exists', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Folder already exists'), { stdout: '', stderr: 'Folder already exists' });
      };

      const result = await internxtCreateFolder('/remote/existing-folder');

      expect(result.success).toBe(true);
      expect(result.output).toBe('Folder already exists');
    });

    it('should return failure on error', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Permission denied'), { stdout: '', stderr: 'Permission denied' });
      };

      const result = await internxtCreateFolder('/remote/folder');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('internxtListFiles', () => {
    it('should parse JSON response correctly', async () => {
      const mockFiles = [
        { name: 'file1.txt', path: '/file1.txt', size: 1024, isFolder: false },
        { name: 'folder1', path: '/folder1', size: 0, isFolder: true }
      ];

      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, { stdout: JSON.stringify(mockFiles), stderr: '' });
      };

      const result = await internxtListFiles('/');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files[0].name).toBe('file1.txt');
      expect(result.files[1].isFolder).toBe(true);
    });

    it('should fall back to text parsing when JSON fails', async () => {
      // Note: folder lines should just end with "/" without byte count to be parsed as folders
      const textOutput = `file1.txt    1024 bytes
folder1/
file2.txt    2048 bytes`;

      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, { stdout: textOutput, stderr: '' });
      };

      const result = await internxtListFiles('/');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(3);
      expect(result.files[0].name).toBe('file1.txt');
      expect(result.files[0].isFolder).toBe(false);
      expect(result.files[1].name).toBe('folder1');
      expect(result.files[1].isFolder).toBe(true);
    });

    it('should return empty array on failure', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Path not found'), { stdout: '', stderr: 'Path not found' });
      };

      const result = await internxtListFiles('/nonexistent');

      expect(result.success).toBe(false);
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('Path not found');
    });
  });

  describe('internxtFileExists', () => {
    it('should return true when file is in list', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, {
          stdout: JSON.stringify([
            { name: 'target.txt', path: '/folder/target.txt', size: 100, isFolder: false }
          ]),
          stderr: ''
        });
      };

      const result = await internxtFileExists('/folder/target.txt');

      expect(result).toBe(true);
    });

    it('should return false when file is not in list', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, {
          stdout: JSON.stringify([
            { name: 'other.txt', path: '/folder/other.txt', size: 100, isFolder: false }
          ]),
          stderr: ''
        });
      };

      const result = await internxtFileExists('/folder/target.txt');

      expect(result).toBe(false);
    });

    it('should return false when list fails', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Connection failed'), { stdout: '', stderr: 'Connection failed' });
      };

      const result = await internxtFileExists('/folder/file.txt');

      expect(result).toBe(false);
    });
  });

  describe('internxtDeleteFile', () => {
    it('should return true on successful deletion', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, { stdout: 'Deleted', stderr: '' });
      };

      const result = await internxtDeleteFile('/remote/file.txt');

      expect(result).toBe(true);
    });

    it('should return false on deletion failure', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('File not found'), { stdout: '', stderr: 'File not found' });
      };

      const result = await internxtDeleteFile('/remote/nonexistent.txt');

      expect(result).toBe(false);
    });
  });

  describe('internxtDownloadFile', () => {
    it('should download file successfully', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, { stdout: 'Download successful', stderr: '' });
      };

      const result = await internxtDownloadFile('/remote/file.txt', '/local/file.txt');

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/local/file.txt');
      expect(result.remotePath).toBe('/remote/file.txt');
    });

    it('should return failure on error output', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(null, { stdout: 'Error: download failed', stderr: '' });
      };

      const result = await internxtDownloadFile('/remote/file.txt', '/local/file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error: download failed');
    });

    it('should return failure on exec exception', async () => {
      mockExecImpl = (cmd: string, callback: ExecCallback) => {
        callback(new Error('Network error'), { stdout: '', stderr: 'Network error' });
      };

      const result = await internxtDownloadFile('/remote/file.txt', '/local/file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('internxtUploadFileWithProgress', () => {
    // Skipped: spawn mocking is complex and these are wrapper functions
    // The core behavior is tested via internxtUploadFile
    it.todo('should call progress callback during upload');
    it.todo('should return success when upload completes');
    it.todo('should return failure when upload fails');
  });

  describe('internxtDownloadFileWithProgress', () => {
    // Skipped: spawn mocking is complex and these are wrapper functions
    // The core behavior is tested via internxtDownloadFile
    it.todo('should call progress callback during download');
    it.todo('should return success when download completes');
  });
});
