/**
 * Tests for HashCache functional exports
 */

import { expect, describe, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  initHashCache,
  loadHashCache,
  saveHashCache,
  hashCacheHasChanged,
  updateHashCache,
  hashCacheSize,
  clearHashCache
} from './hash-cache';
import { Verbosity } from '../../interfaces/logger';
import * as logger from '../../utils/logger';
import fs from 'fs';
import crypto from 'crypto';

// Mock fs module
const mockFs = {
  existsSync: mock((_path: string) => true),
  createReadStream: mock((_path: string) => {
    const mockStream = {
      on: (event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          callback(Buffer.from('mock file content'));
        }
        if (event === 'end') {
          callback();
        }
        return mockStream;
      }
    };
    return mockStream;
  })
};

// Mock crypto module
const mockCrypto = {
  createHash: mock((): {
    update: (data: string | Buffer) => { digest: () => string };
    digest: () => string;
  } => {
    return {
      update: mock(function(this: { digest: () => string }, _data: string | Buffer) { return this; }),
      digest: mock(() => 'mock-hash-value')
    };
  })
};

describe('HashCache', () => {
  let loggerSpy;
  let fsExistsSyncSpy;
  let fsCreateReadStreamSpy;
  let originalCreateHash;
  const testCachePath = '/test/path.json';
  
  beforeEach(() => {
    // Reset module state
    clearHashCache();
    initHashCache(testCachePath, Verbosity.Verbose);
    
    // Spy on logger to avoid console output during tests
    loggerSpy = spyOn(logger, 'verbose').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
    
    // Mock fs module
    fsExistsSyncSpy = spyOn(fs, 'existsSync').mockImplementation(mockFs.existsSync);
    fsCreateReadStreamSpy = spyOn(fs, 'createReadStream').mockImplementation(mockFs.createReadStream);
    
    // Mock crypto module
    originalCreateHash = crypto.createHash;
    spyOn(crypto, 'createHash').mockImplementation(mockCrypto.createHash);
  });
  
  afterEach(() => {
    // Restore original implementations
    loggerSpy.mockRestore();
    fsExistsSyncSpy.mockRestore();
    fsCreateReadStreamSpy.mockRestore();
    crypto.createHash = originalCreateHash;
  });
  
  describe('Basic functionality', () => {
    it('should initialize with the provided parameters', () => {
      initHashCache('/new/path.json', Verbosity.Normal);
      expect(hashCacheSize()).toBe(0);
    });
    
    it('should use default verbosity when not provided', () => {
      initHashCache('/test/path.json');
      expect(hashCacheSize()).toBe(0);
    });
  });
  
  describe('Cache operations', () => {
    it('should update a hash in the cache', () => {
      const filePath = '/test/file.txt';
      
      updateHashCache(filePath, 'test-hash-value');
      
      expect(hashCacheSize()).toBe(1);
    });
    
    it('should return the correct cache size', () => {
      expect(hashCacheSize()).toBe(0);
      
      updateHashCache('file1.txt', 'hash1');
      updateHashCache('file2.txt', 'hash2');
      
      expect(hashCacheSize()).toBe(2);
    });
    
    it('should clear the cache', () => {
      updateHashCache('file1.txt', 'hash1');
      updateHashCache('file2.txt', 'hash2');
      expect(hashCacheSize()).toBe(2);
      
      clearHashCache();
      expect(hashCacheSize()).toBe(0);
    });
  });
  
  describe('File change detection', () => {
    it('should detect that a file has changed when hash differs', async () => {
      const filePath = '/test/file.txt';
      
      // Pre-populate the cache with a hash
      updateHashCache(filePath, 'old-hash');
      
      // Mock crypto to return a different hash
      let callCount = 0;
      spyOn(crypto, 'createHash').mockImplementation(() => ({
        update: function() { return this; },
        digest: () => {
          callCount++;
          return callCount === 1 ? 'new-hash' : 'old-hash';
        }
      } as any));
      
      const hasChanged = await hashCacheHasChanged(filePath);
      
      expect(hasChanged).toBe(true);
    });
    
    it('should detect that a file is unchanged when hash matches', async () => {
      const filePath = '/test/file.txt';
      const hash = 'same-hash';
      
      // Pre-populate the cache with a hash
      updateHashCache(filePath, hash);
      
      // Mock crypto to return the same hash
      spyOn(crypto, 'createHash').mockImplementation(() => ({
        update: function() { return this; },
        digest: () => hash
      } as any));
      
      const hasChanged = await hashCacheHasChanged(filePath);
      
      expect(hasChanged).toBe(false);
    });
    
    it('should treat new files as changed', async () => {
      const filePath = '/test/new-file.txt';
      
      // Mock crypto to return a hash
      spyOn(crypto, 'createHash').mockImplementation(() => ({
        update: function() { return this; },
        digest: () => 'new-file-hash'
      } as any));
      
      const hasChanged = await hashCacheHasChanged(filePath);
      
      expect(hasChanged).toBe(true);
      expect(hashCacheSize()).toBe(1);
    });
    
    it('should handle errors during change detection gracefully', async () => {
      // Mock fs.createReadStream to throw an error
      fsCreateReadStreamSpy.mockRestore();
      spyOn(fs, 'createReadStream').mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const hasChanged = await hashCacheHasChanged('/test/file.txt');
      
      // Should assume file has changed if an error occurs
      expect(hasChanged).toBe(true);
    });
  });
});
