import * as config from "../config.js";

/**
 * Wraps content in an Obsidian AI callout if enabled.
 */
export function wrapAsAiCallout(content: string, aiModel: string | undefined): string {
    if (!config.AI_ATTRIBUTION_ENABLED || !content.trim()) {
        return content;
    }

    if (content.trim().startsWith(`> [!${config.AI_ATTRIBUTION_CALLOUT_TYPE}]`)) {
        return content;
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const titleParts: string[] = [];
    
    if (config.AI_ATTRIBUTION_INCLUDE_MODEL && aiModel) {
        titleParts.push(aiModel);
    }
    if (config.AI_ATTRIBUTION_INCLUDE_DATE) {
        titleParts.push(dateStr);
    }

    const title = titleParts.length > 0 ? ` ${titleParts.join(" · ")}` : "";
    const calloutHeader = `> [!${config.AI_ATTRIBUTION_CALLOUT_TYPE}]${title}\n`;

    const wrappedLines = content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");

    return `${calloutHeader}${wrappedLines}`;
}

/**
 * Regex to match frontmatter.
 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Safely adds an AI model to the 'contributors' frontmatter property using manual string manipulation
 * to avoid corrupting Obsidian-specific YAML like [[Links]].
 */
export function addContributorToFrontmatter(
    fileContent: string,
    aiModel: string | undefined
): string {
    if (!config.AI_ATTRIBUTION_ENABLED || !aiModel) {
        return fileContent;
    }

    const match = fileContent.match(FRONTMATTER_REGEX);
    if (!match) {
        // No frontmatter, create it
        return `---\ncontributors:\n  - ${aiModel}\n---\n\n${fileContent.trim()}`;
    }

    const yaml = match[1];
    const lines = yaml.split("\n");
    
    let contributorsLineIndex = -1;
    let inContributorsList = false;
    let contributors: string[] = [];

    // Find contributors property
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("contributors:")) {
            contributorsLineIndex = i;
            inContributorsList = true;
            continue;
        }
        
        if (inContributorsList) {
            // Check if we are still in the contributors list (starts with indentation and -)
            if (line.match(/^\s+-\s+/)) {
                contributors.push(line.replace(/^\s+-\s+/, "").trim().replace(/^["'](.*)["']$/, "$1"));
            } else if (line.trim() === "" || line.match(/^\s/)) {
                // empty line or just indented line, stay in list mode but check next
                continue;
            } else {
                inContributorsList = false;
            }
        }
    }

    if (contributorsLineIndex === -1) {
        // Add contributors property
        const newYaml = yaml.trimEnd() + `\ncontributors:\n  - ${aiModel}`;
        return fileContent.replace(yaml, newYaml);
    }

    // Check if model already exists
    if (contributors.includes(aiModel)) {
        return fileContent;
    }

    // Append to existing contributors list
    const newLines = [...lines];
    newLines.splice(contributorsLineIndex + 1, 0, `  - ${aiModel}`);
    const newYaml = newLines.join("\n");
    
    return fileContent.replace(yaml, newYaml);
}

/**
 * Merges new frontmatter with existing, ensuring contributors are tracked.
 * Used for create_note where we have a clean object initially.
 */
export function mergeFrontmatterWithContributor(
    existing: Record<string, any>,
    added: Record<string, any> | undefined,
    aiModel: string | undefined
): Record<string, any> {
    const merged = { ...existing, ...(added || {}) };

    if (config.AI_ATTRIBUTION_ENABLED && aiModel) {
        let contributors = merged.contributors || [];
        if (!Array.isArray(contributors)) {
            contributors = typeof contributors === "string" ? [contributors] : [];
        }
        
        if (!contributors.includes(aiModel)) {
            contributors.push(aiModel);
        }
        merged.contributors = contributors;
    }

    return merged;
}

/**
 * Custom stringifier for frontmatter that respects Obsidian wiki-links [[Link]] 
 * by NOT quoting them.
 */
export function stringifyWithLinks(content: string, data: Record<string, any>): string {
    let yaml = "---\n";
    for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
            yaml += `${key}:\n`;
            value.forEach(v => {
                // JSON.stringify will double-quote strings, which is perfect for Obsidian links
                yaml += `  - ${JSON.stringify(v)}\n`;
            });
        } else if (typeof value === "string" && value.startsWith("[[")) {
            // Explicitly quote the link
            yaml += `${key}: "${value}"\n`;
        } else {
            // Use JSON.stringify for safety on all values (handles spaces and special chars)
            yaml += `${key}: ${JSON.stringify(value)}\n`;
        }
    }
    yaml += "---\n\n";
    return yaml + content;
}
