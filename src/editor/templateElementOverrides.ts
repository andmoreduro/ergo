import type { ElementOverrideSpec } from "../bindings/ElementOverrideSpec";

/** Typst function wrapping table and image elements (defaults to `figure`). */
export const elementFigureWrapperName = (
    spec: ElementOverrideSpec | null | undefined,
): string => spec?.wrapper ?? spec?.function ?? "figure";

export const usesStandardTypstFigureWrapper = (
    spec: ElementOverrideSpec | null | undefined,
): boolean => elementFigureWrapperName(spec) === "figure";
