import type { DocumentElement } from "../../../bindings/DocumentElement";
import { CustomElementEditor } from "./editors/CustomElementEditor";
import { EquationEditor } from "./editors/EquationEditor";
import { FigureEditor } from "./editors/FigureEditor";
import { HeadingEditor } from "./editors/HeadingEditor";
import { ParagraphEditor } from "./editors/ParagraphEditor";
import { TableEditor } from "./editors/TableEditor";

export const ElementContent = ({ element }: { element: DocumentElement }) => {
    if (element.type === "Heading") {
        return <HeadingEditor element={element} />;
    }

    if (element.type === "Paragraph") {
        return <ParagraphEditor element={element} />;
    }

    if (element.type === "Equation") {
        return <EquationEditor element={element} />;
    }

    if (element.type === "Table") {
        return <TableEditor element={element} />;
    }

    if (element.type === "Custom") {
        return <CustomElementEditor element={element} />;
    }

    if (element.type === "Figure") {
        return <FigureEditor element={element} />;
    }

    return null;
};

