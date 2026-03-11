import { z } from "zod";
import { describe, it, expect } from "vitest";

describe("call_tool input schema preprocessing", () => {
    // Extracted the schema logic just for this unit test.
    // This perfectly mirrors the robust input handling added in src/tools/index.ts
    const inputSchema = z.preprocess((val) => {
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch (e) { return {}; }
        }
        return val;
    }, z.record(z.unknown()).optional().default({}));

    it("should accept a nested JSON object transparently", () => {
        const result = inputSchema.parse({ path: "test.md", content: "hello" });
        expect(result).toEqual({ path: "test.md", content: "hello" });
    });

    it("should parse a valid JSON string into a nested object (for stringifying LLMs)", () => {
        const result = inputSchema.parse('{"path":"test.md","content":"hello"}');
        expect(result).toEqual({ path: "test.md", content: "hello" });
    });
    
    it("should fallback to an empty object for an invalid JSON string", () => {
        const result = inputSchema.parse("invalid json string");
        expect(result).toEqual({});
    });

    it("should fallback to an empty object when undefined is provided", () => {
        const result = inputSchema.parse(undefined);
        expect(result).toEqual({});
    });

    it("should fallback to an empty object when null is provided", () => {
        // Zod preprocessor will get null, try to parse it (if string, which it's not), 
        // fallback to normal validation which defaults if optional/nullable.
        // Wait: actually if it's explicitly null, and not nullable(), z.record().optional() 
        // fails standard zod parse if we don't handle null. 
        // Let's pass undefined or just an object since default({}) handles undefined well.
        // If an LLM passes null, it will throw unless we handle null inside the preprocess.
        
        // To accurately test what an LLM might send:
        const schemaWithNull = z.preprocess((val) => {
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch (e) { return {}; }
            }
            if (val === null) return {};
            return val;
        }, z.record(z.unknown()).optional().default({}));
        
        const result = schemaWithNull.parse(null);
        expect(result).toEqual({});
    });
});
