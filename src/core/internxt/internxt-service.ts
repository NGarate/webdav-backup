/**
 * Internxt CLI Service - Functional exports
 * Wraps the Internxt CLI for backup operations
 */

import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import * as logger from "../../utils/logger.js";
import {
  InternxtCLICheckResult,
  InternxtUploadResult,
  InternxtFolderResult,
  InternxtListResult,
  InternxtFileInfo
} from "../../interfaces/internxt.js";

const execAsync = promisify(exec);

let _verbosity = logger.Verbosity.Normal;

export const initInternxtService = (verbosity: number = logger.Verbosity.Normal): void => {
  _verbosity = verbosity;
};

const log = (msg: string): void => logger.verbose(msg, _verbosity);

export const checkInternxtCLI = async (): Promise<InternxtCLICheckResult> => {
  try {
    const { stdout: versionOutput } = await execAsync("internxt --version").catch(() => ({ stdout: "" }));
    const version = versionOutput.trim();

    if (!version) {
      return {
        installed: false,
        authenticated: false,
        error: "Internxt CLI not found. Please install it with: npm install -g @internxt/cli"
      };
    }

    try {
      await execAsync("internxt list-files /");
      return { installed: true, authenticated: true, version };
    } catch {
      return {
        installed: true,
        authenticated: false,
        version,
        error: "Not authenticated. Please run: internxt login"
      };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      installed: false,
      authenticated: false,
      error: `Failed to check Internxt CLI: ${msg}`
    };
  }
};

export const internxtUploadFile = async (localPath: string, remotePath: string): Promise<InternxtUploadResult> => {
  try {
    log(`Uploading ${localPath} to ${remotePath}`);

    const lastSlashIndex = remotePath.lastIndexOf("/");
    if (lastSlashIndex > 0) {
      const folderPath = remotePath.substring(0, lastSlashIndex);
      await internxtCreateFolder(folderPath);
    }

    const { stdout, stderr } = await execAsync(`internxt upload-file "${localPath}" "${remotePath}"`);
    const output = stdout || stderr;

    if (output.toLowerCase().includes("error") || output.toLowerCase().includes("failed")) {
      return { success: false, filePath: localPath, remotePath, output, error: output };
    }

    return { success: true, filePath: localPath, remotePath, output };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, filePath: localPath, remotePath, error: msg };
  }
};

export const internxtUploadFileWithProgress = async (
  localPath: string,
  remotePath: string,
  onProgress?: (percent: number) => void
): Promise<InternxtUploadResult> => {
  return new Promise(async (resolve) => {
    try {
      log(`Uploading with progress: ${localPath} to ${remotePath}`);

      const lastSlashIndex = remotePath.lastIndexOf("/");
      if (lastSlashIndex > 0) {
        const folderPath = remotePath.substring(0, lastSlashIndex);
        await internxtCreateFolder(folderPath).catch(() => {});
      }

      const child = spawn("internxt", ["upload-file", localPath, remotePath], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;
        const progressMatch = chunk.match(/(\d+)%/);
        if (progressMatch && onProgress) {
          onProgress(parseInt(progressMatch[1], 10));
        }
      });

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      child.on("close", (code) => {
        const fullOutput = output + errorOutput;
        if (code === 0 && !fullOutput.toLowerCase().includes("error")) {
          resolve({ success: true, filePath: localPath, remotePath, output: fullOutput });
        } else {
          resolve({ success: false, filePath: localPath, remotePath, output: fullOutput, error: fullOutput || `Exit ${code}` });
        }
      });

      child.on("error", (error: Error) => {
        resolve({ success: false, filePath: localPath, remotePath, error: error.message });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      resolve({ success: false, filePath: localPath, remotePath, error: msg });
    }
  });
};

export const internxtCreateFolder = async (remotePath: string): Promise<InternxtFolderResult> => {
  try {
    log(`Creating folder: ${remotePath}`);

    const { stdout, stderr } = await execAsync(`internxt create-folder "${remotePath}"`);
    const output = stdout || stderr;

    if (output.toLowerCase().includes("error") && !output.toLowerCase().includes("already exists")) {
      return { success: false, path: remotePath, output, error: output };
    }

    return { success: true, path: remotePath, output };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes("already exists")) {
      return { success: true, path: remotePath, output: "Folder already exists" };
    }
    return { success: false, path: remotePath, error: msg };
  }
};

