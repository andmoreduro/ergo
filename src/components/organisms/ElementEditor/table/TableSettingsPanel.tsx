import { useEffect, useState } from "react";
import { elementExtraFieldFieldId } from "../../../../editor/fieldIds";
import { getPlacementOptions, tablePlacementValue } from "../../../../editor/placementOptions";
import { usesStandardTypstFigureWrapper } from "../../../../editor/templateElementOverrides";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { useTemplateSpecContext } from "../../../../state/TemplateSpecContext";
import { m } from "../../../../paraglide/messages.js";
import { Select } from "../../../atoms/Select/Select";
import { TextInput } from "../../../atoms/TextInput/TextInput";
import { ElementSettingsButton } from "../ElementSettingsButton";
import type { TableElement } from "../types";
import styles from "../ElementEditor.module.css";
import { TableColumnSizeEditor } from "./TableColumnSizeEditor";

export const TableSettingsPanel = ({
    element,
    open,
    onOpenChange,
}: {
    element: TableElement;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) => {
    const { dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const tableOverride = templateSpec?.typst.element_overrides?.table ?? null;
    const showPlacement = usesStandardTypstFigureWrapper(tableOverride);

    const committedPlacement = tablePlacementValue(element.extra_fields);
    const committedWidth =
        typeof element.extra_fields?.width === "string"
            ? (element.extra_fields.width as string)
            : "";

    const [draftPlacement, setDraftPlacement] = useState(committedPlacement);
    const [draftWidth, setDraftWidth] = useState(committedWidth);

    const placementField = useEditorFieldBinding<HTMLSelectElement>({
        elementId: element.id,
        fieldId: elementExtraFieldFieldId(element.id, "placement"),
    });

    useEffect(() => {
        setDraftPlacement(committedPlacement);
    }, [committedPlacement, element.id]);

    useEffect(() => {
        setDraftWidth(committedWidth);
    }, [committedWidth, element.id]);

    const commitWidth = (next: string) => {
        dispatch({
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: element.id,
                fieldKey: "width",
                fieldValue: next.trim().length > 0 ? next.trim() : null,
            },
        });
    };

    return (
        <ElementSettingsButton open={open} onOpenChange={onOpenChange}>
            {showPlacement ? (
                <Select
                    {...placementField}
                    fullWidth
                    label={m.editor_table_placement()}
                    value={draftPlacement}
                    options={getPlacementOptions()}
                    onChange={(event) => {
                        const next = event.target.value;
                        setDraftPlacement(next);
                        dispatch({
                            type: "UPDATE_ELEMENT_EXTRA_FIELD",
                            payload: {
                                elementId: element.id,
                                fieldKey: "placement",
                                fieldValue: next,
                            },
                        });
                    }}
                />
            ) : null}
            <TextInput
                fullWidth
                label={m.editor_element_width()}
                placeholder={m.editor_element_dimension_hint()}
                value={draftWidth}
                onChange={(event) => setDraftWidth(event.target.value)}
                onBlur={() => commitWidth(draftWidth)}
            />
            <div className={styles.columnSizes}>
                {element.column_sizes.map((size, colIndex) => (
                    <TableColumnSizeEditor
                        colIndex={colIndex}
                        element={element}
                        key={colIndex}
                        size={size}
                    />
                ))}
            </div>
        </ElementSettingsButton>
    );
};
