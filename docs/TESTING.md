# Testing Conventions

This document outlines the testing standards and directory structures for the `agenticflow` project.

## Directory Structure

We use a hybrid approach to separate fine-grained logic tests from broad system tests.

### 1. Unit Tests (Alongside Source)
Unit tests should live in the **same directory** as the file they are testing. 
- **Pattern**: `src/**/[filename].test.ts`
- **Purpose**: Testing individual functions, classes, and logic in isolation.
- **Benefits**: High visibility, encourages "test-driven" development, and makes it easy to find tests for a specific module.

### 2. Integration & E2E Tests (Separate Folder)
Tests that involve multiple modules, filesystem interaction, or network calls live in a dedicated `tests/` directory at the component root.
- **Pattern**: `tests/[feature].test.ts`
- **Purpose**: Testing the "Happy Path" across various services, verifying system integration.
- **Benefits**: Keeps the `src/` directory focused on production code; simplifies setup/teardown for complex environment mocks.

---

## Tooling: Vitest

We use **Vitest** across all TypeScript components.
- **Fast**: Blazing fast initial load and HMR.
- **ESM-First**: Native support for ESM (which the MCP server uses).
- **Compatible**: 1:1 compatible with the Jest API, making migration easy.

---

## Testing Level Definitions

| Type | Location | Mocking | Goal |
| :--- | :--- | :--- | :--- |
| **Unit** | `src/*.test.ts` | Extensive | Verify logic of a single function. |
| **Integration** | `tests/*.test.ts` | Partial (external APIs) | Verify that `Indexer` + `Chroma` + `Provider` work together. |
| **E2E** | `tests/*.test.ts` | Minimal (Docker/Shell) | Verify the CLI can correctly scaffold a project. |

---

## Best Practices
1. **Deterministic Tests**: Tests should not fail based on time, random numbers, or external internet availability (mock these!).
2. **Clean State**: Always use temporary directories for filesystem tests.
3. **No Side Effects**: Ensure tests don't leave artifacts behind.
