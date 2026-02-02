#!/usr/bin/env bun

/**
 * internxt-backup CLI
 * A simple, fast CLI for backing up and restoring files to/from Internxt Drive
 */

import { parseArgs } from "node:util";
import chalk from "chalk";
import { z } from "zod";

// Import the syncFiles function
import { syncFiles, SyncOptions } from "./src/file-sync.js";
import { initBackupScheduler, startBackupDaemon, BackupConfig } from "./src/core/scheduler/scheduler.js";
import { initRestoreManager, restoreFiles, RestoreOptions } from "./src/core/restore/restore-manager.js";
import { formatError } from "./src/utils/error-handler.js";

// Get version from package.json
const packageJson = await Bun.file("package.json").json();
const VERSION = packageJson.version || "unknown";

// Zod schemas for CLI validation
const BackupSchema = z.object({
  source: z.string().min(1, "Source directory is required"),
  target: z.string().optional(),
  cores: z.coerce.number().int().min(1).max(64).optional(),
  schedule: z.string().optional(),
  daemon: z.boolean().optional(),
  force: z.boolean().optional(),
  resume: z.boolean().optional(),
  "chunk-size": z.coerce.number().int().min(1).max(1024).optional(),
  quiet: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

const RestoreSchema = z.object({
  remotePath: z.string().min(1, "Remote path is required"),
  destination: z.string().optional(),
  target: z.string().optional(),
  cores: z.coerce.number().int().min(1).max(64).optional(),
  force: z.boolean().optional(),
  quiet: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

// Parse command line arguments
function parse() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "source": { type: "string" },
      "target": { type: "string" },
      "cores": { type: "string" },
      "schedule": { type: "string" },
      "daemon": { type: "boolean" },
      "force": { type: "boolean" },
      "resume": { type: "boolean" },
      "chunk-size": { type: "string" },
      "quiet": { type: "boolean" },
      "verbose": { type: "boolean" },
      "help": { type: "boolean", short: "h" },
      "version": { type: "boolean", short: "v" }
    },
    allowPositionals: true
  });

  return {
    ...values,
    command: positionals[0],
    positionalPath: positionals[1],
    destination: positionals[2]
  };
}

// Display help information
function showHelp() {
  console.log(`
${chalk.bold(`Internxt Backup v${VERSION} - A simple CLI for backing up and restoring files`)}

${chalk.bold("Commands:")}
  backup <source-dir>       Backup files to Internxt Drive
  restore <remote-path>     Restore files from Internxt Drive to current directory
  restore <remote-path> <destination>  Restore files to specific directory

${chalk.bold("Backup Options:")}
  --target=<path>         Target folder in Internxt Drive (default: root)
  --cores=<number>        Number of concurrent uploads (default: 2/3 of CPU cores)
  --schedule=<cron>       Cron expression for scheduled backups (e.g., "0 2 * * *")
  --daemon                Run as a daemon with scheduled backups
  --force                 Force upload all files regardless of hash cache
  --resume                Enable resume capability for large files
  --chunk-size=<mb>       Chunk size in MB for large files (default: 50)
  --quiet                 Show minimal output (only errors and progress)
  --verbose               Show detailed output including per-file operations

${chalk.bold("Restore Options:")}
  --target=<path>         Local destination path (default: current directory)
  --cores=<number>        Number of concurrent downloads (default: 2/3 of CPU cores)
  --force                 Force download all files regardless of local existence
  --quiet                 Show minimal output (only errors and progress)
  --verbose               Show detailed output including per-file operations

${chalk.bold("Global Options:")}
  --help, -h              Show this help message
  --version, -v           Show version information

${chalk.bold("Examples:")}
  # Backup operations
  internxt-backup backup /mnt/disk/Photos --target=/Backups/Photos
  internxt-backup backup /mnt/disk/Documents --target=/Backups/Docs
  internxt-backup backup /mnt/disk/Important --target=/Backups --schedule="0 2 * * *" --daemon

  # Restore operations
  internxt-backup restore /Backups/Photos
  internxt-backup restore /Backups/Photos /mnt/recovered/Photos
  internxt-backup restore /Backups/Docs --target=/home/user/Documents --force
`);
}

