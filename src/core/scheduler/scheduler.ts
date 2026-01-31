/**
 * Backup Scheduler - Functional exports
 * Handles scheduled backups using croner (Bun-compatible cron library)
 */

import { Cron } from "croner";
import * as logger from "../../utils/logger.js";
import { syncFiles, SyncOptions } from "../../file-sync.js";

export interface BackupConfig {
  sourceDir: string;
  schedule: string;
  syncOptions: SyncOptions;
}

let _verbosity = logger.Verbosity.Normal;
const _jobs = new Map<string, Cron>();

const validateCronExpression = (expression: string): boolean => {
  try {
    new Cron(expression, { maxRuns: 1 });
    return true;
  } catch {
    return false;
  }
};

export const initBackupScheduler = (verbosity: number = logger.Verbosity.Normal): void => {
  _verbosity = verbosity;
};

export const runBackupOnce = async (config: BackupConfig): Promise<void> => {
  const startTime = Date.now();

  try {
    logger.info(`Starting backup from ${config.sourceDir}`, _verbosity);
    await syncFiles(config.sourceDir, config.syncOptions);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.success(`Backup completed in ${duration}s`, _verbosity);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Backup failed: ${msg}`);
    throw error;
  }
};

export const stopBackupJob = (jobId: string): boolean => {
  const job = _jobs.get(jobId);
  if (job) {
    job.stop();
    _jobs.delete(jobId);
    logger.info(`Stopped job: ${jobId}`, _verbosity);
    return true;
  }
  return false;
};

export const stopAllBackupJobs = (): void => {
  for (const [jobId, job] of _jobs) {
    job.stop();
    logger.info(`Stopped job: ${jobId}`, _verbosity);
  }
  _jobs.clear();
};

export const getBackupJobInfo = (): Array<{
  id: string;
  nextRun: Date | null;
  previousRun: Date | null;
  running: boolean;
}> => {
  return Array.from(_jobs.entries()).map(([id, job]) => ({
    id,
    nextRun: job.nextRun(),
    previousRun: job.previousRun(),
    running: job.isRunning()
  }));
};

export const scheduleDelayedBackup = async (config: BackupConfig, delayMs: number): Promise<void> => {
  logger.info(`Scheduling backup in ${delayMs}ms`, _verbosity);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await runBackupOnce(config);
};

const keepDaemonAlive = (): Promise<void> => {
  return new Promise((resolve) => {
    const shutdown = () => {
      logger.info("\nShutting down daemon...", _verbosity);
      stopAllBackupJobs();
      resolve(); // ✅ No process.exit() - let caller decide
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep alive
    setInterval(() => {}, 60000);
  });
};

export const startBackupDaemon = async (config: BackupConfig): Promise<void> => {
  if (!validateCronExpression(config.schedule)) {
    throw new Error(`Invalid cron expression: ${config.schedule}`);
  }

  logger.info(`Starting backup daemon with schedule: ${config.schedule}`, _verbosity);
  logger.info(`Source: ${config.sourceDir}`, _verbosity);
  logger.info(`Target: ${config.syncOptions.target || "/"}`, _verbosity);

  // Run initial backup
  logger.info("Running initial backup...", _verbosity);
  await runBackupOnce(config);

  // Schedule recurring backups
  const jobId = `${config.sourceDir}-${Date.now()}`;
  const job = new Cron(
    config.schedule,
    { name: jobId, protect: true },
    async () => {
      logger.info(`Scheduled backup triggered at ${new Date().toISOString()}`, _verbosity);
      try {
        await runBackupOnce(config);
        logger.info("Scheduled backup completed successfully", _verbosity);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Scheduled backup failed: ${msg}`);
      }
    }
  );

  _jobs.set(jobId, job);

  logger.success(`Daemon started. Next run: ${job.nextRun()?.toISOString() || "unknown"}`, _verbosity);

  // Keep alive (returns on shutdown signal)
  await keepDaemonAlive();
};
