import { EMBEDDING_MODEL } from "../config.js";
import { EmbeddingProvider } from "../types.js";
import { logger } from "../utils/logger.js";

export class LocalProvider implements EmbeddingProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static pipeline: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static initPromise: Promise<any> | null = null;

    async generate(text: string): Promise<number[]> {
        if (!LocalProvider.pipeline) {
            if (!LocalProvider.initPromise) {
                LocalProvider.initPromise = (async () => {
                    const { pipeline, env } = await import("@huggingface/transformers");
                    // Cache models in a writable directory inside the container
                    env.cacheDir = "/tmp/hf-cache";
                    const model = EMBEDDING_MODEL !== "nomic-embed-text" ? EMBEDDING_MODEL : "Xenova/all-MiniLM-L6-v2";
                    logger.info("Loading local embedding model", { model });
                    // onnxruntime-node (native binary, glibc-dependent) is replaced with onnxruntime-web
                    // (pure WASM) in the Docker build — works on Alpine Linux without glibc.
                    const loadedPipeline = await pipeline("feature-extraction", model, { dtype: "q8" });
                    logger.info("Local embedding model loaded");
                    return loadedPipeline;
                })();
            }
            LocalProvider.pipeline = await LocalProvider.initPromise;
        }
        const output = await LocalProvider.pipeline(text.slice(0, 4096), { pooling: "mean", normalize: true });
        return Array.from(output.data as Float32Array);
    }
}
