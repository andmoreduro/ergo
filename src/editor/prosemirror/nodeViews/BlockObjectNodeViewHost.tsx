import { useMemo } from "react";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { useDocumentAst } from "../../../state/DocumentContext";
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
    const { state } = useDocumentAst();
    const element = useMemo(() => {
        if (elementFromNode) {
            return elementFromNode;
        }
        return findElementById(state.sections, elementId);
    }, [elementFromNode, elementId, state.sections]);

    if (!element) {
        return <div className={styles.placeholder} aria-hidden="true" />;
    }

    return <ElementEditor element={element} />;
};
