import { useContext } from "react";
import {
    EditorFieldRegistryContext,
    useEditorFocusLostRecovery as useEditorFocusLostRecoveryImpl,
} from "../state/EditorFieldRegistry";

export const useEditorFocusLostRecovery = (blurredFieldId: string) => {
    const registry = useContext(EditorFieldRegistryContext);
    return useEditorFocusLostRecoveryImpl(blurredFieldId, registry);
};
