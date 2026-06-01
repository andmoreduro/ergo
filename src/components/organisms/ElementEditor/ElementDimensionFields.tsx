import { useEffect, useState } from "react";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import {
    getPlacementOptions,
    DEFAULT_PLACEMENT,
} from "../../../editor/placementOptions";
import { useDocumentAst } from "../../../state/DocumentContext";
import { m } from "../../../paraglide/messages.js";
import { Select } from "../../atoms/Select/Select";
import { TextInput } from "../../atoms/TextInput/TextInput";

/**
 * Placement / width / height controls shared by the figure, image, and diagram
 * settings modal. Width and height live in `extra_fields` (honoured by the Typst
 * `image(...)` generator); placement is a first-class field for figures and
 * diagrams. Editing here drives the existing AST update events, so undo/redo and
 * preview sync are unchanged.
 */
type DimensionElement = Extract<
    DocumentElement,
    { type: "Figure" | "Diagram" }
>;

const extraString = (element: DimensionElement, key: string): string => {
    const raw = element.extra_fields?.[key];
    return typeof raw === "string" ? raw : "";
};

export const ElementDimensionFields = ({
    element,
}: {
    element: DimensionElement;
}) => {
    const { dispatch } = useDocumentAst();
    const [placement, setPlacement] = useState(
        element.placement || DEFAULT_PLACEMENT,
    );
    const [width, setWidth] = useState(extraString(element, "width"));
    const [height, setHeight] = useState(extraString(element, "height"));

    useEffect(() => {
        setPlacement(element.placement || DEFAULT_PLACEMENT);
        setWidth(extraString(element, "width"));
        setHeight(extraString(element, "height"));
    }, [element]);

    const commitExtra = (fieldKey: string, value: string) => {
        dispatch({
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: element.id,
                fieldKey,
                fieldValue: value.trim().length > 0 ? value.trim() : null,
            },
        });
    };

    const commitPlacement = (next: string) => {
        if (element.type === "Figure") {
            dispatch({
                type: "UPDATE_FIGURE",
                payload: { figureId: element.id, placement: next },
            });
            return;
        }
        dispatch({
            type: "UPDATE_DIAGRAM",
            payload: { diagramId: element.id, placement: next },
        });
    };

    return (
        <>
            <Select
                fullWidth
                label={m.editor_figure_placement()}
                value={placement}
                options={getPlacementOptions()}
                onChange={(event) => {
                    setPlacement(event.target.value);
                    commitPlacement(event.target.value);
                }}
            />
            <TextInput
                fullWidth
                label={m.editor_element_width()}
                placeholder={m.editor_element_dimension_hint()}
                value={width}
                onChange={(event) => setWidth(event.target.value)}
                onBlur={() => commitExtra("width", width)}
            />
            <TextInput
                fullWidth
                label={m.editor_element_height()}
                placeholder={m.editor_element_dimension_hint()}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                onBlur={() => commitExtra("height", height)}
            />
        </>
    );
};
