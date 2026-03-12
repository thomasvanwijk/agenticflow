import { startSyncController } from "./services/sync-controller.js";
import { logger } from "./utils/logger.js";

// Start background sync service
startSyncController();
logger.info("Sync Controller daemon started successfully", "daemon_startup");

// Keep the process alive
setInterval(() => {}, 1000 * 60 * 60);
