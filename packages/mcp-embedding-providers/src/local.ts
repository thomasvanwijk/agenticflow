import { EmbeddingProvider } from "./types.js";

export class LocalProvider implements EmbeddingProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static pipeline: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static initPromise: Promise<any> | null = null;
    private model: string;

    constructor(model?: string) {
        this.model = model && model !== "nomic-embed-text" ? model : "Xenova/all-MiniLM-L6-v2";
    }

    async generate(text: string): Promise<number[]> {
        if (!LocalProvider.pipeline) {
            if (!LocalProvider.initPromise) {
                LocalProvider.initPromise = (async () => {
                    const { pipeline, env } = await import("@huggingface/transformers");
                    env.cacheDir = process.env.TRANSFORMERS_CACHE || "/app/hf-cache";
                    console.info(`[LocalProvider] Loading local embedding model: ${this.model}`);
                    const loadedPipeline = await pipeline("feature-extraction", this.model, { dtype: "q8" });
                    console.info(`[LocalProvider] Local embedding model loaded.`);
                    return loadedPipeline;
                })();
            }
            LocalProvider.pipeline = await LocalProvider.initPromise;
        }
        const output = await LocalProvider.pipeline(text.slice(0, 4096), { pooling: "mean", normalize: true });
        return Array.from(output.data as Float32Array);
    }
}
