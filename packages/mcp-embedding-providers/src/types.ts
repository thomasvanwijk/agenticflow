export interface EmbeddingProvider {
    generate(text: string): Promise<number[]>;
}

export interface ProviderConfig {
    provider: "openai" | "local" | "ollama";
    model?: string;
    apiKey?: string;
    baseUrl?: string;
}
