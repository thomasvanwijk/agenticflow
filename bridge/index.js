import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';
import { EventEmitter } from 'events';

const app = express();
const port = process.env.BRIDGE_PORT || 3000;
const bridgeHost = process.env.BRIDGE_HOST || 'bridge';

app.use(express.json());

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} - From: ${req.ip}`);
    next();
});

// Load servers from YAML
const loadServers = () => {
    try {
        const fileContents = fs.readFileSync('/config/servers.yaml', 'utf8');
        const config = yaml.load(fileContents);
        const servers = Array.isArray(config) ? config : [];
        return servers;
    } catch (e) {
        console.error('Failed to load servers:', e.message);
        return [];
    }
};

const servers = loadServers().filter(s => s.type === 'stdio');
const serverProcesses = new Map();
const serverEmitters = new Map();

servers.forEach(serverConfig => {
    const { name } = serverConfig;
    console.log(`Starting process for ${name}: ${serverConfig.command}`);

    const emitter = new EventEmitter();
    const child = spawn(serverConfig.command, serverConfig.args || [], {
        env: { ...process.env, ...serverConfig.env },
        shell: true
    });

    serverProcesses.set(name, child);
    serverEmitters.set(name, emitter);

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim().startsWith('{'));
        lines.forEach(l => emitter.emit('message', l));
    });

    child.stderr.on('data', (data) => {
        console.log(`[${name} stderr] ${data}`);
    });
});

// Routes
servers.forEach(serverConfig => {
    const { name } = serverConfig;

    const handlePost = (req, res) => {
        const child = serverProcesses.get(name);
        if (!child) return res.status(503).json({ error: 'Server not ready' });

        const msg = JSON.stringify(req.body);
        if (req.body.method === 'initialize') {
            console.log(`[${name}] Synchronous initialize...`);
            const emitter = serverEmitters.get(name);
            const onMsg = (respLine) => {
                const response = JSON.parse(respLine);
                if (response.id === req.body.id) {
                    emitter.removeListener('message', onMsg);
                    console.log(`[${name}] Sending synced response.`);
                    res.status(200).json(response);
                }
            };
            emitter.on('message', onMsg);
            child.stdin.write(msg + '\n');
            setTimeout(() => { if (!res.headersSent) res.status(504).json({ error: 'timeout' }); }, 5000);
        } else {
            child.stdin.write(msg + '\n');
            res.status(200).json({ status: 'ok' });
        }
    };

    app.get(`/${name}/sse`, (req, res) => {
        console.log(`[${name}] GET SSE`);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const endpoint = `http://${bridgeHost}:${port}/${name}/messages`;
        res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

        const listener = (msg) => {
            res.write(`event: message\ndata: ${msg}\n\n`);
        };

        const emitter = serverEmitters.get(name);
        emitter.on('message', listener);
        req.on('close', () => {
            console.log(`[${name}] SSE Close`);
            emitter.removeListener('message', listener);
        });
    });

    app.post(`/${name}/messages`, handlePost);
    app.post(`/${name}/sse`, handlePost);
});

// Catch-all
app.use((req, res) => {
    console.warn(`404: ${req.url}`);
    res.status(404).json({ error: 'Not Found', url: req.url });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Global Error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Bridge listening on ${port}`);
});