// Show version information
function showVersion() {
  console.log(`internxt-backup v${VERSION}`);
}

// Unified error handler
const handleCliError = (error: unknown): never => {
  const msg = formatError(error);
  console.error(chalk.red(`Error: ${msg}`));
  console.log();
  showHelp();
  process.exit(1);
};

// Handle backup command
async function handleBackup(args: any) {
  const sourceDir = args.positionalPath || args.source;
  
  if (!sourceDir) {
    handleCliError(new Error("Source directory is required"));
  }

  // Validate with Zod
  const parsed = BackupSchema.safeParse({ ...args, source: sourceDir });
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    handleCliError(new Error(`Validation failed:\n${errorMessages}`));
    return; // TypeScript guard
  }

  const validated = parsed.data;

  // Build sync options
  const syncOptions: SyncOptions = {
    cores: validated.cores,
    target: validated.target,
    quiet: validated.quiet,
    verbose: validated.verbose,
    force: validated.force,
    resume: validated.resume,
    chunkSize: validated["chunk-size"]
  };

  // Handle daemon mode with scheduling
  if (validated.daemon && validated.schedule) {
    console.log(chalk.blue(`Starting daemon mode with schedule: ${validated.schedule}`));
    
    const config: BackupConfig = {
      sourceDir,
      schedule: validated.schedule,
      syncOptions
    };
    
    // Initialize and start daemon (will block until shutdown)
    await startBackupDaemon(config);
    return;
  }

  // Run the main sync function
  await syncFiles(sourceDir, syncOptions);
}

// Handle restore command
async function handleRestore(args: any) {
  const remotePath = args.positionalPath;
  
  if (!remotePath) {
    handleCliError(new Error("Remote path is required"));
  }

  // Validate with Zod
  const parsed = RestoreSchema.safeParse({
    ...args,
    remotePath,
    destination: args.destination
  });
  
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    handleCliError(new Error(`Validation failed:\n${errorMessages}`));
    return; // TypeScript guard
  }

  const validated = parsed.data;

  // Determine local destination
  const destination = validated.destination || validated.target || ".";

  // Build restore options
  const restoreOptions: RestoreOptions = {
    cores: validated.cores,
    force: validated.force,
    quiet: validated.quiet,
    verbose: validated.verbose
  };

  console.log(chalk.blue(`Restoring from ${validated.remotePath} to ${destination}...`));

  // Initialize and restore
  initRestoreManager(validated.remotePath, destination, restoreOptions);
  const result = await restoreFiles();

  if (result.success) {
    console.log(chalk.green(`\nRestore completed successfully!`));
    console.log(`  Total files: ${result.totalFiles}`);
    console.log(`  Downloaded: ${result.downloaded}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Failed: ${result.failed}`);
  } else {
    console.log(chalk.yellow(`\nRestore completed with errors.`));
    console.log(`  Total files: ${result.totalFiles}`);
    console.log(`  Downloaded: ${result.downloaded}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Failed: ${result.failed}`);
    process.exit(1);
  }
}

// Main function
async function main() {
  try {
    const rawArgs = Bun.argv.slice(2);

    // Check for help flag
    if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
      showHelp();
      process.exit(0);
    }

    // Check for version flag
    if (rawArgs.includes("--version") || rawArgs.includes("-v")) {
      showVersion();
      process.exit(0);
    }

    // Show help when no arguments
    if (rawArgs.length === 0) {
      showHelp();
      process.exit(0);
    }

    // Parse CLI arguments
    const args = parse();

    // Route to appropriate command handler
    switch (args.command) {
      case "backup":
        await handleBackup(args);
        break;
      
      case "restore":
        await handleRestore(args);
        break;
      
      default:
        // For backward compatibility, treat unknown command as backup
        if (args.command && !args.command.startsWith("--")) {
          args.source = args.command;
          args.positionalPath = args.command;
          await handleBackup(args);
        } else {
          handleCliError(new Error(`Unknown command "${args.command}"`));
        }
    }

  } catch (error) {
    handleCliError(error);
  }
}

// Run the main function with unified error handling
if (import.meta.main) {
  main().catch(handleCliError);
}
