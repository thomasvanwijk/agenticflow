import { pipeline, env } from "@huggingface/transformers";
env.cacheDir = "/app/hf-cache";
const model = "Xenova/jina-embeddings-v2-small-en";
console.log(`Pre-downloading ${model}...`);
await pipeline("feature-extraction", model, { dtype: "q8" });
console.log("Model downloaded successfully.");
