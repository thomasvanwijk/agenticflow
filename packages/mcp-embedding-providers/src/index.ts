import { EmbeddingProvider, ProviderConfig } from "./types.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAIProvider } from "./openai.js";
import { LocalProvider } from "./local.js";

export * from "./types.js";
export * from "./local.js";
export * from "./ollama.js";
export * from "./openai.js";

export function createProvider(config: ProviderConfig): EmbeddingProvider {
    if (config.provider === "openai") {
        if (!config.apiKey) throw new Error("apiKey is required for OpenAI provider.");
        return new OpenAIProvider(config.apiKey, config.model || "text-embedding-3-small");
    }
    if (config.provider === "local") {
        return new LocalProvider(config.model);
    }
    if (config.provider === "ollama") {
        return new OllamaProvider(config.baseUrl || "http://127.0.0.1:11434", config.model || "nomic-embed-text");
    }
    throw new Error(`Unsupported provider: ${config.provider}`);
}
