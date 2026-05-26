import { createContext, useContext } from "react";
import type { useFieldNavigation } from "./useFieldNavigation";

export type EditorNavigationApi = ReturnType<typeof useFieldNavigation>;

const EditorNavigationContext = createContext<EditorNavigationApi | null>(null);

export const EditorNavigationProvider = EditorNavigationContext.Provider;

export const useEditorNavigation = (): EditorNavigationApi => {
    const value = useContext(EditorNavigationContext);
    if (!value) {
        throw new Error("useEditorNavigation requires EditorNavigationProvider");
    }
    return value;
};
