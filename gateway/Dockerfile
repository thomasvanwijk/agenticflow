FROM duaraghav8/mcpjungle:latest as source

FROM node:20-alpine

# Set up workdir
WORKDIR /

# Copy the MCPJungle binary
COPY --from=source /mcpjungle /mcpjungle

# Expose the gateway port
EXPOSE 8080

# Run the gateway
ENTRYPOINT ["/mcpjungle"]
CMD ["start"]
