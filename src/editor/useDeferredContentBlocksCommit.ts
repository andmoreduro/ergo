import { useEffect, useState } from "react";
import type { RichText } from "../bindings/RichText";
import {
    contentBlocksSignificantlyEqual,
    finalizeContentBlocks,
    shouldDeferContentBlocksCommit,
} from "./contentBlocks";
import { normalizeRichTextContent } from "./textInput";

/**
 * Multi-paragraph counterpart to `useDeferredRichTextCommit`: keeps local editor
 * paragraphs in sync while only propagating changes that affect compiled output.
 */
export const useDeferredContentBlocksCommit = (
    elementId: string,
    committed: RichText[][],
) => {
    const [draft, setDraft] = useState(committed);
    const committedKey = JSON.stringify(committed);

    useEffect(() => {
        setDraft(committed);
    }, [elementId, committedKey]);

    const shouldCommit = (next: RichText[][]) => {
        const normalized = next.map((paragraph) =>
            normalizeRichTextContent(paragraph),
        );
        if (shouldDeferContentBlocksCommit(normalized, committed)) {
            return false;
        }
        return !contentBlocksSignificantlyEqual(
            finalizeContentBlocks(normalized),
            finalizeContentBlocks(committed),
        );
    };

    return {
        content: draft,
        setDraft,
        shouldCommit,
    };
};
