/**
 * HashCache - Functional exports with closure-based state
 * Handles the caching of file hashes to detect changes
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Verbosity, verbose as logVerbose, error as logError } from "../../utils/logger.js";
import { normalizePath } from "../../utils/path.js";

let _cache = new Map<string, string>();
let _cachePath = "";
let _verbosity = Verbosity.Normal;

export const initHashCache = (cachePath: string, verbosity: number = Verbosity.Normal): void => {
  _cachePath = cachePath;
  _verbosity = verbosity;
};

export const loadHashCache = async (): Promise<boolean> => {
  try {
    if (fs.existsSync(_cachePath)) {
      const file = Bun.file(_cachePath);
      const data = await file.text();
      const parsed: Record<string, string> = JSON.parse(data);
      _cache = new Map(Object.entries(parsed));
      logVerbose(`Loaded hash cache from ${_cachePath}`, _verbosity);
      return true;
    }
    return false;
  } catch (error) {
    logError(`Error loading hash cache: ${error}`);
    return false;
  }
};

export const saveHashCache = async (): Promise<boolean> => {
  try {
    const cacheData = Object.fromEntries(_cache);
    await Bun.write(_cachePath, JSON.stringify(cacheData, null, 2));
    logVerbose(`Saved hash cache to ${_cachePath}`, _verbosity);
    return true;
  } catch (error) {
    logVerbose(`Error saving hash cache: ${error}`, _verbosity);
    return false;
  }
};

const calculateFileHash = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
};

export const hashCacheHasChanged = async (filePath: string): Promise<boolean> => {
  try {
    const normalizedPath = normalizePath(filePath);
    const currentHash = await calculateFileHash(normalizedPath);
    const storedHash = _cache.get(normalizedPath);

    if (!storedHash) {
      logVerbose(`No cached hash for ${normalizedPath}, marking as changed`, _verbosity);
      _cache.set(normalizedPath, currentHash);
      await saveHashCache();
      return true;
    }

    const hasChanged = currentHash !== storedHash;

    if (hasChanged) {
      logVerbose(`File hash changed for ${normalizedPath}`, _verbosity);
      _cache.set(normalizedPath, currentHash);
      await saveHashCache();
    } else {
      logVerbose(`File ${normalizedPath} unchanged (hash match)`, _verbosity);
    }

    return hasChanged;
  } catch (error) {
    logError(`Error checking file changes: ${error}`);
    return true;
  }
};

export const updateHashCache = (filePath: string, hash: string): void => {
  const normalizedPath = normalizePath(filePath);
  _cache.set(normalizedPath, hash);
};

export const hashCacheSize = (): number => _cache.size;

export const clearHashCache = (): void => {
  _cache.clear();
};