const parseTextListOutput = (output: string, parentPath: string): InternxtFileInfo[] => {
  const files: InternxtFileInfo[] = [];
  const lines = output.split("\n").filter(line => line.trim());

  for (const line of lines) {
    const match = line.match(/^(.+?)\s+(\d+)\s*bytes?$/i);
    if (match) {
      files.push({
        name: match[1].trim(),
        path: parentPath === "/" ? `/${match[1].trim()}` : `${parentPath}/${match[1].trim()}`,
        size: parseInt(match[2], 10),
        isFolder: false
      });
    } else if (line.endsWith("/")) {
      const folderName = line.slice(0, -1);
      files.push({
        name: folderName,
        path: parentPath === "/" ? `/${folderName}` : `${parentPath}/${folderName}`,
        size: 0,
        isFolder: true
      });
    }
  }

  return files;
};

export const internxtListFiles = async (remotePath: string = "/"): Promise<InternxtListResult> => {
  try {
    log(`Listing files in: ${remotePath}`);

    const { stdout } = await execAsync(`internxt list-files "${remotePath}" --format=json`);

    let files: InternxtFileInfo[] = [];
    try {
      const parsed = JSON.parse(stdout);
      files = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      files = parseTextListOutput(stdout, remotePath);
    }

    return { success: true, files };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, files: [], error: msg };
  }
};

export const internxtFileExists = async (remotePath: string): Promise<boolean> => {
  const parentPath = remotePath.substring(0, remotePath.lastIndexOf("/")) || "/";
  const fileName = remotePath.substring(remotePath.lastIndexOf("/") + 1);

  const listResult = await internxtListFiles(parentPath);
  if (!listResult.success) return false;

  return listResult.files.some(f => f.name === fileName);
};

export const internxtDeleteFile = async (remotePath: string): Promise<boolean> => {
  try {
    log(`Deleting file: ${remotePath}`);
    await execAsync(`internxt delete "${remotePath}" --permanent`);
    return true;
  } catch (error) {
    log(`Failed to delete: ${error}`);
    return false;
  }
};

export const internxtDownloadFile = async (remotePath: string, localPath: string): Promise<InternxtUploadResult> => {
  try {
    log(`Downloading ${remotePath} to ${localPath}`);

    const { stdout, stderr } = await execAsync(`internxt download-file "${remotePath}" "${localPath}"`);
    const output = stdout || stderr;

    if (output.toLowerCase().includes("error") || output.toLowerCase().includes("failed")) {
      return { success: false, filePath: localPath, remotePath, output, error: output };
    }

    return { success: true, filePath: localPath, remotePath, output };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, filePath: localPath, remotePath, error: msg };
  }
};

export const internxtDownloadFileWithProgress = async (
  remotePath: string,
  localPath: string,
  onProgress?: (percent: number) => void
): Promise<InternxtUploadResult> => {
  return new Promise((resolve) => {
    try {
      log(`Downloading with progress: ${remotePath} to ${localPath}`);

      const child = spawn("internxt", ["download-file", remotePath, localPath], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;
        const progressMatch = chunk.match(/(\d+)%/);
        if (progressMatch && onProgress) {
          onProgress(parseInt(progressMatch[1], 10));
        }
      });

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      child.on("close", (code) => {
        const fullOutput = output + errorOutput;
        if (code === 0 && !fullOutput.toLowerCase().includes("error")) {
          resolve({ success: true, filePath: localPath, remotePath, output: fullOutput });
        } else {
          resolve({ success: false, filePath: localPath, remotePath, output: fullOutput, error: fullOutput || `Exit ${code}` });
        }
      });

      child.on("error", (error: Error) => {
        resolve({ success: false, filePath: localPath, remotePath, error: error.message });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      resolve({ success: false, filePath: localPath, remotePath, error: msg });
    }
  });
};
