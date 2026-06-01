import { useEffect, type MutableRefObject } from "react";
import type { ExtraFieldSpec } from "../../../../bindings/ExtraFieldSpec";
import { wrapperFieldValue, type WrapperHostElement } from "../../../../editor/wrapperFields";
import { useDeferredTextCommit } from "../../../../editor/useDeferredTextCommit";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { ExtraFieldInput } from "./ExtraFieldInput";

export const AnnotationFieldInput = ({
    element,
    field,
    draftRef,
}: {
    element: WrapperHostElement;
    field: ExtraFieldSpec;
    draftRef?: MutableRefObject<Record<string, string>>;
}) => {
    const { dispatch } = useDocumentAst();
    const committed = wrapperFieldValue(element, field.key);
    const committedText =
        typeof committed === "string" ? committed : String(committed ?? "");
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committedText);

    useEffect(() => {
        if (draftRef) {
            draftRef.current[field.key] = draft;
        }
    }, [draft, draftRef, field.key]);

    const commit = (next: string | unknown) => {
        if (field.type === "content") {
            dispatch({
                type: "UPDATE_ELEMENT_EXTRA_FIELD",
                payload: {
                    elementId: element.id,
                    fieldKey: field.key,
                    fieldValue: next,
                },
            });
            return;
        }

        const text = typeof next === "string" ? next : String(next ?? "");
        if (!shouldCommit(text)) {
            return;
        }

        if (element.type === "Figure" && field.key === "caption") {
            dispatch({
                type: "UPDATE_FIGURE",
                payload: {
                    figureId: element.id,
                    caption: text,
                },
            });
            return;
        }

        if (element.type === "Diagram" && field.key === "caption") {
            dispatch({
                type: "UPDATE_DIAGRAM",
                payload: {
                    diagramId: element.id,
                    caption: text,
                },
            });
            return;
        }

        dispatch({
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: element.id,
                fieldKey: field.key,
                fieldValue: text,
            },
        });
    };

    return (
        <ExtraFieldInput
            committed={field.type === "content" ? committedText : draft}
            element={element}
            field={field}
            onCommit={commit}
            onDraftChange={(next) => {
                if (field.type === "content") {
                    return;
                }
                setDraft(next);
                commit(next);
            }}
        />
    );
};

