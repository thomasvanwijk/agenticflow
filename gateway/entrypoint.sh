#!/bin/sh
# agenticflow gateway entrypoint
# Starts MCPJungle, waits for readiness, then hands off to Sync Controller.

set -e

REGISTRY="http://127.0.0.1:8080"
CONFIG_DIR="/config"
SERVERS_DIR="${CONFIG_DIR}/servers.d"

mkdir -p "$SERVERS_DIR"

# ── 1. Load secrets into the shell environment (in-memory only) ───────────────
# Secrets are decrypted from secrets.enc and exported as shell variables.
# They are NEVER written to disk — the sync-controller resolves them from
# process.env at registration time, just before posting configs to MCPJungle.
if [ -f "${CONFIG_DIR}/secrets.enc" ]; then
  if [ -n "$AGENTICFLOW_MASTER_PASSWORD" ]; then
    echo "[agenticflow] Loading secrets from secrets.enc into environment..."
    eval "$(agenticflow secrets export --file "${CONFIG_DIR}/secrets.enc")" \
      || echo "[agenticflow]   WARNING: Secret export failed. MCP servers may fail to authenticate."
    echo "[agenticflow] Secrets loaded into environment. No plaintext written to disk."
  else
    echo "[agenticflow]   WARNING: secrets.enc found but AGENTICFLOW_MASTER_PASSWORD is not set. Secrets not loaded."
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
# Export SERVERS_DIR and SECRETS_FILE so the sync-controller knows where to watch
export SERVERS_DIR
export SECRETS_FILE="${CONFIG_DIR}/secrets.enc"
node /app/agenticflow-memory-mcp/dist/sync-daemon.js &
SYNC_PID=$!

# ── 5. Hand off to MCPJungle (foreground) ─────────────────────────────────────
echo "[agenticflow] Startup complete. Gateway running (PID: ${MCPJUNGLE_PID})."
wait $MCPJUNGLE_PID