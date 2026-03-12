# @agenticflow/mcp-embedding-providers

This module exposes a standardized `EmbeddingProvider` interface and contains concrete implementations for generating embeddings using:
- **Local (CPU/Transformer)** via `@huggingface/transformers`
- **Ollama**
- **OpenAI**

## Usage

```typescript
import { createProvider, ProviderConfig } from "@agenticflow/mcp-embedding-providers";

const config: ProviderConfig = {
    provider: "openai",
    apiKey: "sk-...",
    model: "text-embedding-3-small"
};

const provider = createProvider(config);
const embedding = await provider.generate("Hello world");
// -> [0.012, -0.003, ...]
```
