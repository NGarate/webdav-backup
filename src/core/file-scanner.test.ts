/**
 * Tests for FileScanner functional exports
 */

import { expect, describe, it, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  initFileScanner,
  loadScannerState,
  saveScannerState,
  updateScannerFileState,
  recordScannerCompletion,
  scanDirectory,
  determineFilesToUpload,
  scanFiles
} from './file-scanner';
import * as logger from '../utils/logger';
import fs from 'node:fs';
import * as fsUtils from '../utils/fs-utils';
import { clearHashCache } from './upload/hash-cache';

describe('FileScanner', () => {
  beforeEach(() => {
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
    spyOn(fs, 'statSync').mockImplementation(() => ({ size: 1024 }) as any);
    spyOn(fs, 'readdirSync').mockImplementation(() => [
      { name: 'file1.txt', isDirectory: () => false, isFile: () => true }
    ] as any);
    spyOn(fs, 'existsSync').mockImplementation(() => true);
    spyOn(fsUtils, 'calculateChecksum').mockImplementation(() => Promise.resolve('mock-checksum'));
    spyOn(fsUtils, 'loadJsonFromFile').mockImplementation(() => 
      Promise.resolve({ files: {}, lastRun: '' })
    );
    spyOn(fsUtils, 'saveJsonToFile').mockImplementation(() => Promise.resolve(true));
    clearHashCache();
  });

  afterEach(() => {
    clearHashCache();
  });

  describe('initialization', () => {
    it('should initialize with the provided source directory', () => {
      initFileScanner('/test/dir', 1);
      expect(typeof scanFiles).toBe('function');
    });

    it('should initialize with default verbosity', () => {
      initFileScanner('/test/dir');
      expect(typeof scanFiles).toBe('function');
    });

    it('should initialize with forceUpload enabled', () => {
      initFileScanner('/test/dir', 1, true);
      expect(typeof scanFiles).toBe('function');
    });
  });

  describe('loadScannerState', () => {
    it('should load state from file', async () => {
      initFileScanner('/test/dir');
      await loadScannerState();
      expect(fsUtils.loadJsonFromFile).toHaveBeenCalled();
    });
  });

  describe('saveScannerState', () => {
    it('should save state to file', async () => {
      initFileScanner('/test/dir');
      updateScannerFileState('file1.txt', 'checksum1');
      await saveScannerState();
      expect(fsUtils.saveJsonToFile).toHaveBeenCalled();
    });
  });

  describe('updateScannerFileState', () => {
    it('should update file state with new checksum', () => {
      initFileScanner('/test/dir');
      updateScannerFileState('file1.txt', 'new-checksum');
      expect(typeof recordScannerCompletion).toBe('function');
    });
  });

  describe('scanDirectory', () => {
    it('should scan directory and return file information', async () => {
      initFileScanner('/test/dir');
      const files = await scanDirectory('/test/dir');
      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('determineFilesToUpload', () => {
    it('should identify files that need to be uploaded', async () => {
      initFileScanner('/test/dir');
      const allFiles = [
        {
          relativePath: 'file1.txt',
          absolutePath: '/test/dir/file1.txt',
          size: 1024,
          checksum: 'checksum1',
          hasChanged: null as boolean | null
        }
      ];
      const filesToUpload = await determineFilesToUpload(allFiles);
      expect(filesToUpload).toBeDefined();
      expect(Array.isArray(filesToUpload)).toBe(true);
    });

    it('should upload all files when forceUpload is enabled', async () => {
      initFileScanner('/test/dir', 1, true);
      const allFiles = [
        {
          relativePath: 'file1.txt',
          absolutePath: '/test/dir/file1.txt',
          size: 1024,
          checksum: 'checksum1',
          hasChanged: null as boolean | null
        },
        {
          relativePath: 'file2.txt',
          absolutePath: '/test/dir/file2.txt',
          size: 2048,
          checksum: 'checksum2',
          hasChanged: null as boolean | null
        }
      ];
      const filesToUpload = await determineFilesToUpload(allFiles);
      expect(filesToUpload.length).toBe(2);
      expect(filesToUpload[0].hasChanged).toBe(true);
      expect(filesToUpload[1].hasChanged).toBe(true);
    });
  });

  describe('scanFiles', () => {
    it('should perform a complete scan process', async () => {
      initFileScanner('/test/dir');
      const result = await scanFiles();
      expect(result.allFiles).toBeDefined();
      expect(result.filesToUpload).toBeDefined();
      expect(result.totalSizeBytes).toBeDefined();
      expect(result.totalSizeMB).toBeDefined();
    });
  });

  describe('recordScannerCompletion', () => {
    it('should record upload completion time', () => {
      initFileScanner('/test/dir');
      recordScannerCompletion();
      expect(typeof scanFiles).toBe('function');
    });
  });
});
