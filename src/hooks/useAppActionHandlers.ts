import { useMemo } from "react";

import type { ActionHandlerMap } from "../actions/runtime";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { CommandRegistry } from "../commands/registry";
import type { CommandContext } from "../commands/types";
import { parseHeadingInsertLevel } from "../editor/headingInsert";
import type { ElementType, InsertElementOptions } from "../commands/editorCommands";
import { parseInputContentBlocks } from "../editor/contentBlocks";
import { globalCaretInContentBlocks, parseIndexedInputFieldPath } from "../editor/contentBlocksCaret";
import {
    backendInputsElementId,
    defaultFieldIdForElement,
    editorFocusIdsForBackendField,
} from "../editor/fieldIds";
import { getValueAtPath } from "../state/documentEvents/helpers";
import type { DocumentFocusInput } from "../state/DocumentContext";

interface FocusFieldPayload {
    elementId: string;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    sourceRevision: number | null;
    anchorPageNumber: number | null;
    forcePreviewScroll: boolean;
}

interface UseAppActionHandlersOptions {
    /** Reads the live AST at call time (stable identity — never a render dep). */
    getState: () => DocumentAST;
    commandRegistry: CommandRegistry;
    commandContext: CommandContext;
    setDocumentFocus: (focus: DocumentFocusInput) => void;
    insertElement: (
        elementType: ElementType,
        options?: InsertElementOptions,
        invocationPayload?: unknown,
    ) => void;
    closeProject: () => Promise<void>;
    actionOverrides?: ActionHandlerMap;
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
        anchorPageNumber: readNumber(record.anchorPageNumber),
        forcePreviewScroll: record.forcePreviewScroll === true,
    };
};

const defaultFieldIdForFocus = (
    state: DocumentAST,
    elementId: string,
): string | null => {
    for (const section of state.sections) {

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
    getState,
    commandRegistry,
    commandContext,
    setDocumentFocus,
    insertElement,
    closeProject,
    actionOverrides,
}: UseAppActionHandlersOptions): ActionHandlerMap => {
    return useMemo<ActionHandlerMap>(() => {
        const handlers: ActionHandlerMap = {
            ...actionOverrides,
        };

        handlers["editor::InsertHeading"] = (invocation) => {
            const level = parseHeadingInsertLevel(invocation.payload) ?? 1;
            insertElement(
                "heading",
                { headingLevel: level },
                invocation.payload,
            );
            return true;
        };

        handlers["workspace::CloseProject"] = () => {
            void closeProject();
            return true;
        };

        handlers["editor::FocusField"] = (invocation) => {
            const target = parseFocusFieldPayload(invocation.payload);
            if (!target) {
                return false;
            }

            const fieldId =
                target.fieldId ??
                defaultFieldIdForFocus(getState(), target.elementId);
            const editorTarget = editorFocusIdsForBackendField(
                target.elementId,
                fieldId,
            );
            let caretUtf16Offset = target.caretUtf16Offset;
            if (
                target.elementId === backendInputsElementId &&
                fieldId &&
                caretUtf16Offset !== null
            ) {
                const indexed = parseIndexedInputFieldPath(fieldId);
                if (indexed) {
                    const pathParts = indexed.basePath.split("/").filter(Boolean);
                    const raw = getValueAtPath(getState().inputs, pathParts);
                    const paragraphs = parseInputContentBlocks(raw);
                    caretUtf16Offset = globalCaretInContentBlocks(
                        paragraphs,
                        indexed.paragraphIndex,
                        caretUtf16Offset,
                    );
                }
            }
            setDocumentFocus({
                elementId: editorTarget.elementId,
                fieldId: editorTarget.fieldId,
                caretUtf16Offset,
                sourceRevision: target.sourceRevision,
                anchorPageNumber: target.anchorPageNumber,
                forcePreviewScroll: target.forcePreviewScroll,
                focusSource: "preview",
            });
            return true;
        };

        for (const command of commandRegistry.all()) {
            if (handlers[command.id]) {
                continue;
            }
            handlers[command.id] = () => {
                void commandRegistry.run(command.id, commandContext);
                return true;
            };
        }

        return handlers;
    }, [
        actionOverrides,
        commandContext,
        commandRegistry,
        getState,
        closeProject,
        insertElement,
        setDocumentFocus,
    ]);
};
