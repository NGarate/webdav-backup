#!/usr/bin/env bun

/**
 * internxt-backup CLI
 * A simple, fast CLI for backing up and restoring files to/from Internxt Drive
 */

import { parseArgs } from "node:util";
import chalk from "chalk";

// Import the syncFiles function
import { syncFiles, SyncOptions } from "./src/file-sync";
import { BackupScheduler } from "./src/core/scheduler/scheduler";
import { RestoreManager, RestoreOptions } from "./src/core/restore/restore-manager";

// Get version from package.json using Bun's built-in functionality
const packageJson = await Bun.file("package.json").json();
const VERSION = packageJson.version || "unknown";

// Parse command line arguments
function parse() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      // Core options
      "source": { type: "string" },
      "target": { type: "string" },
      "cores": { type: "string" },

      // Scheduling
      "schedule": { type: "string" },
      "daemon": { type: "boolean" },

      // Behavior
      "force": { type: "boolean" },
      "resume": { type: "boolean" },
      "chunk-size": { type: "string" },

      // Output
      "quiet": { type: "boolean" },
      "verbose": { type: "boolean" },

      // Help
      "help": { type: "boolean", short: "h" },
      "version": { type: "boolean", short: "v" }
    },
    allowPositionals: true
  });

  return {
    ...values,
    command: positionals[0],
    positionalPath: positionals[1]
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

// Handle backup command
async function handleBackup(args: any) {
  const sourceDir = args.positionalPath || args.source;
  
  if (!sourceDir) {
    console.error(chalk.red("Error: Source directory is required"));
    console.log();
    showHelp();
    process.exit(1);
  }

  // Build sync options
  const syncOptions: SyncOptions = {
    cores: args.cores ? parseInt(args.cores) : undefined,
    target: args.target,
    quiet: args.quiet,
    verbose: args.verbose,
    force: args.force,
    resume: args.resume,
    chunkSize: args["chunk-size"] ? parseInt(args["chunk-size"]) : undefined
  };

  // Handle daemon mode with scheduling
  if (args.daemon && args.schedule) {
    console.log(chalk.blue(`Starting daemon mode with schedule: ${args.schedule}`));
    const scheduler = new BackupScheduler();
    await scheduler.startDaemon({
      sourceDir,
      schedule: args.schedule,
      syncOptions
    });
    return;
  }

  // Run the main sync function with the parsed arguments
  await syncFiles(sourceDir, syncOptions);
}

// Handle restore command
async function handleRestore(args: any) {
  const remotePath = args.positionalPath;
  
  if (!remotePath) {
    console.error(chalk.red("Error: Remote path is required"));
    console.log();
    showHelp();
    process.exit(1);
  }

  // Determine local destination
  // If a second positional argument is provided, use it as destination
  // Otherwise use --target or current directory
  const destination = args.destination || args.target || ".";

  // Build restore options
  const restoreOptions: RestoreOptions = {
    cores: args.cores ? parseInt(args.cores) : undefined,
    force: args.force,
    quiet: args.quiet,
    verbose: args.verbose
  };

  console.log(chalk.blue(`Restoring from ${remotePath} to ${destination}...`));

  const restoreManager = new RestoreManager(remotePath, destination, restoreOptions);
  const result = await restoreManager.restore();

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
    // Check if help or version flags are present before parsing other arguments
    const rawArgs = Bun.argv.slice(2);

    // Check for help flag first
    if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
      showHelp();
      process.exit(0);
    }

    // Check for version flag
    if (rawArgs.includes("--version") || rawArgs.includes("-v")) {
      showVersion();
      process.exit(0);
    }

    // Show help when no arguments are provided
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
        // For backward compatibility, treat unknown command as backup with positional path
        if (args.command && !args.command.startsWith("--")) {
          args.source = args.command;
          args.positionalPath = args.command;
          await handleBackup(args);
        } else {
          console.error(chalk.red(`Error: Unknown command "${args.command}"`));
          console.log();
          showHelp();
          process.exit(1);
        }
    }

  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    console.log();
    showHelp();
    process.exit(1);
  }
}

// Run the main function
if (import.meta.main) {
  main().catch(err => {
    console.error(chalk.red(`Error: ${err.message}`));
    console.log();
    showHelp();
    process.exit(1);
  });
}
