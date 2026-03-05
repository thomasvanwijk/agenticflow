import { pipeline, env } from "@huggingface/transformers";

async function test() {
    console.log("Setting up env...");
    env.cacheDir = "/tmp/hf-cache";

    console.log("Loading model...");
    const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });

    console.log("Generating embedding...");
    const result = await embedder("This is a test document.", { pooling: "mean", normalize: true });

    console.log("Embedding generated successfully!");
    console.log("Dimensions:", Array.from(result.data).length);
}

test().catch(console.error);
