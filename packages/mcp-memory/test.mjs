import fs from "fs";
import path from "path";
import { wrapAsAiCallout, addContributorToFrontmatter } from "./dist/utils/ai-attribution.js";
import { resolveFuzzyPath } from "./dist/services/vault.js";

async function runTests() {
    console.log("=== Testing mcp-memory Core Functions ===");
    
    process.env.VAULT_PATH = path.join(process.cwd(), "test-vault");
    
    // Test 1: Generic Markdown mode
    console.log("\n[Test 1] Generic Markdown Mode (ENABLE_OBSIDIAN_FEATURES=false)");
    process.env.ENABLE_OBSIDIAN_FEATURES = "false";
    const genericText = wrapAsAiCallout("Hello world", "TestAgent");
    console.log("Wrapped Text:", JSON.stringify(genericText));
    if (genericText === "Hello world") {
        console.log("✅ Generic mode correctly bypassed AI callout");
    } else {
        console.error("❌ Generic mode failed");
    }

    // Test 2: Obsidian mode
    console.log("\n[Test 2] Obsidian Mode (ENABLE_OBSIDIAN_FEATURES=true)");
    process.env.ENABLE_OBSIDIAN_FEATURES = "true";
    process.env.AI_ATTRIBUTION_CALLOUT_TYPE = "ai";
    const obsidianText = wrapAsAiCallout("Hello world", "TestAgent");
    console.log("Wrapped Text:", JSON.stringify(obsidianText));
    if (obsidianText.includes("> [!ai]")) {
        console.log("✅ Obsidian mode correctly added AI callout");
    } else {
        console.error("❌ Obsidian mode failed");
    }

    // Test 3: Fuzzy Path Resolution
    console.log("\n[Test 3] Fuzzy Path Resolution");
    if (!fs.existsSync(process.env.VAULT_PATH)) {
        fs.mkdirSync(process.env.VAULT_PATH, { recursive: true });
    }
    fs.mkdirSync(path.join(process.env.VAULT_PATH, "Nested"), { recursive: true });
    fs.writeFileSync(path.join(process.env.VAULT_PATH, "Nested/MyNote.md"), "test");
    
    const res = resolveFuzzyPath(process.env.VAULT_PATH, "MyNote");
    console.log("Resolution:", res);
    if (res.type === "fuzzy" && res.path.endsWith("MyNote.md")) {
        console.log("✅ Fuzzy resolution found deeply nested note");
    } else {
        console.error("❌ Fuzzy resolution failed");
    }

    // Cleanup
    fs.rmSync(process.env.VAULT_PATH, { recursive: true, force: true });
}

runTests();
