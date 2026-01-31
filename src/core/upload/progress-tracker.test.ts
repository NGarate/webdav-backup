/**
 * Tests for Progress Tracker functional exports
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn, jest } from 'bun:test';
import {
  initProgressTracker,
  recordProgressSuccess,
  recordProgressFailure,
  startProgressUpdates,
  stopProgressUpdates,
  getProgressPercentage,
  isProgressComplete,
  displayProgressSummary,
  resetProgressTracker
} from './progress-tracker';
import * as logger from '../../utils/logger';

describe('ProgressTracker', () => {
  const originalStdoutWrite = process.stdout.write;
  let loggerSpy;
  
  beforeEach(() => {
    jest.useFakeTimers();
    process.stdout.write = mock(() => {});
    loggerSpy = spyOn(logger, 'always').mockImplementation(() => {});
    resetProgressTracker();
  });
  
  afterEach(() => {
    if (jest.isFakeTimers()) {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
    process.stdout.write = originalStdoutWrite;
    loggerSpy.mockRestore();
    resetProgressTracker();
  });
  
  describe('Basic functionality', () => {
    it('should initialize with default values', () => {
      initProgressTracker(0);
      expect(getProgressPercentage()).toBe(0);
    });
  });
  
  describe('Configuration', () => {
    it('should initialize with the provided total files', () => {
      initProgressTracker(10);
      expect(getProgressPercentage()).toBe(0);
    });
  });
  
  describe('Progress tracking', () => {
    it('should increment counters correctly', () => {
      initProgressTracker(10);
      
      recordProgressSuccess();
      expect(getProgressPercentage()).toBe(10);
      
      recordProgressFailure();
      expect(getProgressPercentage()).toBe(20);
    });
    
    it('should calculate progress correctly', () => {
      initProgressTracker(10);
      
      for (let i = 0; i < 7; i++) {
        recordProgressSuccess();
      }
      
      expect(getProgressPercentage()).toBe(70);
    });
    
    it('should determine completion status correctly', () => {
      initProgressTracker(10);
      
      expect(isProgressComplete()).toBe(false);
      
      for (let i = 0; i < 8; i++) {
        recordProgressSuccess();
      }
      for (let i = 0; i < 2; i++) {
        recordProgressFailure();
      }
      
      expect(isProgressComplete()).toBe(true);
    });
  });
  
  describe('Progress updates', () => {
    it('should start and stop progress updates', () => {
      initProgressTracker(10);

      startProgressUpdates(250);
      
      jest.advanceTimersByTime(250);
      jest.advanceTimersByTime(250);

      stopProgressUpdates();
    });
  });
});
