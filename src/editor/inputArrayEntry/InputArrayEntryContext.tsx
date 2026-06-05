import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import type { InputSchema } from "../../bindings/InputSchema";
import { projectInputElementId, projectInputFieldId } from "../fieldIds";
import { useDocumentActions } from "../../state/DocumentContext";
import { useEditorNavigation } from "../EditorNavigationContext";
import {
    createInputArrayItem,
    firstInputArrayItemFieldPath,
} from "./createInputArrayItem";

type InputArrayEntryContextValue = {
    insertBelow: () => void;
};

const InputArrayEntryContext = createContext<InputArrayEntryContextValue | null>(
    null,
);

export function useInputArrayEntryContext(): InputArrayEntryContextValue | null {
    return useContext(InputArrayEntryContext);
}

export function InputArrayEntryProvider({
    arrayPath,
    itemIndex,
    itemSchema,
    existingLength,
    children,
}: {
    arrayPath: string;
    itemIndex: number;
    itemSchema: InputSchema | null | undefined;
    existingLength: number;
    children: ReactNode;
}) {
    const { dispatch } = useDocumentActions();
    const { focusField } = useEditorNavigation();

    const insertBelow = useCallback(() => {
        const nextIndex = itemIndex + 1;
        dispatch({
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path: arrayPath,
                index: nextIndex,
                value: createInputArrayItem(itemSchema, existingLength),
            },
        });

        const nextFieldPath = firstInputArrayItemFieldPath(
            arrayPath,
            nextIndex,
            itemSchema,
        );
        if (nextFieldPath) {
            focusField(
                projectInputElementId,
                projectInputFieldId(nextFieldPath),
            );
        }
    }, [
        arrayPath,
        dispatch,
        existingLength,
        focusField,
        itemIndex,
        itemSchema,
    ]);

    const value = useMemo(() => ({ insertBelow }), [insertBelow]);

    return (
        <InputArrayEntryContext.Provider value={value}>
            {children}
        </InputArrayEntryContext.Provider>
    );
}
