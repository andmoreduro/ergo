import type { Importance } from "../bindings/Importance";
import type { FieldImportance } from "../components/atoms/FieldLabel/FieldLabel";

/** Only required fields show a label marker in the UI. */
export const fieldLabelImportance = (
    importance: Importance | null | undefined,
): FieldImportance | undefined =>
    importance === "required" ? "required" : undefined;
