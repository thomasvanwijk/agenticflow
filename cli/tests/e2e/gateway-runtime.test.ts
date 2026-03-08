import { execSync } from "child_process";
import { describe, it, expect } from "vitest";

describe("Gateway Runtime Executables", () => {
    it("should have npx available", () => {
        const output = execSync("docker exec agenticflow-gateway npx --version").toString();
        expect(output).toMatch(/^\d+\.\d+\.\d+/); // e.g. "10.9.2"
    });

    it("should have uvx available", () => {
        const output = execSync("docker exec agenticflow-gateway uvx --version").toString();
        expect(output).toContain("uv"); // e.g. "uv 0.1.25"
    });

    it("should have python3 available", () => {
        const output = execSync("docker exec agenticflow-gateway python3 --version").toString();
        expect(output).toContain("Python 3"); // e.g. "Python 3.11.2"
    });
});
