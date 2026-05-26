import { useEffect, useState } from "react";
import type { RichText } from "../bindings/RichText";
import { richTextPlainText } from "../state/documentEvents/helpers";
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
    const committedPlainText = richTextPlainText(committed);

    useEffect(() => {
        setDraft(committed);
    }, [elementId, committedPlainText]);

    const shouldCommit = (next: RichText[]) =>
        !richTextSignificantlyEqual(next, committed);

    return {
        content: draft,
        setDraft,
        shouldCommit,
    };
};
