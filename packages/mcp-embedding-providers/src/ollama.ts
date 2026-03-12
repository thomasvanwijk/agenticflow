import { EmbeddingProvider } from "./types.js";

export class OllamaProvider implements EmbeddingProvider {
    constructor(private baseUrl: string = "http://127.0.0.1:11434", private model: string = "nomic-embed-text") {}

    async generate(text: string): Promise<number[]> {
        try {
            const res = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: this.model, prompt: text.slice(0, 8192) }),
                signal: AbortSignal.timeout(30000), // 30s timeout
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Ollama HTTP ${res.status}: ${errorText}`);
            }

            const json = (await res.json()) as { embedding?: number[]; embeddings?: number[][] };
            const emb = json.embedding ?? json.embeddings?.[0];

            if (!Array.isArray(emb) || emb.length === 0) {
                throw new Error(`Invalid response from Ollama: ${JSON.stringify(json).slice(0, 200)}`);
            }

            return emb;
        } catch (err) {
            throw new Error(`Ollama provider failed: ${(err as Error).message}`);
        }
    }
}
