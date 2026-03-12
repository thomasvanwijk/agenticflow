# Architectural Decision: Sticking with Docker

## Overview
Initially, we considered moving away from Docker to a purely native Node.js/npm monorepo architecture for the Agenticflow Gateway. The goal was to remove the hard dependency on Docker by running `mcpjungle`, Python/HuggingFace dependencies, and Node components directly on the host machine.

## Decision: Reject Native Architecture
After reviewing the proposed native architecture, we decided **against** moving away from Docker. 

## Rationale
The core value proposition of Agenticflow includes its "plug-and-play" nature and extreme portability. Moving away from Docker would mean replacing one single dependency (Docker) with multiple complex host-level dependencies:
- Node.js (>= 22.0.0)
- Python 3, `pip`, `uv`, and virtual environments (for various MCP servers)
- Go (for compiling or running `mcpjungle` binaries)
- System-level build tools (`build-essential`, `g++`, etc.)

Requiring users to install and manage these disparate packages across different operating systems (macOS, Windows, Linux) would severely degrade the user experience and limit portability.

## Future Direction
Instead of removing Docker, our architectural focus will be on:
1. **Making the Docker setup as seamless and portable as possible.**
2. **Improving the CLI** to help users install, configure, and manage Docker automatically so they don't have to interact with Docker commands directly.
3. Keeping the environment encapsulated to guarantee that if it runs on one machine, it runs exactly the same on another.
