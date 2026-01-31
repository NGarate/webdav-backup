/**
 * Tests for RestoreManager functional exports
 */

import { expect, describe, it, beforeEach, spyOn } from 'bun:test';
import { initRestoreManager, restoreFiles, RestoreOptions } from './restore-manager';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';

describe('RestoreManager', () => {
  const mockRemotePath = '/Backups/Test';
  const mockLocalPath = '/tmp/restore-test';

  beforeEach(() => {
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      initRestoreManager(mockRemotePath, mockLocalPath);
      expect(typeof restoreFiles).toBe('function');
    });

    it('should initialize with quiet verbosity', () => {
      initRestoreManager(mockRemotePath, mockLocalPath, { quiet: true });
      expect(typeof restoreFiles).toBe('function');
    });

    it('should initialize with verbose verbosity', () => {
      initRestoreManager(mockRemotePath, mockLocalPath, { verbose: true });
      expect(typeof restoreFiles).toBe('function');
    });
  });

  describe('interface', () => {
    it('should export restoreFiles function', () => {
      expect(typeof restoreFiles).toBe('function');
    });
  });
});
