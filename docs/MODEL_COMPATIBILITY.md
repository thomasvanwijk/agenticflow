# Model Compatibility & Behavior Insights

The performance and reliability of `agenticflow` tools can vary depending on the LLM (Large Language Model) used by your AI assistant. Below are community-reported insights for various models:

## Summary Table

| Model Family | Version / Provider | Status | Key Observations |
| :--- | :--- | :--- | :--- |
| **Claude** | Claude 3.5 Sonnet (v2) | ✅ Excellent | Handles tool discovery and execution seamlessly. Proactively searches before reading. |
| **Claude** | Claude 3.5 Sonnet (Perplexity 4.6) | ✅ Excellent | Stable performance. |
| **Gemini** | Gemini 1.5 Pro (v3.1) | ✅ Good | Works as expected with standard tool calls. |
| **Sonar** | Perplexity Sonar | ✅ Improved | Previously struggled with paths, but structural "Fuzzy Path" fixes now allow it to use bare filenames successfully. |
| **GPT** | GPT-4o / GPT-5 (v5.4) | ⚠️ Fair | Tends to ask for clarification. Fuzzy path fixes help, but it may still pause for user input on new note locations. |

## Detailed Insights & Structural Fixes

To resolve the discrepancies in how models handle file paths, we have implemented **Structural Fuzzy Path Resolution** in the server backend.

### The Fix: Structural Forgiveness
Instead of requiring a strict, full path (e.g., `Projects/Active/Meeting.md`), the `get_note`, `update_note`, and `append_to_note` tools now:
1.  **Auto-append `.md`**: If the model provides `Meeting`, the server tries `Meeting.md`.
2.  **Fuzzy Filename Search**: If the exact path is not found, the server scans the entire vault for a matching filename. If a single match is found (e.g., in a deep subfolder), it resolves it automatically.
3.  **Ambiguity Handling**: If multiple files share the same name, the tool returns a list of valid paths, helping the model correct its call.

### Model-Specific Behavior after Fixes

#### Sonar (Perplexity)
Sonar is now much more reliable. Even when it "guesses" a filename without the folder prefix, the server backend resolves the correct path seamlessly.

#### Claude
Claude continues to perform excellently. The structural fixes provide a safety net for any hallucinations regarding folder structures during note creation.

#### GPT-5.4 (Experimental)
While the fuzzy path resolution helps GPT-5.4 succeed more often, this model still has a high "caution" threshold and may ask for path clarification before attempting a tool call. Providing a clear "Inbox" folder in your prompt can help guide it.

### Gemini 3.1 Pro
Highly compatible with the MCP spec used in `agenticflow`. It effectively utilizes the `discover_tools` step to identify available actions.

---
*Note: These insights are based on user reports and may change as models are updated. If you encounter different behavior, please report it!*
