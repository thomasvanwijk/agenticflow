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
RUN npm install
COPY agenticflow-memory-mcp/ .
RUN npm run build

# Stage 3: Build secret-manager
FROM node:22-alpine AS secret-manager-builder

WORKDIR /app
COPY secret-manager/package*.json ./
RUN npm install
COPY secret-manager/ .
RUN npm run build

# Stage 4: Runtime
FROM node:24-alpine

# Copy MCPJungle binary and certs
COPY --from=mcpjungle-builder /mcpjungle /mcpjungle
COPY --from=mcpjungle-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN ln -s /mcpjungle /usr/local/bin/mcpjungle

# Copy compiled memory MCP (MCPJungle will spawn it via STDIO)
COPY --from=memory-builder /app /app/agenticflow-memory-mcp

# Copy secret-manager
COPY --from=secret-manager-builder /app /app/secret-manager
RUN cd /app/secret-manager && npm link

WORKDIR /

# Install npm-based MCP servers that MCPJungle will spawn via STDIO transport
RUN npm install -g mcp-atlassian jsdom

COPY gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["start"]
