#!/bin/sh
# agenticflow gateway entrypoint
# Starts MCPJungle, waits for readiness, then applies configuration.

set -e

REGISTRY="http://127.0.0.1:8080"
CONFIG_DIR="/config"

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
/mcpjungle start &
MCPJUNGLE_PID=$!

# ── 2. Wait for MCPJungle to be ready ────────────────────────────────────────
echo "[agenticflow] Waiting for MCPJungle to start..."
for i in $(seq 1 30); do
  STATUS=$(wget -qO- "${REGISTRY}/health" 2>/dev/null || true)
  if echo "$STATUS" | grep -q '"ok"'; then
    echo "[agenticflow] MCPJungle is ready."
    break
  fi
  sleep 1
done

# ── 3. Register servers from config files ─────────────────────────────────────
echo "[agenticflow] Registering MCP servers..."

for conf in "${CONFIG_DIR}"/*.json; do
  name=$(basename "$conf" .json)
  # Skip example files
  case "$name" in *example*) continue;; esac

  # Check if already registered to keep startup idempotent
  if /mcpjungle list servers --registry "$REGISTRY" 2>/dev/null | grep -q "^${name}$"; then
    echo "[agenticflow]   - ${name}: already registered, skipping."
  else
    echo "[agenticflow]   - ${name}: registering..."
    /mcpjungle register --conf "$conf" --registry "$REGISTRY" && \
      echo "[agenticflow]   - ${name}: registered." || \
      echo "[agenticflow]   WARNING: could not register ${name}"
  fi
done

# ── 4. Disable servers that should be hidden from MCP clients ─────────────────
# Atlassian tools are available for proxy invocation but hidden to save context.
echo "[agenticflow] Hiding atlassian tools from MCP client tool list..."
/mcpjungle disable server atlassian --registry "$REGISTRY" 2>/dev/null || \
  echo "[agenticflow]   WARNING: could not disable atlassian (may already be disabled)"

# ── 5. Seed the tool discovery index ──────────────────────────────────────────
# Runs in background — memory may take a moment to spawn
echo "[agenticflow] Seeding tool discovery index (background)..."
(
  sleep 5
  /mcpjungle invoke agenticflow__refresh_tool_index --registry "$REGISTRY" 2>&1 | \
    sed 's/^/[agenticflow][tool-index] /'
) &

# ── 6. Hand off to MCPJungle (foreground) ─────────────────────────────────────
echo "[agenticflow] Startup complete. Handing off to MCPJungle (PID: ${MCPJUNGLE_PID})."
wait $MCPJUNGLE_PID
