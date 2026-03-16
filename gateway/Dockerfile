# Stage 1: Build MCPJungle from source
FROM golang:1.24-alpine AS mcpjungle-builder

RUN apk add --no-cache git
WORKDIR /build
RUN git clone --depth 1 --branch 0.3.5 https://github.com/mcpjungle/MCPJungle.git .
RUN sed -i 's/serverToolNameSep = "__"/serverToolNameSep = "_"/g' internal/service/mcp/util.go && \
    sed -i 's/serverPromptNameSep = "__"/serverPromptNameSep = "_"/g' internal/service/mcp/util.go && \
    sed -i 's/"__"/ "_" /g' internal/service/mcp/util.go
RUN go build -o /mcpjungle .

# Stage 2: Build Node components (Monorepo)
FROM node:22-bookworm-slim AS node-builder

WORKDIR /app
COPY package*.json ./
COPY packages/ packages/
COPY cli/ cli/

# Use 8GB memory limit for Node during build
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Install dependencies (including devDeps for tsc)
RUN npm install

# Build workspaces sequentially to manage memory and respect internal dependencies.
# Using -w ensures npm finds the correct hoisted binaries (like tsc).
RUN npm run build -w @agenticflow/mcp-embedding-providers
RUN npm run build -w @agenticflow/mcp-semantic-search-core
RUN npm run build -w @agenticflow/mcp-memory
RUN npm run build -w @agenticflow/mcp-sync-controller
RUN npm run build -w agenticflow-cli

# Stage 3: Runtime
FROM node:22-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    procps \
    python3 \
    python3-pip \
    python3-venv \
    build-essential python3-dev g++ make \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Add uv to PATH
ENV PATH="/root/.local/bin:${PATH}"

# Copy MCPJungle binary
COPY --from=mcpjungle-builder /mcpjungle /usr/local/bin/mcpjungle

# Copy all node packages
WORKDIR /app
COPY --from=node-builder /app .
COPY gateway/ gateway/

# Link the agenticflow global command
RUN cd /app/cli && npm link

# Pre-download embedding models
RUN mkdir -p /app/hf-cache && \
    export TRANSFORMERS_CACHE=/app/hf-cache && \
    if [ -f "gateway/pre-download-models.mjs" ]; then node gateway/pre-download-models.mjs; fi

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://127.0.0.1:8080/health || exit 1

WORKDIR /
COPY gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
