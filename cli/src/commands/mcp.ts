import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "../config.js";

export const getServersDir = () => path.join(CONFIG_DIR, "servers.d");

export function listMcpAction() {
    const serversDir = getServersDir();
    if (!fs.existsSync(serversDir)) {
        console.log("No MCP servers directory found.");
        return;
    }

    const files = fs.readdirSync(serversDir).filter(f => f.endsWith(".json"));
    if (files.length === 0) {
        console.log("No MCP servers configured.");
        return;
    }

    console.log("Installed MCP Servers:");
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(serversDir, file), "utf-8");
            const config = JSON.parse(content);
            console.log(`- ${config.name} (${file})`);
            console.log(`  Command: ${config.command} ${config.args ? config.args.join(" ") : ""}`);
            if (config.env && Object.keys(config.env).length > 0) {
                console.log(`  Env: ${Object.keys(config.env).join(", ")}`);
            }
        } catch (e) {
            console.log(`- ${file} (Failed to parse)`);
        }
    }
}

export function addMcpAction(name: string, options: { command: string; env?: string[] }, args: string[]) {
    const serversDir = getServersDir();
    if (!fs.existsSync(serversDir)) {
        fs.mkdirSync(serversDir, { recursive: true });
    }

    const envMap: Record<string, string> = {};
    if (options.env) {
        for (const e of options.env) {
            const [key, ...val] = e.split("=");
            if (key) {
                envMap[key] = val.join("=") || "";
            }
        }
    }

    const config = {
        name,
        transport: "stdio",
        command: options.command,
        args: args || [],
        env: envMap,
        session_mode: "stateful"
    };

    const filePath = path.join(serversDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 4));
    console.log(`✅ MCP server '${name}' added successfully to ${filePath}`);
}

export function removeMcpAction(name: string) {
    const serversDir = getServersDir();
    const filePath = path.join(serversDir, `${name}.json`);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✅ MCP server '${name}' removed successfully.`);
    } else {
        console.error(`❌ MCP server '${name}' not found.`);
        process.exit(1);
    }
}
