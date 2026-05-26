import type { DocumentElement } from "../bindings/DocumentElement";
import type { ExtraFieldSpec } from "../bindings/ExtraFieldSpec";

type FigureElement = Extract<DocumentElement, { type: "Figure" }>;
type TableElement = Extract<DocumentElement, { type: "Table" }>;
export type WrapperHostElement = FigureElement | TableElement;

/** Figure captions live on `Figure.caption`; tables use `extra_fields.caption`. */
export const wrapperFieldValue = (
    element: WrapperHostElement,
    key: string,
): string => {
    if (element.type === "Figure" && key === "caption") {
        return element.caption;
    }
    return String(element.extra_fields?.[key] ?? "");
};

export const wrapperFieldDraftValues = (
    element: WrapperHostElement,
    fields: ExtraFieldSpec[],
): Record<string, string> => {
    const draft: Record<string, string> = {};
    for (const field of fields) {
        draft[field.key] = wrapperFieldValue(element, field.key);
    }
    return draft;
};
