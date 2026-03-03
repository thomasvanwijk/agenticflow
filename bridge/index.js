import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';

const app = express();
const port = process.env.BRIDGE_PORT || 3000;

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Load servers from YAML
const loadServers = () => {
    try {
        const fileContents = fs.readFileSync('/config/servers.yaml', 'utf8');
        const config = yaml.load(fileContents);
        return Array.isArray(config) ? config : [];
    } catch (e) {
        console.error('Failed to load servers.yaml:', e);
        return [];
    }
};

const servers = loadServers().filter(s => s.type === 'stdio');
const activeProcesses = new Map();

servers.forEach(serverConfig => {
    console.log(`Setting up bridge for: ${serverConfig.name}`);

    // SSE Endpoint
    app.get(`/${serverConfig.name}/sse`, (req, res) => {
        console.log(`New SSE connection for ${serverConfig.name}`);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Spawn child process
        const child = spawn(serverConfig.command, serverConfig.args || [], {
            env: { ...process.env, ...serverConfig.env },
            shell: true
        });

        const sessionId = Math.random().toString(36).substring(7);
        activeProcesses.set(sessionId, child);

        // Notify client of the session endpoint
        // NOTE: The endpoint event must contain the full path for the POST messages
        res.write(`event: endpoint\ndata: /${serverConfig.name}/messages?session=${sessionId}\n\n`);

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            const lines = chunk.split('\n').filter(l => l.trim());
            lines.forEach(line => {
                res.write(`data: ${line}\n\n`); // Standard SSE format
            });
        });

        child.stderr.on('data', (data) => {
            console.error(`[${serverConfig.name}] stderr: ${data}`);
        });

        child.on('close', (code) => {
            console.log(`[${serverConfig.name}] process exited with code ${code}`);
            res.end();
            activeProcesses.delete(sessionId);
        });

        req.on('close', () => {
            console.log(`SSE connection closed for ${serverConfig.name}`);
            child.kill();
            activeProcesses.delete(sessionId);
        });
    });

    // Message Endpoint
    app.post(`/${serverConfig.name}/messages`, (req, res) => {
        const { session } = req.query;
        const child = activeProcesses.get(session);

        if (!child) {
            console.warn(`[${serverConfig.name}] Session not found for session ID: ${session}`);
            return res.status(404).send('Session not found');
        }

        console.log(`Forwarding message to ${serverConfig.name} [${session}]:`, JSON.stringify(req.body));
        child.stdin.write(JSON.stringify(req.body) + '\n');
        res.status(202).send('Accepted');
    });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`MCP Stdio-to-SSE Proxy listening on port ${port}`);
});
