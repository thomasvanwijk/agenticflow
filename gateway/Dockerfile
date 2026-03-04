# Stage 1: Build MCPJungle from source
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git
WORKDIR /build
RUN git clone --depth 1 --branch 0.3.5 https://github.com/mcpjungle/MCPJungle.git .
RUN go build -o /mcpjungle .

# Stage 2: Runtime
FROM node:24-alpine

# Copy built binary and certs
COPY --from=builder /mcpjungle /mcpjungle
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Setup path
RUN ln -s /mcpjungle /usr/local/bin/mcpjungle
WORKDIR /

# Install MCP servers that MCPJungle will spawn via STDIO transport
RUN npm install -g mcp-atlassian jsdom

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

ENTRYPOINT ["/mcpjungle"]
CMD ["start"]
