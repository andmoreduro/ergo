import { useEffect, useState } from "react";
import { textSignificantlyEqual } from "../state/ast/commitPolicy";

/**
 * Keeps local plain-text draft in sync while only committing when compiled output
 * would change (edits that only change leading/trailing space stay local).
 */
export const useDeferredTextCommit = (committed: string) => {
    const [draft, setDraft] = useState(committed);

    useEffect(() => {
        setDraft(committed);
    }, [committed]);

    const shouldCommit = (next: string) => !textSignificantlyEqual(next, committed);

    return {
        draft,
        setDraft,
        shouldCommit,
    };
};
