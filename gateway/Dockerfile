FROM duaraghav8/mcpjungle:latest as source

FROM node:24-alpine

# Copy mcpjungle binary and certs from official image
COPY --from=source /mcpjungle /mcpjungle
COPY --from=source /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Setup path and workdir
RUN ln -s /mcpjungle /usr/local/bin/mcpjungle
WORKDIR /

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
    CMD node -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

ENTRYPOINT ["/mcpjungle"]
CMD ["start"]
