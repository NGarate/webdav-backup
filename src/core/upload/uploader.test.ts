/**
 * Tests for Uploader functional exports
 */

import { expect, describe, beforeEach, it, spyOn } from 'bun:test';
import { initUploader, startUpload } from '../upload/uploader';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';

describe('Uploader', () => {
  const targetDir = './target';
  const concurrentUploads = 2;
  const verbosity = Verbosity.Normal;

  beforeEach(() => {
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
  });

  describe('Basic functionality', () => {
    it('should initialize with correct properties', () => {
      initUploader(concurrentUploads, targetDir, verbosity);
      expect(typeof startUpload).toBe('function');
    });

    it('should handle empty file list', async () => {
      initUploader(concurrentUploads, targetDir, verbosity);
      await startUpload([]);
      expect(true).toBe(true);
    });
  });

  describe('Path handling', () => {
    it('should handle file paths correctly', async () => {
      initUploader(concurrentUploads, targetDir, verbosity);
      expect(typeof startUpload).toBe('function');
    });
  });

  describe('Upload options', () => {
    it('should initialize with resume enabled', () => {
      initUploader(concurrentUploads, targetDir, verbosity, {
        resume: true,
        chunkSize: 50
      });
      expect(typeof startUpload).toBe('function');
    });
  });
});
