import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Mock the config module to use a temp .env path
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "af-env-test-"));
const tempEnv = path.join(tempDir, ".env");

vi.mock("../config.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ENV_FILE: tempEnv,
    };
});

const { envService } = await import("./env.js");

describe("EnvService", () => {
    afterEach(() => {
        if (fs.existsSync(tempEnv)) fs.unlinkSync(tempEnv);
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should load empty object if .env does not exist", () => {
        expect(envService.load()).toEqual({});
    });

    it("should save and load variables correctly", () => {
        const vars = { KEY: "VALUE", PORT: "123" };
        envService.save(vars);
        expect(envService.load()).toEqual(vars);
    });

    it("should quote values with $ signs", () => {
        const vars = { PASS: "secret$123" };
        envService.save(vars);
        const content = fs.readFileSync(tempEnv, "utf8");
        expect(content).toContain("PASS='secret$123'");
    });

    it("should merge updates", () => {
        envService.save({ A: "1" });
        envService.update({ B: "2" });
        expect(envService.load()).toEqual({ A: "1", B: "2" });
    });
});
