import { createPortal } from "react-dom";
import { useMemo, useRef, type RefObject } from "react";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { effectiveTableExtraFields } from "../../../editor/templateElementOverrides";
import type { ExtraFieldSpec } from "../../../bindings/ExtraFieldSpec";
import { wrapperFieldDraftValues } from "../../../editor/wrapperFields";
import { useBlockUiState } from "../blockUiState";
import { useDocumentAst } from "../../../state/DocumentContext";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { ElementExtrasAccordion } from "../../../components/organisms/ElementEditor/ElementExtrasAccordion";
import { ElementAnnotationFields } from "../../../components/organisms/ElementEditor/fields/ElementAnnotationFields";
import { TableSettingsPanel } from "../../../components/organisms/ElementEditor/table/TableSettingsPanel";
import { useElementSettingsShortcut } from "../../../components/organisms/ElementEditor/useElementSettingsShortcut";
import type { TableElement } from "../table/tableSubBridge";
import styles from "./tableBlockNodeView.module.css";

const TABLE_SETTINGS_KEYS = new Set(["width", "placement"]);

const resolveTableElement = (
    elementFromNode: TableElement | null,
    elementId: string,
    sections: DocumentAST["sections"],
): TableElement | null => {
    if (elementFromNode) {
        return elementFromNode;
    }
    for (const section of sections) {
        if (section.type !== "Content") {
            continue;
        }
        const found = section.elements.find(
            (entry) => entry.type === "Table" && entry.id === elementId,
        );
        if (found?.type === "Table") {
            return found;
        }
    }
    return null;
};

const useTableAnnotationFields = (): ExtraFieldSpec[] => {
    const { spec: templateSpec } = useTemplateSpecContext();
    return useMemo(
        () =>
            effectiveTableExtraFields(
                templateSpec?.element_overrides?.table ?? null,
            ).filter((field) => !TABLE_SETTINGS_KEYS.has(field.key)),
        [templateSpec?.element_overrides?.table],
    );
};

const TableBlockSettingsChrome = ({
    elementFromNode,
    elementId,
    editing,
}: {
    elementFromNode: TableElement | null;
    elementId: string;
    editing: boolean;
}) => {
    const { state } = useDocumentAst();
    const settings = useElementSettingsShortcut(elementId);
    const element = resolveTableElement(
        elementFromNode,
        elementId,
        state.sections,
    );

    if (!element || !editing) {
        return null;
    }

    return (
        <TableSettingsPanel
            element={element}
            open={settings.open}
            onOpenChange={settings.setOpen}
        />
    );
};

export const TableBlockChromeCoordinator = ({
    elementFromNode,
    elementId,
    chromeMount,
    shellRef,
}: {
    elementFromNode: TableElement | null;
    elementId: string;
    chromeMount: HTMLElement;
    shellRef: RefObject<HTMLDivElement | null>;
}) => {
    const { state } = useDocumentAst();
    const { selected, editing } = useBlockUiState(elementId);
    const annotationFields = useTableAnnotationFields();
    const wrapperDraftRef = useRef<Record<string, string>>({});
    const element = resolveTableElement(
        elementFromNode,
        elementId,
        state.sections,
    );

    if ((!selected && !editing) || annotationFields.length === 0 || !element) {
        return null;
    }

    wrapperDraftRef.current = wrapperFieldDraftValues(
        element,
        annotationFields,
    );

    const locked = selected && !editing;

    return createPortal(
        <div
            className={`${styles.tableExtrasChrome} ${locked ? styles.tableExtrasChromeLocked : ""}`}
        >
            <ElementExtrasAccordion
                elementId={elementId}
                shellRef={shellRef}
                headerAccessory={
                    <TableBlockSettingsChrome
                        elementFromNode={elementFromNode}
                        elementId={elementId}
                        editing={editing}
                    />
                }
            >
                <ElementAnnotationFields
                    draftRef={wrapperDraftRef}
                    element={element}
                    fields={annotationFields}
                />
            </ElementExtrasAccordion>
        </div>,
        chromeMount,
    );
};
