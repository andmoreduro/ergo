import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import { DocumentProvider, useDocument } from "./DocumentContext";
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
});
