import matter from "gray-matter";
import * as config from "../config.js";

/**
 * Wraps content in an Obsidian AI callout if enabled.
 * 
 * Heuristics:
 * - Does not wrap frontmatter (should be called on content only).
 * - Maintain > prefix on every line (including empty lines) to prevent rendering breakage.
 * - Prevents double-wrapping if the content already looks like an AI callout.
 * - Does not wrap pure structural elements if they look like task list items or headings 
 *   (though usually the AI provides the prose it wants wrapped).
 */
export function wrapAsAiCallout(content: string, aiModel: string | undefined): string {
    if (!config.AI_ATTRIBUTION_ENABLED || !content.trim()) {
        return content;
    }

    // Heuristic: If it's a single task item (e.g. "- [ ] ...") or a heading only, 
    // we might skip wrapping if it's considered "structural".
    // However, the spec says "prose". For now, we wrap everything passed to us 
    // as it represents the "AI contribution" for that specific tool call.
    
    // Avoid double wrapping if it already starts with an AI callout
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

    // Prefix every line with "> " to ensure the callout doesn't break on empty lines.
    // We also handle the "Angle Bracket Bug" by ensuring triple backticks wrap 
    // code-like content (the LLM is expected to do this, but we ensure the > prefix 
    // is maintained on those lines too).
    const wrappedLines = content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");

    return `${calloutHeader}${wrappedLines}`;
}

/**
 * Safely adds an AI model to the 'contributors' frontmatter property.
 */
export function addContributorToFrontmatter(
    existingContent: string,
    aiModel: string | undefined
): string {
    if (!config.AI_ATTRIBUTION_ENABLED || !aiModel) {
        return existingContent;
    }

    try {
        const { data, content } = matter(existingContent);
        const contributors = data.contributors || [];

        if (Array.isArray(contributors)) {
            if (!contributors.includes(aiModel)) {
                contributors.push(aiModel);
            }
            data.contributors = contributors;
        } else if (typeof contributors === "string") {
            if (contributors !== aiModel) {
                data.contributors = [contributors, aiModel];
            }
        } else {
            data.contributors = [aiModel];
        }

        return matter.stringify(content, data);
    } catch (err) {
        // If frontmatter parsing fails, return as is (safer than corrupting)
        return existingContent;
    }
}

/**
 * Merges new frontmatter with existing, ensuring contributors are tracked.
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
