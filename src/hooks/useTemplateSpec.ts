import type { TemplateSpec } from "../bindings/TemplateSpec";
import { useTemplateSpecContext } from "../state/TemplateSpecContext";

/** Prefer `useTemplateSpecContext` inside `TemplateSpecProvider`. */
export const useTemplateSpec = (_templateId: string): TemplateSpec | null => {
    return useTemplateSpecContext().spec;
};
