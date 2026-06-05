import type { ChangeEvent } from "react";
import type { EquationSyntax } from "../../../bindings/EquationSyntax";
import { m } from "../../../paraglide/messages.js";
import { Select } from "../../atoms/Select/Select";

const SYNTAX_OPTIONS = () => [
    { value: "typst", label: m.editor_equation_syntax_typst() },
    { value: "latex", label: m.editor_equation_syntax_latex() },
];

export interface EquationSyntaxFieldProps {
    value: EquationSyntax;
    onChange: (syntax: EquationSyntax) => void;
}

export const EquationSyntaxField = ({
    value,
    onChange,
}: EquationSyntaxFieldProps) => (
    <Select
        fullWidth
        label={m.editor_equation_syntax()}
        value={value}
        options={SYNTAX_OPTIONS()}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onChange(event.target.value === "latex" ? "latex" : "typst")
        }
    />
);
