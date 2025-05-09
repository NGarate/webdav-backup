import { WebDAVConnectivityOptions, WebDAVServiceOptions, WebDAVClientOptions, UploadResult, DirectoryResult } from '../interfaces/webdav';
/**
 * File system utilities for the WebDAV Backup Tool
 * Handles file operations, checksums, and path manipulations
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

// Promisified functions
export const existsAsync = fs.promises.exists;
export const mkdirAsync = fs.promises.mkdir;
export const readFileAsync = fs.promises.readFile;
export const writeFileAsync = fs.promises.writeFile;

/**
 * URL encode path components
 * @param {string} pathToEncode - The path to encode
 * @returns {string} The URL encoded path
 */
export function urlEncodePath(pathToEncode) {
  // Replace backslashes with forward slashes before encoding
  const normalizedPath = pathToEncode.replace(/\\/g, '/');
  
  // Split by forward slash and encode each component
  return normalizedPath.split('/').map(component => 
    encodeURIComponent(component)
  ).join('/');
}

/**
 * Calculate MD5 checksum for a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} The MD5 checksum
 */
export async function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (error) => reject(error));
  });
}

/**
 * Save data to a JSON file
 * @param {string} filePath - The path to the file
 * @param {Object} data - The data to save
 */
export async function saveJsonToFile(filePath, data) {
  try {
    await writeFileAsync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving JSON to ${filePath}:`, error);
    return false;
  }
}

/**
 * Load data from a JSON file
 * @param {string} filePath - The path to the file
 * @param {Object} defaultValue - The default value to return if the file doesn't exist
 * @returns {Object} The parsed JSON data or the default value
 */
export async function loadJsonFromFile(filePath, defaultValue = {}) {
  try {
    if (await existsAsync(filePath)) {
      const data = await readFileAsync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error loading JSON from ${filePath}:`, error);
    return defaultValue;
  }
} 