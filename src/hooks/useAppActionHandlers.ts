import { useMemo, useRef } from "react";

import type { ActionHandlerMap } from "../actions/runtime";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { CommandRegistry } from "../commands/registry";
import type { CommandContext } from "../commands/types";
import {
    coverTitleFieldId,
    defaultFieldIdForElement,
} from "../editor/fieldIds";
import type { DocumentFocusInput } from "../state/DocumentContext";

interface FocusFieldPayload {
    elementId: string;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    sourceRevision: number | null;
}

interface UseAppActionHandlersOptions {
    state: DocumentAST;
    commandRegistry: CommandRegistry;
    commandContext: CommandContext;
    setDocumentFocus: (focus: DocumentFocusInput) => void;
}

const readString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const readNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "bigint") {
        return Number(value);
    }

    return null;
};

const parseFocusFieldPayload = (payload: unknown): FocusFieldPayload | null => {
    if (typeof payload !== "object" || payload === null) {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const elementId = readString(record.elementId);
    if (!elementId) {
        return null;
    }

    return {
        elementId,
        fieldId: readString(record.fieldId),
        caretUtf16Offset: readNumber(record.caretUtf16Offset),
        sourceRevision: readNumber(record.sourceRevision),
    };
};

const defaultFieldIdForFocus = (
    state: DocumentAST,
    elementId: string,
): string | null => {
    for (const section of state.sections) {
        if (section.type === "CoverPage" && section.id === elementId) {
            return coverTitleFieldId(section.id);
        }

        if (section.type === "Content") {
            const element = section.elements.find((entry) => entry.id === elementId);
            if (element) {
                return defaultFieldIdForElement(element);
            }
        }
    }

    return null;
};

export const useAppActionHandlers = ({
    state,
    commandRegistry,
    commandContext,
    setDocumentFocus,
}: UseAppActionHandlersOptions): ActionHandlerMap => {
    const stateRef = useRef(state);
    stateRef.current = state;

    return useMemo<ActionHandlerMap>(() => {
        const handlers: ActionHandlerMap = {};

        handlers["editor::FocusField"] = (invocation) => {
            const target = parseFocusFieldPayload(invocation.payload);
            if (!target) {
                return false;
            }

            const fieldId =
                target.fieldId ??
                defaultFieldIdForFocus(stateRef.current, target.elementId);
            setDocumentFocus({
                elementId: target.elementId,
                fieldId,
                caretUtf16Offset: target.caretUtf16Offset,
                sourceRevision: target.sourceRevision,
                focusSource: "preview",
            });
            return true;
        };

        for (const command of commandRegistry.all()) {
            handlers[command.id] = () => {
                void commandRegistry.run(command.id, commandContext);
                return true;
            };
        }

        return handlers;
    }, [commandContext, commandRegistry, setDocumentFocus]);
};
