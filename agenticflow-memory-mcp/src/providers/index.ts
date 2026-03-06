import { EMBEDDING_PROVIDER } from "../config.js";
import { EmbeddingProvider } from "../types.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAIProvider } from "./openai.js";
import { LocalProvider } from "./local.js";

export function getProvider(): EmbeddingProvider {
    if (EMBEDDING_PROVIDER === "openai") return new OpenAIProvider();
    if (EMBEDDING_PROVIDER === "local") return new LocalProvider();
    return new OllamaProvider();
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const provider = getProvider();
    return provider.generate(text);
}
