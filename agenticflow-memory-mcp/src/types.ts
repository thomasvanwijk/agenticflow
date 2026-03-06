export interface EmbeddingProvider {
    generate(text: string): Promise<number[]>;
}

export interface NoteData {
    content: string;
    data: Record<string, unknown>;
    excerpt: string;
}
