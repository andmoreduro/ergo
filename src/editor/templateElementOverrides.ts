import type { ElementOverrideSpec } from "../bindings/ElementOverrideSpec";
import type { ExtraFieldSpec } from "../bindings/ExtraFieldSpec";
import { m } from "../paraglide/messages.js";

/** Typst function wrapping table and image elements (defaults to `figure`). */
export const elementFigureWrapperName = (
    spec: ElementOverrideSpec | null | undefined,
): string => spec?.wrapper ?? spec?.function ?? "figure";

export const usesStandardTypstFigureWrapper = (
    spec: ElementOverrideSpec | null | undefined,
): boolean => elementFigureWrapperName(spec) === "figure";

const templateExtraFields = (
    spec: ElementOverrideSpec | null | undefined,
): ExtraFieldSpec[] => spec?.extra_fields ?? [];

/** Figure/diagram annotation fields: template override, or engine defaults for `#figure`. */
export const effectiveFigureAnnotationFields = (
    spec: ElementOverrideSpec | null | undefined,
): ExtraFieldSpec[] => {
    const fromTemplate = templateExtraFields(spec);
    if (fromTemplate.length > 0) {
        return fromTemplate;
    }
    if (!usesStandardTypstFigureWrapper(spec)) {
        return [];
    }
    return [
        {
            key: "caption",
            type: "content",
            label: m.editor_figure_caption(),
        },
    ];
};

/** Table annotation fields (caption, notes, …): template override, or engine defaults for `#figure`. */
export const effectiveTableExtraFields = (
    spec: ElementOverrideSpec | null | undefined,
): ExtraFieldSpec[] => {
    const fromTemplate = templateExtraFields(spec);
    if (fromTemplate.length > 0) {
        return fromTemplate;
    }
    if (!usesStandardTypstFigureWrapper(spec)) {
        return [];
    }
    return [
        {
            key: "caption",
            type: "content",
            label: m.editor_figure_caption(),
        },
        {
            key: "placement",
            type: "string",
            label: m.editor_table_placement(),
        },
    ];
};
