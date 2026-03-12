import { describe, it, expect } from "vitest";

describe("call_tool input schema manual parsing", () => {
    // Extracted the manual parsing logic added to src/tools/index.ts
    // to replace the Zod preprocessor, which caused issues with strict LLM APIs (like Gemini).
    function parseInput(rawInput: any): any {
        let input = rawInput;
        if (typeof input === 'string') {
            try { input = JSON.parse(input); } catch (e) { input = {}; }
        }
        if (input === null || input === undefined) { input = {}; }
        return input;
    }

    it("should accept a nested JSON object transparently (if passed programmatically)", () => {
        const result = parseInput({ path: "test.md", content: "hello" });
        expect(result).toEqual({ path: "test.md", content: "hello" });
    });

    it("should parse a valid JSON string into a nested object (expected LLM stringified input)", () => {
        const result = parseInput('{"path":"test.md","content":"hello"}');
        expect(result).toEqual({ path: "test.md", content: "hello" });
    });
    
    it("should fallback to an empty object for an invalid JSON string", () => {
        const result = parseInput("invalid json string");
        expect(result).toEqual({});
    });

    it("should fallback to an empty object when undefined is provided", () => {
        const result = parseInput(undefined);
        expect(result).toEqual({});
    });

    it("should fallback to an empty object when null is provided", () => {
        const result = parseInput(null);
        expect(result).toEqual({});
    });
});
