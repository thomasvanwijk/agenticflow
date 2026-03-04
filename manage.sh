#!/bin/bash

# Agenticflow Management Script
# Handles Ollama auto-start and Docker environment.

set -e

# --- Configuration ---
OLLAMA_PORT=11434
MAX_RETRIES=30
RETRY_INTERVAL=2

# --- Functions ---

log() {
    echo -e "\033[1;34m[agenticflow]\033[0m $1"
}

error() {
    echo -e "\033[1;31m[error]\033[0m $1"
    exit 1
}

check_ollama() {
    log "Checking if Ollama is running..."
    if ! pgrep -x "Ollama" > /dev/null; then
        log "Ollama is not running. Attempting to start..."
        open -a Ollama
        
        log "Waiting for Ollama to be ready (port $OLLAMA_PORT)..."
        count=0
        while ! lsof -i :$OLLAMA_PORT > /dev/null; do
            if [ $count -ge $MAX_RETRIES ]; then
                error "Ollama failed to start after $((MAX_RETRIES * RETRY_INTERVAL)) seconds."
            fi
            sleep $RETRY_INTERVAL
            count=$((count + 1))
            echo -n "."
        done
        echo ""
        log "Ollama is now ready."
    else
        log "Ollama is already running."
    fi
}

# --- Main Commands ---

case "$1" in
    up)
        check_ollama
        log "Starting Docker containers..."
        docker compose up -d --remove-orphans
        log "All services are up!"
        ;;
    down)
        log "Stopping Docker containers..."
        docker compose down
        log "All services stopped."
        ;;
    restart)
        $0 down
        $0 up
        ;;
    status)
        docker compose ps
        pgrep -x "Ollama" > /dev/null && echo "Ollama: Running" || echo "Ollama: Stopped"
        ;;
    *)
        echo "Usage: ./manage.sh {up|down|restart|status}"
        exit 1
        ;;
esac
