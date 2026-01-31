/**
 * Tests for InternxtService functional exports
 */

import { expect, describe, it } from 'bun:test';
import {
  initInternxtService,
  checkInternxtCLI,
  internxtUploadFile,
  internxtUploadFileWithProgress,
  internxtCreateFolder,
  internxtListFiles,
  internxtFileExists,
  internxtDeleteFile,
  internxtDownloadFile,
  internxtDownloadFileWithProgress
} from './internxt-service';
import { Verbosity } from '../../interfaces/logger';

describe('InternxtService', () => {
  describe('initialization', () => {
    it('should initialize with default verbosity', () => {
      initInternxtService();
      expect(typeof checkInternxtCLI).toBe('function');
    });

    it('should initialize with custom verbosity', () => {
      initInternxtService(Verbosity.Verbose);
      expect(typeof checkInternxtCLI).toBe('function');
    });

    it('should initialize with quiet verbosity', () => {
      initInternxtService(Verbosity.Quiet);
      expect(typeof checkInternxtCLI).toBe('function');
    });
  });

  describe('interface', () => {
    it('should export checkInternxtCLI function', () => {
      expect(typeof checkInternxtCLI).toBe('function');
    });

    it('should export internxtUploadFile function', () => {
      expect(typeof internxtUploadFile).toBe('function');
    });

    it('should export internxtUploadFileWithProgress function', () => {
      expect(typeof internxtUploadFileWithProgress).toBe('function');
    });

    it('should export internxtCreateFolder function', () => {
      expect(typeof internxtCreateFolder).toBe('function');
    });

    it('should export internxtListFiles function', () => {
      expect(typeof internxtListFiles).toBe('function');
    });

    it('should export internxtFileExists function', () => {
      expect(typeof internxtFileExists).toBe('function');
    });

    it('should export internxtDeleteFile function', () => {
      expect(typeof internxtDeleteFile).toBe('function');
    });

    it('should export internxtDownloadFile function', () => {
      expect(typeof internxtDownloadFile).toBe('function');
    });

    it('should export internxtDownloadFileWithProgress function', () => {
      expect(typeof internxtDownloadFileWithProgress).toBe('function');
    });
  });
});
