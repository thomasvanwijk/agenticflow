import { SemanticSearchCore, createProvider } from "@agenticflow/mcp-semantic-search-core";

const host = process.env.CHROMA_HOST || "chroma";
const port = parseInt(process.env.CHROMA_PORT || "8000", 10);
const providerConfig = {
    provider: (process.env.EMBEDDING_PROVIDER || "local") as "local" | "ollama" | "openai",
    model: process.env.EMBEDDING_MODEL,
    baseUrl: process.env.OLLAMA_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY
};

export const semanticCore = new SemanticSearchCore({ host, port });
export const embeddingProvider = createProvider(providerConfig);

export async function getToolCollection() {
    return semanticCore.getCollection("mcp_tools");
}
