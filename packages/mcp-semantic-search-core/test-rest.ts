import { SemanticSearchCore } from "./src/index.js";

async function runTest() {
    const core = new SemanticSearchCore({ host: "localhost", port: 8000 });
    await core.createRestApi(3001);

    try {
        const res = await fetch("http://localhost:3001/api/collections");
        console.log("GET /api/collections -> Status:", res.status);
        const text = await res.text();
        console.log("Response:", text);
    } catch (e) {
        console.error("Test failed to fetch", e);
    }
    process.exit(0);
}

runTest();
