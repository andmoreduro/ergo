import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { useDocumentAstSelector } from "../../../state/DocumentContext";
import { ElementEditor } from "../../../components/organisms/ElementEditor/ElementEditor";
import styles from "./blockObjectNodeViews.module.css";

const findElementById = (
    sections: DocumentAST["sections"],
    elementId: string,
): DocumentElement | null => {
    if (!elementId) {
        return null;
    }
    for (const section of sections) {
        if (section.type !== "Content") {
            continue;
        }
        const match = section.elements.find((el) => el.id === elementId);
        if (match) {
            return match;
        }
    }
    return null;
};

export const BlockObjectNodeViewHost = ({
    elementFromNode,
    elementId,
}: {
    elementFromNode: DocumentElement | null;
    elementId: string;
}) => {
    // The node attrs normally carry the element; only fall back to an AST scan
    // when they don't. Selecting (rather than subscribing to the whole AST)
    // keeps every block-object host from re-rendering on each body keystroke.
    const element = useDocumentAstSelector((ast) =>
        elementFromNode ?? findElementById(ast.sections, elementId),
    );

    if (!element) {
        return <div className={styles.placeholder} aria-hidden="true" />;
    }

    return <ElementEditor element={element} />;
};
