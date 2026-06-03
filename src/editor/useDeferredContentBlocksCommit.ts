import { useEffect, useState } from "react";
import type { RichText } from "../bindings/RichText";
import { contentBlocksSignificantlyEqual } from "./contentBlocks";

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

    const shouldCommit = (next: RichText[][]) =>
        !contentBlocksSignificantlyEqual(next, committed);

    return {
        content: draft,
        setDraft,
        shouldCommit,
    };
};
