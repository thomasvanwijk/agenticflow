import { validateConfig } from "./config.js";
import { startSyncController } from "./services/sync-controller.js";
import { logger } from "./utils/logger.js";

// Validate environment
validateConfig();

// Start the Sync Controller
logger.info("Starting AgenticFlow Unified Sync Controller daemon", "sync-daemon");
startSyncController();

// Keep the process alive
process.stdin.resume();