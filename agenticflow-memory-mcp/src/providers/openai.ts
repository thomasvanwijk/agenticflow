import { OPENAI_API_KEY } from "../config.js";
import { EmbeddingProvider } from "../types.js";

export class OpenAIProvider implements EmbeddingProvider {
    async generate(text: string): Promise<number[]> {
        if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");
        try {
            const res = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8192) }),
                signal: AbortSignal.timeout(15000),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`OpenAI HTTP ${res.status}: ${errorText}`);
            }

            const json = (await res.json()) as { data: { embedding: number[] }[] };
            return json.data[0].embedding;
        } catch (err) {
            process.stderr.write(`TRACE: OpenAI error: ${(err as Error).stack || (err as Error).message}\n`);
            throw new Error(`OpenAI provider failed: ${(err as Error).message}`);
        }
    }
}
