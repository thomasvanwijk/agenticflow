
import { generateEmbedding } from './src/providers/index.js';
import { logger } from './src/utils/logger.js';

console.log("Starting embedding test with top-level await...");
try {
    const start = Date.now();
    const embedding = await generateEmbedding("test query");
    const end = Date.now();
    console.log(`Embedding generated in ${end - start}ms`);
    console.log(`Embedding length: ${embedding.length}`);
} catch (err) {
    console.error("Embedding failed:", err);
}
console.log("Test script finished.");
process.exit(0);
