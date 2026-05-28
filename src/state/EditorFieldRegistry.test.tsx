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
            anchorPageNumber: null,
            forcePreviewScroll: false,
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
                    anchorPageNumber: null,
                    forcePreviewScroll: false,
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

    it("reports native caret movement on input before keyup", async () => {
        const focusStates: DocumentFocusState[] = [];

        render(
            <FieldHarness>
                <RegisteredInput />
                <FocusStateProbe
                    onFocusState={(focus) => focusStates.push(focus)}
                />
            </FieldHarness>,
        );

        const input = screen.getByLabelText("Heading text") as HTMLInputElement;
        input.setSelectionRange(0, 0);
        fireEvent.focus(input);
        await waitFor(() => {
            expect(focusStates.at(-1)).toMatchObject({
                caretUtf16Offset: 0,
                focusSource: "native",
            });
        });

        input.value = "Hola X mundo";
        input.setSelectionRange(6, 6);
        fireEvent.input(input);

        await waitFor(() => {
            expect(focusStates.at(-1)).toMatchObject({
                elementId: "heading-1",
                fieldId: "heading-1:text",
                caretUtf16Offset: 6,
                focusSource: "native",
            });
        });
    });

    it("does not move document focus to the simple-list composer on native focus", async () => {
        const focusStates: DocumentFocusState[] = [];

        const EntryInput = () => {
            const binding = useEditorFieldBinding<HTMLInputElement>({
                elementId: "project",
                fieldId: "project-input-/affiliations/0",
            });

            return (
                <input
                    {...binding}
                    aria-label="Affiliation entry"
                    defaultValue="Universidad"
                />
            );
        };

        const ComposerInput = () => {
            const binding = useEditorFieldBinding<HTMLInputElement>({
                elementId: "project",
                fieldId: "project-input-/affiliations/composer",
            });

            return (
                <input
                    {...binding}
                    aria-label="Affiliation composer"
                    defaultValue=""
                />
            );
        };

        render(
            <FieldHarness>
                <EntryInput />
                <ComposerInput />
                <FocusStateProbe
                    onFocusState={(focus) => focusStates.push(focus)}
                />
            </FieldHarness>,
        );

        const entry = screen.getByLabelText("Affiliation entry");
        const composer = screen.getByLabelText("Affiliation composer");

        entry.setSelectionRange(11, 11);
        fireEvent.focus(entry);
        await waitFor(() => {
            expect(focusStates.at(-1)).toMatchObject({
                fieldId: "project-input-/affiliations/0",
                caretUtf16Offset: 11,
                focusSource: "native",
            });
        });

        composer.focus();

        await waitFor(() => {
            expect(focusStates.at(-1)).toMatchObject({
                fieldId: "project-input-/affiliations/0",
                caretUtf16Offset: 11,
                focusSource: "native",
            });
        });
    });

    it("restores focus to the simple-list composer when an entry field is removed on blur", async () => {
        const RemovableEntry = ({ onRemove }: { onRemove: () => void }) => {
            const binding = useEditorFieldBinding<HTMLInputElement>({
                elementId: "project",
                fieldId: "project-input-/affiliations/0",
            });

            return (
                <input
                    {...binding}
                    aria-label="Affiliation entry"
                    defaultValue=""
                    onBlur={(event) => {
                        binding.onBlur(event);
                        onRemove();
                    }}
                />
            );
        };

        const ComposerInput = () => {
            const binding = useEditorFieldBinding<HTMLInputElement>({
                elementId: "project",
                fieldId: "project-input-/affiliations/composer",
            });

            return (
                <input
                    {...binding}
                    aria-label="Affiliation composer"
                    defaultValue=""
                />
            );
        };

        const Harness = () => {
            const [showEntry, setShowEntry] = useState(true);

            return (
                <>
                    {showEntry ? (
                        <RemovableEntry onRemove={() => setShowEntry(false)} />
                    ) : null}
                    <ComposerInput />
                </>
            );
        };

        render(
            <FieldHarness>
                <Harness />
            </FieldHarness>,
        );

        const entry = screen.getByLabelText("Affiliation entry");
        const composer = screen.getByLabelText("Affiliation composer");

        fireEvent.focus(entry);
        fireEvent.blur(entry);

        await waitFor(() => {
            expect(composer).toHaveFocus();
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
