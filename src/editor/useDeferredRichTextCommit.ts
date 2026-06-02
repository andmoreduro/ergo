import { useEffect, useState } from "react";
import type { RichText } from "../bindings/RichText";
import { richTextSignificantlyEqual } from "../state/ast/commitPolicy";

/**
 * Keeps local editor content in sync while only propagating changes that affect
 * compiled output (edits that only change leading/trailing space stay local).
 */
export const useDeferredRichTextCommit = (
    elementId: string,
    committed: RichText[],
) => {
    const [draft, setDraft] = useState(committed);
    const committedKey = JSON.stringify(committed);

    useEffect(() => {
        setDraft(committed);
    }, [elementId, committedKey]);

    const shouldCommit = (next: RichText[]) =>
        !richTextSignificantlyEqual(next, committed);

    return {
        content: draft,
        setDraft,
        shouldCommit,
    };
};
