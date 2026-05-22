import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import {
    DocumentProvider,
    useDocument,
    type DocumentFocusState,
} from "./DocumentContext";
import {
    EditorFieldRegistryProvider,
    useEditorFieldBinding,
} from "./EditorFieldRegistry";

const FieldHarness = ({ children }: { children: ReactNode }) => (
    <DocumentProvider>
        <EditorFieldRegistryProvider>{children}</EditorFieldRegistryProvider>
    </DocumentProvider>
);

const RegisteredInput = () => {
    const binding = useEditorFieldBinding<HTMLInputElement>({
        elementId: "heading-1",
        fieldId: "heading-1:text",
    });

    return (
        <input
            {...binding}
            aria-label="Heading text"
            defaultValue="Hola 🌍 mundo"
        />
    );
};

const PreviewFocusTrigger = ({ caret }: { caret: number }) => {
    const { setDocumentFocus } = useDocument();

    useEffect(() => {
        setDocumentFocus({
            elementId: "heading-1",
            fieldId: "heading-1:text",
            caretUtf16Offset: caret,
            sourceRevision: 7,
            focusSource: "preview",
        });
    }, [caret, setDocumentFocus]);

    return null;
};

const PreviewFocusButton = ({ caret }: { caret: number }) => {
    const { setDocumentFocus } = useDocument();

    return (
        <button
            type="button"
            onClick={() =>
                setDocumentFocus({
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    caretUtf16Offset: caret,
                    sourceRevision: 7,
                    focusSource: "preview",
                })
            }
        >
            preview focus
        </button>
    );
};

const FocusStateProbe = ({
    onFocusState,
}: {
    onFocusState: (focus: DocumentFocusState) => void;
}) => {
    const { documentFocus } = useDocument();

    useEffect(() => {
        onFocusState(documentFocus);
    }, [documentFocus, onFocusState]);

    return null;
};

describe("EditorFieldRegistry", () => {
    it("applies preview focus to the registered field and UTF-16 caret", async () => {
        render(
            <FieldHarness>
                <RegisteredInput />
                <PreviewFocusTrigger caret={7} />
            </FieldHarness>,
        );

        const input = screen.getByLabelText("Heading text") as HTMLInputElement;

        await waitFor(() => {
            expect(input).toHaveFocus();
            expect(input.selectionStart).toBe(7);
        });
    });

    it("keeps native caret movement from being overwritten by the last preview focus", async () => {
        const RerenderProbe = () => {
            const [count, setCount] = useState(0);
            return (
                <button type="button" onClick={() => setCount((value) => value + 1)}>
                    rerender {count}
                </button>
            );
        };

        render(
            <FieldHarness>
                <RegisteredInput />
                <PreviewFocusTrigger caret={7} />
                <RerenderProbe />
            </FieldHarness>,
        );

        const input = screen.getByLabelText("Heading text") as HTMLInputElement;
        await waitFor(() => expect(input.selectionStart).toBe(7));

        input.setSelectionRange(2, 2);
        fireEvent.keyUp(input);
        fireEvent.click(screen.getByRole("button", { name: /rerender/i }));

        await waitFor(() => {
            expect(input.selectionStart).toBe(2);
        });
    });

    it("does not report the previous native caret while applying preview focus", async () => {
        const focusStates: DocumentFocusState[] = [];

        render(
            <FieldHarness>
                <RegisteredInput />
                <PreviewFocusButton caret={7} />
                <FocusStateProbe
                    onFocusState={(focus) => focusStates.push(focus)}
                />
            </FieldHarness>,
        );

        const input = screen.getByLabelText("Heading text") as HTMLInputElement;
        input.setSelectionRange(2, 2);
        fireEvent.click(screen.getByRole("button", { name: "preview focus" }));

        await waitFor(() => {
            expect(input).toHaveFocus();
            expect(input.selectionStart).toBe(7);
        });
        await waitFor(() => {
            expect(focusStates.at(-1)).toMatchObject({
                caretUtf16Offset: 7,
                focusSource: "preview",
            });
        });
    });
});
