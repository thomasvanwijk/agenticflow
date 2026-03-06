# Stage 1: Build MCPJungle from source
FROM golang:1.24-alpine AS mcpjungle-builder

RUN apk add --no-cache git
WORKDIR /build
RUN git clone --depth 1 --branch 0.3.5 https://github.com/mcpjungle/MCPJungle.git .
RUN go build -o /mcpjungle .

# Stage 2: Build agenticflow-memory-mcp
FROM node:22-bookworm-slim AS memory-builder

WORKDIR /app
COPY agenticflow-memory-mcp/package*.json ./
RUN npm install
COPY agenticflow-memory-mcp/ .
RUN npm run build

# Stage 3: Build agenticflow CLI
FROM node:22-bookworm-slim AS cli-builder

WORKDIR /app
COPY cli/package*.json ./
RUN npm install
COPY cli/ .
RUN npm run build

# Stage 4: Runtime
FROM node:24-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy MCPJungle binary
COPY --from=mcpjungle-builder /mcpjungle /usr/local/bin/mcpjungle

# Copy compiled memory MCP
COPY --from=memory-builder /app /app/agenticflow-memory-mcp

# Copy cli and link the agenticflow global command
COPY --from=cli-builder /app /app/cli
RUN cd /app/cli && npm link

WORKDIR /

# Install npm-based MCP servers and patch Jira search API
RUN npm install -g mcp-atlassian jsdom && \
    sed -i 's/response.data.issues.map/(response.data.issues || []).map/g' /usr/local/lib/node_modules/mcp-atlassian/dist/jira/handlers.js && \
    sed -i "s|/rest/api/3/search|/rest/api/3/search/jql|g" /usr/local/lib/node_modules/mcp-atlassian/dist/jira/handlers.js

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:8080/health || exit 1

COPY gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
