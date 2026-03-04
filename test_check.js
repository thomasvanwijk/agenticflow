const { execSync } = require('child_process');
try {
    const out = execSync("docker exec agenticflow-gateway mcpjungle list tools", { stdio: "pipe" }).toString();
    console.log("Output Length:", out.length);
    console.log("Includes semantic search?:", out.includes("agenticflow__semantic_search"));
} catch (e) {
    console.error("Error:", e.message);
}
