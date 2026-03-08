#!/bin/sh
# agenticflow gateway entrypoint
# Starts MCPJungle, waits for readiness, then applies configuration.

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

# ── 2. Wait for MCPJungle to be ready ────────────────────────────────────────
echo "[agenticflow] Waiting for MCPJungle to start..."
for i in $(seq 1 30); do
  STATUS=$(curl -s "${REGISTRY}/health" || true)
  if echo "$STATUS" | grep -q '"ok"'; then
    echo "[agenticflow] MCPJungle is ready."
    break
  fi
  sleep 1
done

# ── 3. Register servers from config files ─────────────────────────────────────
echo "[agenticflow] Registering MCP servers from ${SERVERS_DIR}..."

if [ -d "$SERVERS_DIR" ]; then
  for conf in "${SERVERS_DIR}"/*.json; do
    # Handle case where no files match the glob
    [ -e "$conf" ] || continue
    
    name=$(basename "$conf" .json)
    # Skip example files
    case "$name" in *example*) continue;; esac

    # Check if already registered to keep startup idempotent
    if mcpjungle list servers --registry "$REGISTRY" 2>/dev/null | grep -q "^${name}$"; then
      echo "[agenticflow]   - ${name}: already registered, skipping."
    else
      echo "[agenticflow]   - ${name}: registering..."
      mcpjungle register --conf "$conf" --registry "$REGISTRY" && \
        echo "[agenticflow]   - ${name}: registered." || \
        echo "[agenticflow]   WARNING: could not register ${name}"
    fi
  done
fi

# ── 4. Clean up old servers (those whose config files are gone from servers.d) ───────────────
echo "[agenticflow] Cleaning up old servers..."
for server in $(mcpjungle list servers --registry "$REGISTRY" 2>/dev/null | grep "^[0-9]\+\." | awk '{print $2}'); do
  # Skip built-in or required servers if necessary.
  if [ ! -f "${SERVERS_DIR}/${server}.json" ]; then
    echo "[agenticflow]   - ${server}: config missing in ${SERVERS_DIR}, unregistering..."
    mcpjungle deregister "$server" --registry "$REGISTRY" 2>/dev/null || \
      echo "[agenticflow]   WARNING: could not deregister ${server}"
  fi
done

# ── 5. Disable servers that should be hidden from MCP clients ─────────────────
echo "[agenticflow] Hiding atlassian tools from MCP client tool list..."
mcpjungle disable server atlassian --registry "$REGISTRY" 2>/dev/null || \
  echo "[agenticflow]   WARNING: could not disable atlassian (may already be disabled)"

# ── 6. Seed the tool discovery index ──────────────────────────────────────────
echo "[agenticflow] Seeding tool discovery index (background)..."
(
  sleep 5
  mcpjungle invoke agenticflow__refresh_tool_index --registry "$REGISTRY" 2>&1 | \
    sed 's/^/[agenticflow][tool-index] /'
) &

# ── 7. Hand off to MCPJungle (foreground) ─────────────────────────────────────
echo "[agenticflow] Startup complete. Handing off to MCPJungle (PID: ${MCPJUNGLE_PID})."
wait $MCPJUNGLE_PID
