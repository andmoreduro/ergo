import type { RichText } from "../bindings/RichText";
import { createRichText } from "../state/ast/defaults";

export const REFERENCE_KIND = "reference";

export const pathIdForId = (id: string): string => {
    let normalized = "";
    let prevDash = false;
    for (const ch of id.toLowerCase()) {
        const next =
            (ch >= "a" && ch <= "z") ||
            (ch >= "0" && ch <= "9") ||
            ch === "_"
                ? ch
                : "-";
        if (next === "-" && prevDash) {
            continue;
        }
        normalized += next;
        prevDash = next === "-";
    }
    return normalized.replace(/^-+|-+$/g, "");
};

export const labelForReferenceId = (id: string): string => {
    const normalized = pathIdForId(id);
    return normalized.length > 0 ? `ergo-${normalized}` : "ergo-element";
};

export const createReferenceSpan = (
    referenceId: string,
    label: string,
): RichText => ({
    text: label,
    bold: null,
    italic: null,
    kind: REFERENCE_KIND,
    reference_id: referenceId,
    equation_source: null,
});

export const isReferenceSpan = (span: RichText): boolean =>
    span.kind === REFERENCE_KIND && Boolean(span.reference_id);

export const richTextPlainLength = (content: readonly RichText[]): number =>
    content.reduce(
        (total, span) =>
            total + (isReferenceSpan(span) ? 0 : [...span.text].length),
        0,
    );

export const insertReferenceAtOffset = (
    content: readonly RichText[],
    offset: number,
    referenceId: string,
    label: string,
): RichText[] => {
    const safeOffset = Math.max(0, Math.min(offset, richTextPlainLength(content)));
    const referenceSpan = createReferenceSpan(referenceId, label);
    const next: RichText[] = [];
    let cursor = 0;

    for (const span of content) {
        if (isReferenceSpan(span)) {
            next.push(span);
            continue;
        }

        const spanLength = [...span.text].length;
        const spanStart = cursor;
        const spanEnd = cursor + spanLength;

        if (safeOffset <= spanStart) {
            next.push(span);
            cursor = spanEnd;
            continue;
        }

        if (safeOffset >= spanEnd) {
            next.push(span);
            cursor = spanEnd;
            continue;
        }

        const localOffset = safeOffset - spanStart;
        const chars = [...span.text];
        const before = chars.slice(0, localOffset).join("");
        const after = chars.slice(localOffset).join("");

        if (before) {
            next.push({ ...span, text: before });
        }
        next.push(referenceSpan);
        if (after) {
            next.push({ ...span, text: after });
        }

        cursor = spanEnd;
    }

    if (safeOffset >= cursor) {
        next.push(referenceSpan);
    }

    return mergeAdjacentTextSpans(next);
};

const mergeAdjacentTextSpans = (content: RichText[]): RichText[] => {
    const merged: RichText[] = [];

    for (const span of content) {
        if (isReferenceSpan(span)) {
            merged.push(span);
            continue;
        }

        const previous = merged[merged.length - 1];
        if (
            previous &&
            !isReferenceSpan(previous) &&
            previous.bold === span.bold &&
            previous.italic === span.italic
        ) {
            previous.text += span.text;
            continue;
        }

        if (span.text.length === 0) {
            continue;
        }

        merged.push({ ...span });
    }

    return merged.length > 0 ? merged : [createRichText("")];
};

export const richTextFromPlainText = (text: string): RichText[] =>
    text.length > 0 ? [createRichText(text)] : [];

export const richTextToPlainText = (content: readonly RichText[]): string =>
    content
        .map((span) => (isReferenceSpan(span) ? "" : span.text))
        .join("");

export const parseRichTextFromEditableRoot = (root: HTMLElement): RichText[] => {
    const spans: RichText[] = [];

    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? "";
            if (text.length > 0) {
                spans.push(createRichText(text));
            }
            return;
        }

        if (!(node instanceof HTMLElement)) {
            return;
        }

        if (node.dataset.referenceId) {
            spans.push(
                createReferenceSpan(
                    node.dataset.referenceId,
                    node.dataset.referenceLabel ?? node.textContent ?? "",
                ),
            );
            return;
        }

        node.childNodes.forEach(walk);
    };

    root.childNodes.forEach(walk);
    return mergeAdjacentTextSpans(spans);
};

export const renderRichTextToEditableHtml = (content: readonly RichText[]): string => {
    if (content.length === 0) {
        return "";
    }

    return content
        .map((span) => {
            if (isReferenceSpan(span) && span.reference_id) {
                const label = span.text || labelForReferenceId(span.reference_id);
                return `<span class="ergo-ref-chip" contenteditable="false" data-reference-id="${escapeHtml(
                    span.reference_id,
                )}" data-reference-label="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
            }

            return escapeHtml(span.text);
        })
        .join("");
};

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

export const caretPlainOffsetFromSelection = (
    root: HTMLElement,
    selection: Selection,
): number | null => {
    if (!selection.rangeCount) {
        return null;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
        return null;
    }

    const probe = range.cloneRange();
    probe.selectNodeContents(root);
    probe.setEnd(range.startContainer, range.startOffset);

    const fragment = probe.cloneContents();
    let offset = 0;
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            offset += (node.textContent ?? "").length;
            return;
        }

        if (node instanceof HTMLElement && node.dataset.referenceId) {
            return;
        }

        node.childNodes.forEach(walk);
    };

    fragment.childNodes.forEach(walk);
    return offset;
};

export const insertTextAtCaret = (
    value: string,
    caretOffset: number | null,
    insertText: string,
): { nextValue: string; nextCaret: number } => {
    const offset = caretOffset ?? value.length;
    const safeOffset = Math.max(0, Math.min(offset, value.length));
    const nextValue =
        value.slice(0, safeOffset) + insertText + value.slice(safeOffset);
    const nextCaret = safeOffset + insertText.length;
    return { nextValue, nextCaret };
};
