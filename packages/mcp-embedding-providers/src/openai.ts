import { EmbeddingProvider } from "./types.js";

export class OpenAIProvider implements EmbeddingProvider {
    constructor(private apiKey: string, private model: string = "text-embedding-3-small") {}

    async generate(text: string): Promise<number[]> {
        if (!this.apiKey) throw new Error("apiKey is not set.");
        try {
            const res = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({ model: this.model, input: text.slice(0, 8192) }),
                signal: AbortSignal.timeout(15000),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`OpenAI HTTP ${res.status}: ${errorText}`);
            }

            const json = (await res.json()) as { data: { embedding: number[] }[] };
            return json.data[0].embedding;
        } catch (err) {
            throw new Error(`OpenAI provider failed: ${(err as Error).message}`);
        }
    }
}
