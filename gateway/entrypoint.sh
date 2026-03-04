#!/bin/sh
set -e

echo "Starting AgenticFlow Gateway..."

if [ -f "/config/secrets.enc" ]; then
    if [ -n "$AGENTICFLOW_MASTER_PASSWORD" ]; then
        echo "Found secrets.enc and AGENTICFLOW_MASTER_PASSWORD. Injecting secrets..."
        agenticflow-secrets inject -f /config/secrets.enc -t /config -o /config || echo "Warning: Secret injection failed. Continuing anyway."
    else
        echo "Warning: /config/secrets.enc found but AGENTICFLOW_MASTER_PASSWORD is not set. Cannot inject secrets."
    fi
else
    echo "No /config/secrets.enc found. Skipping secret injection."
fi

echo "Starting MCPJungle..."
exec /mcpjungle "$@"
