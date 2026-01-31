/**
 * Tests for RestoreDownloader functional exports
 */

import { expect, describe, it, beforeEach, spyOn } from 'bun:test';
import {
  initRestoreDownloader,
  downloadFile,
  isFileUpToDate
} from './downloader';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('RestoreDownloader', () => {
  beforeEach(() => {
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
    initRestoreDownloader();
  });

  describe('initialization', () => {
    it('should initialize with default verbosity', () => {
      initRestoreDownloader();
      expect(typeof downloadFile).toBe('function');
      expect(typeof isFileUpToDate).toBe('function');
    });

    it('should initialize with custom verbosity', () => {
      initRestoreDownloader(Verbosity.Verbose);
      expect(typeof downloadFile).toBe('function');
    });

    it('should initialize with quiet verbosity', () => {
      initRestoreDownloader(Verbosity.Quiet);
      expect(typeof downloadFile).toBe('function');
    });
  });

  describe('downloadFile', () => {
    it('should have downloadFile function', () => {
      expect(typeof downloadFile).toBe('function');
    });
  });

  describe('isFileUpToDate', () => {
    it('should have isFileUpToDate function', () => {
      expect(typeof isFileUpToDate).toBe('function');
    });

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
