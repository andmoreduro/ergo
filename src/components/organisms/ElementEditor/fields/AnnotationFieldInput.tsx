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
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committed);

    useEffect(() => {
        if (draftRef) {
            draftRef.current[field.key] = draft;
        }
    }, [draft, draftRef, field.key]);

    const commit = (next: string) => {
        if (!shouldCommit(next)) {
            return;
        }

        if (element.type === "Figure" && field.key === "caption") {
            dispatch({
                type: "UPDATE_FIGURE",
                payload: {
                    figureId: element.id,
                    caption: next,
                },
            });
            return;
        }

        dispatch({
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: element.id,
                fieldKey: field.key,
                fieldValue: next,
            },
        });
    };

    return (
        <ExtraFieldInput
            committed={draft}
            element={element}
            field={field}
            onCommit={commit}
            onDraftChange={(next) => {
                setDraft(next);
                commit(next);
            }}
        />
    );
};

