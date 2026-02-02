/**
 * Behavioral tests for BackupScheduler
 * Tests what the functions do, not that they exist
 */

import { expect, describe, beforeEach, it, spyOn, mock } from 'bun:test';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';

// Mock file-sync module
const mockSyncFiles = mock((sourceDir: string, options: any) => Promise.resolve());

mock.module('../../file-sync.js', () => ({
  syncFiles: mockSyncFiles
}));

// Import scheduler after mocking
import type { BackupConfig } from './scheduler';
const {
  initBackupScheduler,
  runBackupOnce,
  stopBackupJob,
  stopAllBackupJobs,
  getBackupJobInfo,
  scheduleDelayedBackup,
  startBackupDaemon
} = await import('./scheduler');

describe('BackupScheduler', () => {
  beforeEach(() => {
    // Reset mocks
    mockSyncFiles.mockClear();
    
    // Silence logger output during tests
    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'success').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
    
    initBackupScheduler();
    stopAllBackupJobs(); // Clean up any running jobs
  });

  describe('runBackupOnce', () => {
    it('should call syncFiles with correct parameters', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: { target: '/backup', cores: 4 }
      };

      await runBackupOnce(config);

      expect(mockSyncFiles).toHaveBeenCalledWith('/test/source', { target: '/backup', cores: 4 });
    });

    it('should log success on completion', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: {}
      };
      
      const successSpy = spyOn(logger, 'success');

      await runBackupOnce(config);

      expect(successSpy).toHaveBeenCalled();
    });

    it('should log error and rethrow on failure', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: {}
      };
      
      // Reset mock for this test
      mockSyncFiles.mockImplementationOnce(() => 
        Promise.reject(new Error('Sync failed'))
      );
      
      const errorSpy = spyOn(logger, 'error');

      await expect(runBackupOnce(config)).rejects.toThrow('Sync failed');

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('scheduleDelayedBackup', () => {
    it('should delay then run backup', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: {}
      };

      // Use a short delay for testing
      const delayPromise = scheduleDelayedBackup(config, 50);
      
      // syncFiles should not be called immediately
      expect(mockSyncFiles).not.toHaveBeenCalled();
      
      // Wait for the delay
      await delayPromise;
      
      // Now syncFiles should be called
      expect(mockSyncFiles).toHaveBeenCalledWith('/test/source', {});
    });

    it('should log scheduling message', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: {}
      };

      const infoSpy = spyOn(logger, 'info');

      // Start the delayed backup but don't await yet
      const promise = scheduleDelayedBackup(config, 100);

      // Check immediately that scheduling message was logged
      const calls = infoSpy.mock.calls.map(c => c[0]);
      expect(calls.some(msg => msg.includes('Scheduling backup'))).toBe(true);

      // Now await completion
      await promise;
    });
  });

  describe('stopBackupJob', () => {
    it('should return false when job does not exist', () => {
      const result = stopBackupJob('nonexistent-job');
      
      expect(result).toBe(false);
    });
  });

  describe('getBackupJobInfo', () => {
    it('should return empty array when no jobs', () => {
      const result = getBackupJobInfo();
      
      expect(result).toEqual([]);
    });
  });

  describe('startBackupDaemon', () => {
    it('should throw on invalid cron expression', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: 'invalid-cron',
        syncOptions: {}
      };

      await expect(startBackupDaemon(config)).rejects.toThrow('Invalid cron expression');
    });

    it('should run initial backup immediately', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: { target: '/backup' }
      };
      
      // Start daemon but don't await forever
      const daemonPromise = startBackupDaemon(config);
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Initial backup should have been called
      expect(mockSyncFiles).toHaveBeenCalledWith('/test/source', { target: '/backup' });
      
      // Clean up
      stopAllBackupJobs();
    });

    it('should log daemon startup information', async () => {
      const config: BackupConfig = {
        sourceDir: '/test/source',
        schedule: '0 2 * * *',
        syncOptions: { target: '/backup' }
      };
      
      const infoSpy = spyOn(logger, 'info');
      
      // Start daemon but don't await forever
      const daemonPromise = startBackupDaemon(config);
      
      // Give it a moment to log
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should log schedule and source
      const calls = infoSpy.mock.calls.map(c => c[0]);
      expect(calls.some(msg => msg.includes('schedule'))).toBe(true);
      expect(calls.some(msg => msg.includes('/test/source'))).toBe(true);
      
      // Clean up
      stopAllBackupJobs();
    });
  });

  describe('stopAllBackupJobs', () => {
    it('should clear all jobs without error when no jobs exist', () => {
      expect(() => stopAllBackupJobs()).not.toThrow();
    });
  });

  describe('initBackupScheduler', () => {
    it('should initialize with default verbosity', () => {
      expect(() => initBackupScheduler()).not.toThrow();
    });

    it('should initialize with custom verbosity', () => {
      expect(() => initBackupScheduler(Verbosity.Verbose)).not.toThrow();
    });

    it('should initialize with quiet verbosity', () => {
      expect(() => initBackupScheduler(Verbosity.Quiet)).not.toThrow();
    });
  });
});
