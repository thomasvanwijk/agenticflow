import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// 1. Setup temp dir BEFORE any imports
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agenticflow-cli-test-"));
const originalCwd = process.cwd();

// 2. Mock the config module to point to temp paths
vi.mock("../src/config.js", () => ({
    ENV_FILE: path.join(tempDir, ".env"),
    DEFAULT_SECRETS_FILE: path.join(tempDir, "config/secrets.enc"),
    CONFIG_DIR: path.join(tempDir, "config"),
    ALGORITHM: "aes-256-gcm",
    SALT: "test-salt"
}));

// 3. Mock external dependencies
vi.mock("@napi-rs/keyring", () => {
    return {
        Entry: class {
            setPassword = vi.fn().mockResolvedValue(undefined);
            getPassword = vi.fn().mockResolvedValue("test-password");
        }
    };
});

vi.mock("inquirer", () => ({
    default: {
        prompt: vi.fn().mockResolvedValue({ overwrite: true, master: "test-password", doIndex: false })
    }
}));

vi.mock("ora", () => ({
    default: vi.fn().mockReturnValue({
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
        fail: vi.fn().mockReturnThis(),
        info: vi.fn().mockReturnThis(),
    })
}));

vi.mock("../src/utils/shell.js", () => ({
    runShell: vi.fn().mockReturnValue(true),
    runDockerCompose: vi.fn().mockReturnValue(true),
    handleError: vi.fn()
}));

vi.mock("child_process", () => ({
    execSync: vi.fn().mockReturnValue(Buffer.from("success")),
}));

vi.mock("../src/services/gateway.js", () => ({
    waitForGateway: vi.fn().mockResolvedValue(true)
}));

// Load command AFTER mocks
const { setupAction } = await import("../src/commands/setup.js");

describe("CLI Setup Integration", () => {
    beforeEach(() => {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        fs.mkdirSync(path.join(tempDir, "config"), { recursive: true });

        // Mock a minimal repo structure so execSync doesn't fail
        fs.mkdirSync(path.join(tempDir, "cli"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "cli", "package.json"), "{}");
    });

    afterEach(() => {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
            fs.rmSync(path.join(tempDir, file), { recursive: true, force: true });
        }
        vi.clearAllMocks();
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should generate a .env file with correct vault path and provider", async () => {
        const vaultPath = path.join(tempDir, "my-vault");
        fs.mkdirSync(vaultPath);

        await setupAction({
            vaultPath: vaultPath,
            embedding: "local",
            index: false,
            skipAtlassian: true,
            skipRemote: true,
            masterPassword: "test-password"
        });

        const envFile = path.join(tempDir, ".env");
        expect(fs.existsSync(envFile)).toBe(true);

        const envContents = fs.readFileSync(envFile, "utf8");
        expect(envContents).toContain("VAULT_PATH=");
        expect(envContents).toContain("EMBEDDING_PROVIDER=local");
        expect(envContents).not.toContain("AGENTICFLOW_MASTER_PASSWORD");
    });
});
