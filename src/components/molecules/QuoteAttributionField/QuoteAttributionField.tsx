import type { ChangeEvent } from "react";
import type { ReferenceEntry } from "../../../bindings/ReferenceEntry";
import { formatReferenceCitation } from "../../../bibliography/biblatex";
import {
    quoteAttributionMode,
    type QuoteAttributionMode,
    type QuoteAttributionValue,
} from "../../../editor/quoteAttribution";
import { m } from "../../../paraglide/messages.js";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";
import styles from "./QuoteAttributionField.module.css";

export interface QuoteAttributionFieldProps {
    references: ReferenceEntry[];
    value: QuoteAttributionValue;
    onChange: (value: QuoteAttributionValue) => void;
}

export const QuoteAttributionField = ({
    references,
    value,
    onChange,
}: QuoteAttributionFieldProps) => {
    const mode = quoteAttributionMode(value);

    const handleModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextMode = event.target.value as QuoteAttributionMode;
        if (nextMode === "none") {
            onChange({ text: "", referenceId: null });
            return;
        }
        if (nextMode === "text") {
            onChange({ text: value.text, referenceId: null });
            return;
        }
        onChange({
            text: "",
            referenceId:
                value.referenceId ??
                references[0]?.id ??
                null,
        });
    };

    return (
        <div className={styles.stack}>
            <p className={styles.hint}>{m.editor_quote_attribution_hint()}</p>
            <Select
                fullWidth
                label={m.editor_quote_attribution_type()}
                value={mode}
                options={[
                    {
                        value: "none",
                        label: m.editor_quote_attribution_reference_none(),
                    },
                    {
                        value: "text",
                        label: m.editor_quote_attribution_type_text(),
                    },
                    ...(references.length > 0
                        ? [
                              {
                                  value: "reference" as const,
                                  label: m.editor_quote_attribution_type_reference(),
                              },
                          ]
                        : []),
                ]}
                onChange={handleModeChange}
            />
            {mode === "text" ? (
                <TextInput
                    fullWidth
                    label={m.editor_quote_attribution_text()}
                    placeholder={m.editor_quote_attribution_text_placeholder()}
                    value={value.text}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onChange({ text: event.target.value, referenceId: null })
                    }
                />
            ) : null}
            {mode === "reference" ? (
                <Select
                    fullWidth
                    label={m.editor_quote_attribution_reference()}
                    value={value.referenceId ?? ""}
                    options={references.map((reference) => ({
                        value: reference.id,
                        label: formatReferenceCitation(reference),
                    }))}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        const referenceId = event.target.value;
                        onChange(
                            referenceId
                                ? { text: "", referenceId }
                                : { text: "", referenceId: null },
                        );
                    }}
                />
            ) : null}
        </div>
    );
};
