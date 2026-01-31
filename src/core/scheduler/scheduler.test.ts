/**
 * Tests for BackupScheduler functional exports
 */

import { expect, describe, it } from 'bun:test';
import {
  initBackupScheduler,
  runBackupOnce,
  stopBackupJob,
  stopAllBackupJobs,
  getBackupJobInfo,
  scheduleDelayedBackup,
  startBackupDaemon,
  BackupConfig
} from './scheduler';
import { Verbosity } from '../../interfaces/logger';

describe('BackupScheduler', () => {
  describe('initialization', () => {
    it('should initialize with default options', () => {
      initBackupScheduler();
      expect(typeof startBackupDaemon).toBe('function');
    });

    it('should initialize with custom verbosity', () => {
      initBackupScheduler(Verbosity.Verbose);
      expect(typeof startBackupDaemon).toBe('function');
    });
  });

  describe('interface', () => {
    it('should export startBackupDaemon function', () => {
      expect(typeof startBackupDaemon).toBe('function');
    });

    it('should export runBackupOnce function', () => {
      expect(typeof runBackupOnce).toBe('function');
    });

    it('should export stopBackupJob function', () => {
      expect(typeof stopBackupJob).toBe('function');
    });

    it('should export stopAllBackupJobs function', () => {
      expect(typeof stopAllBackupJobs).toBe('function');
    });

    it('should export getBackupJobInfo function', () => {
      expect(typeof getBackupJobInfo).toBe('function');
    });

    it('should export scheduleDelayedBackup function', () => {
      expect(typeof scheduleDelayedBackup).toBe('function');
    });
  });

  describe('BackupConfig interface', () => {
    it('should support all config options', () => {
      const config: BackupConfig = {
        sourceDir: '/test',
        schedule: '0 2 * * *',
        syncOptions: {
          target: '/backup',
          cores: 4,
          verbose: true
        }
      };

      expect(config.sourceDir).toBe('/test');
      expect(config.schedule).toBe('0 2 * * *');
      expect(config.syncOptions.target).toBe('/backup');
    });
  });
});
