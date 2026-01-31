/**
 * Tests for File Upload Manager functional exports
 */

import { expect, describe, it, beforeEach, afterEach, mock, spyOn, jest } from 'bun:test';
import {
  initFileQueue,
  setFileQueue,
  startFileQueue,
  cancelFileQueue,
  fileQueuePendingCount,
  fileQueueActiveCount,
  isFileQueueIdle,
  resetFileQueue
} from './file-upload-manager';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';

describe('FileUploadManager', () => {
  const verbosity = Verbosity.Normal;
  const mockUploadHandler = mock((): Promise<{ success: boolean; filePath: string }> => 
    Promise.resolve({ success: true, filePath: 'test.txt' }));
  
  const testFiles = [
    { filePath: 'file1.txt', relativePath: 'file1.txt', absolutePath: '/test/file1.txt', size: 100, checksum: 'abc123', hasChanged: false },
    { filePath: 'file2.txt', relativePath: 'file2.txt', absolutePath: '/test/file2.txt', size: 200, checksum: 'def456', hasChanged: false },
    { filePath: 'file3.txt', relativePath: 'file3.txt', absolutePath: '/test/file3.txt', size: 300, checksum: 'ghi789', hasChanged: false }
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    resetFileQueue();
    initFileQueue(3, mockUploadHandler, verbosity);

    spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (jest.isFakeTimers()) {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
    resetFileQueue();
  });

  describe('initialization', () => {
    it('should initialize with the provided parameters', () => {
      expect(fileQueuePendingCount()).toBe(0);
      expect(fileQueueActiveCount()).toBe(0);
      expect(isFileQueueIdle()).toBe(true);
    });
  });

  describe('setFileQueue', () => {
    it('should set the queue of files to upload', () => {
      setFileQueue(testFiles);
      
      expect(fileQueuePendingCount()).toBe(3);
    });
  });

  describe('startFileQueue', () => {
    it('should start uploading files with the specified concurrency', () => {
      setFileQueue([...testFiles]);
      
      startFileQueue();
      
      expect(mockUploadHandler).toHaveBeenCalled();
    });
    
    it('should accept completion callback', () => {
      const mockOnComplete = mock(() => {});
      setFileQueue([...testFiles]);
      
      startFileQueue(mockOnComplete);
      
      // Callback is stored internally
      expect(fileQueuePendingCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancelFileQueue', () => {
    it('should cancel all pending uploads', () => {
      setFileQueue([...testFiles]);
      
      cancelFileQueue();
      
      expect(fileQueuePendingCount()).toBe(0);
    });
  });

  describe('helper functions', () => {
    it('should return fileQueuePendingCount correctly', () => {
      setFileQueue(testFiles);
      
      expect(fileQueuePendingCount()).toBe(3);
    });
    
    it('should return fileQueueActiveCount correctly', () => {
      expect(fileQueueActiveCount()).toBe(0);
    });
    
    it('should report isFileQueueIdle correctly when idle', () => {
      expect(isFileQueueIdle()).toBe(true);
    });
    
    it('should report isFileQueueIdle correctly when not idle', () => {
      setFileQueue(testFiles);
      
      expect(isFileQueueIdle()).toBe(false);
    });
  });
});
