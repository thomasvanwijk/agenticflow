import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
    const transport = new StdioClientTransport({
        command: "node",
        args: [path.join(__dirname, "dist", "index.js")],
        env: {
            ...process.env,
            EMBEDDING_PROVIDER: "local",
            VAULT_PATH: "/tmp/test-vault",
            CHROMA_HOST: "http://localhost",
            CHROMA_PORT: "8000"
        }
    });

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    console.log("Connected to MCP server!");

    console.log("Calling index_vault...");
    const indexResult = await client.callTool({ name: "index_vault", arguments: { force: true } });
    console.log("Index Result:");
    console.log(JSON.stringify(indexResult, null, 2));

    console.log("Calling semantic_search...");
    const searchResult = await client.callTool({ name: "semantic_search", arguments: { query: "space planets", limit: 2 } });
    console.log("Search Result:");
    console.log(JSON.stringify(searchResult, null, 2));

    process.exit(0);
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
