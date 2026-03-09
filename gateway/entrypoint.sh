#!/bin/sh
# agenticflow gateway entrypoint
# Starts MCPJungle, waits for readiness, then hands off to Sync Controller.

set -e

REGISTRY="http://127.0.0.1:8080"
CONFIG_DIR="/config"
SERVERS_DIR="${CONFIG_DIR}/servers.d"

mkdir -p "$SERVERS_DIR"

# ── 1. Inject secrets into config files (if secrets.enc exists) ───────────────
if [ -f "${CONFIG_DIR}/secrets.enc" ]; then
  if [ -n "$AGENTICFLOW_MASTER_PASSWORD" ]; then
    echo "[agenticflow] Injecting secrets from secrets.enc..."
    agenticflow secrets inject \
      -f "${CONFIG_DIR}/secrets.enc" \
      -t "${CONFIG_DIR}" \
      -o "${CONFIG_DIR}" || echo "[agenticflow]   WARNING: Secret injection failed. Continuing with existing config."
  else
    echo "[agenticflow]   WARNING: secrets.enc found but AGENTICFLOW_MASTER_PASSWORD is not set. Skipping injection."
  fi
else
  echo "[agenticflow] No secrets.enc found. Using config files as-is."
fi

# ── 2. Start MCPJungle in the background ─────────────────────────────────────
mcpjungle start &
MCPJUNGLE_PID=$!

# ── 3. Wait for MCPJungle to be ready ────────────────────────────────────────
echo "[agenticflow] Waiting for MCPJungle to start..."
for i in $(seq 1 30); do
  STATUS=$(curl -s "${REGISTRY}/health" || true)
  if echo "$STATUS" | grep -q '"ok"'; then
    echo "[agenticflow] MCPJungle is ready."
    break
  fi
  sleep 1
done

# ── 4. Start the Unified Sync Controller Daemon ──────────────────────────────
echo "[agenticflow] Starting Unified Sync Controller..."
# We export SERVERS_DIR to explicitly tell the sync controller where to look
export SERVERS_DIR
node /app/agenticflow-memory-mcp/dist/sync-daemon.js &
SYNC_PID=$!

# ── 5. Hand off to MCPJungle (foreground) ─────────────────────────────────────
echo "[agenticflow] Startup complete. Gateway running (PID: ${MCPJUNGLE_PID})."
wait $MCPJUNGLE_PID