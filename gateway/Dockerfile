# Stage 1: Build MCPJungle from source
FROM golang:1.24-alpine AS mcpjungle-builder

RUN apk add --no-cache git
WORKDIR /build
RUN git clone --depth 1 --branch 0.3.5 https://github.com/mcpjungle/MCPJungle.git .
RUN go build -o /mcpjungle .

# Stage 2: Build agenticflow-memory-mcp
FROM node:22-alpine AS memory-builder

WORKDIR /app
COPY agenticflow-memory-mcp/package*.json ./
RUN npm install && \
    npm install onnxruntime-web
COPY agenticflow-memory-mcp/ .
RUN npm run build && \
    # @huggingface/transformers ships onnxruntime-node (glibc native binary) as a dep.
    # Alpine Linux uses musl libc — the .so file cannot be loaded. We forcibly delete
    # the native binary directory at the very end so Node falls back to onnxruntime-web.
    # This must run AFTER all npm installs so npm doesn't auto-restore it.
    rm -rf node_modules/onnxruntime-node

# Stage 3: Build agenticflow CLI
FROM node:22-alpine AS cli-builder

WORKDIR /app
COPY cli/package*.json ./
RUN npm install
COPY cli/ .
RUN npm run build

# Stage 4: Runtime
FROM node:24-alpine

# Copy MCPJungle binary and certs
COPY --from=mcpjungle-builder /mcpjungle /mcpjungle
COPY --from=mcpjungle-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN ln -s /mcpjungle /usr/local/bin/mcpjungle

# Copy compiled memory MCP (MCPJungle will spawn it via STDIO)
COPY --from=memory-builder /app /app/agenticflow-memory-mcp

# Copy cli and link the agenticflow global command
COPY --from=cli-builder /app /app/cli
RUN cd /app/cli && npm link

WORKDIR /

# Install npm-based MCP servers that MCPJungle will spawn via STDIO transport
# Install npm-based MCP servers and patch Jira search API (which was recently changed by Atlassian)
RUN npm install -g mcp-atlassian jsdom && \
    sed -i 's/response.data.issues.map/(response.data.issues || []).map/g' /usr/local/lib/node_modules/mcp-atlassian/dist/jira/handlers.js && \
    sed -i "s|/rest/api/3/search|/rest/api/3/search/jql|g" /usr/local/lib/node_modules/mcp-atlassian/dist/jira/handlers.js

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

COPY gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
