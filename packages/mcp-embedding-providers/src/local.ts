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
                    
                    if (process.env.AGENTICFLOW_LOW_RESOURCE_MODE === "true") {
                        console.info("[LocalProvider] Low resource mode enabled. Limiting ONNX threads to 1.");
                        if (env.backends?.onnx) {
                            if ((env.backends.onnx as any).wasm) {
                                (env.backends.onnx as any).wasm.numThreads = 1;
                            }
                            // Also set the native thread limits in case the native backend is used.
                            (env.backends.onnx as any).intra_op_num_threads = 1;
                            (env.backends.onnx as any).inter_op_num_threads = 1;
                        }
                    }

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
