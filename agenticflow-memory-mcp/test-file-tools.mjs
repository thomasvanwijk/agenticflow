import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const vaultPath = "/tmp/test-vault-tools";
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath, { recursive: true });

async function run() {
    const transport = new StdioClientTransport({
        command: "node",
        args: [path.join(__dirname, "dist", "index.js")],
        env: {
            ...process.env,
            EMBEDDING_PROVIDER: "local",
            VAULT_PATH: vaultPath,
            CHROMA_HOST: "http://localhost",
            CHROMA_PORT: "8000"
        }
    });

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    console.log("Connected to MCP server!");

    // Test 1: create_note
    console.log("\\nTesting create_note...");
    const createResult = await client.callTool({
        name: "create_note",
        arguments: {
            path: "Features/obsidian-test.md",
            frontmatter: { tags: ["test", "obsidian"], status: "draft" },
            content: "# Test Note\nThis is a test note created by the MCP tool."
        }
    });
    console.log("Result:", JSON.stringify(createResult, null, 2));

    // Test 2: append_to_note
    console.log("\\nTesting append_to_note (no heading)...");
    const appendResult1 = await client.callTool({
        name: "append_to_note",
        arguments: {
            path: "Features/obsidian-test.md",
            content: "## Meeting Notes\n- Discussed approach 1 and 2."
        }
    });
    console.log("Result:", JSON.stringify(appendResult1, null, 2));

    // Test 3: append_to_note (with heading)
    console.log("\\nTesting append_to_note (with heading)...");
    const appendResult2 = await client.callTool({
        name: "append_to_note",
        arguments: {
            path: "Features/obsidian-test.md",
            heading: "## Meeting Notes",
            content: "- Wait, actually direct filesystem is better."
        }
    });
    console.log("Result:", JSON.stringify(appendResult2, null, 2));

    // Test 4: update_note
    console.log("\\nTesting update_note...");
    const updateResult = await client.callTool({
        name: "update_note",
        arguments: {
            path: "Features/obsidian-test.md",
            content: "# Replacement\nThis note was totally replaced."
        }
    });
    console.log("Result:", JSON.stringify(updateResult, null, 2));

    process.exit(0);
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
