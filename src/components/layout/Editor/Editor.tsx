import { useMemo } from "react";
import { useDocument } from "../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import type { DocumentSection } from "../../../bindings/DocumentSection";
import {
    ActionContextProvider,
    useActionDispatcher,
    type ActionHandlerMap,
} from "../../../actions/runtime";
import {
    coverAbstractFieldId,
    coverAffiliationsFieldId,
    coverAuthorEmailFieldId,
    coverAuthorNameFieldId,
    coverTitleFieldId,
} from "../../../editor/fieldIds";
import { ElementEditor } from "../../organisms/ElementEditor/ElementEditor";
import { Button } from "../../atoms/Button/Button";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { m } from "../../../paraglide/messages.js";
import styles from "./Editor.module.css";

type CoverPageSection = Extract<DocumentSection, { type: "CoverPage" }>;
type ContentSection = Extract<DocumentSection, { type: "Content" }>;

export const Editor = () => {
    const { state } = useDocument();

    return (
        <ActionContextProvider id="editor" contexts={["editor"]}>
            <main className={styles.editor}>
                <h2>{m.workspace_form_editor()}</h2>
                {state.sections.map((section) =>
                    section.type === "CoverPage" ? (
                        <CoverPageEditor
                            key={section.id}
                            section={section}
                            title={state.metadata.title}
                        />
                    ) : null,
                )}
                {state.sections.map((section) =>
                    section.type === "Content" ? (
                        <ContentSectionEditor key={section.id} section={section} />
                    ) : null,
                )}
            </main>
        </ActionContextProvider>
    );
};

const CoverPageEditor = ({
    section,
    title,
}: {
    section: CoverPageSection;
    title: string;
}) => {
    const { dispatch } = useDocument();
    const dispatchAction = useActionDispatcher();
    const titleField = useEditorFieldBinding<HTMLInputElement>({
        elementId: section.id,
        fieldId: coverTitleFieldId(section.id),
    });
    const abstractField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: section.id,
        fieldId: coverAbstractFieldId(section.id),
    });
    const affiliationsField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: section.id,
        fieldId: coverAffiliationsFieldId(section.id),
    });

    const coverPageHandlers: ActionHandlerMap = useMemo(
        () => ({
            "editor::AddAuthor": () => {
                dispatch({
                    type: "ADD_AUTHOR",
                    payload: { sectionId: section.id },
                });
                return true;
            },
            "editor::RemoveAuthor": (invocation) => {
                const authorIndex =
                    typeof invocation.payload === "object" &&
                    invocation.payload !== null &&
                    "authorIndex" in invocation.payload &&
                    typeof invocation.payload.authorIndex === "number"
                        ? invocation.payload.authorIndex
                        : -1;

                if (authorIndex < 0) {
                    return false;
                }

                dispatch({
                    type: "REMOVE_AUTHOR",
                    payload: {
                        sectionId: section.id,
                        authorIndex,
                    },
                });
                return true;
            },
        }),
        [dispatch, section.id],
    );

    return (
        <ActionContextProvider
            id={`section-${section.id}`}
            contexts={["section", "coverPage"]}
            attributes={{ "section.id": section.id }}
            handlers={coverPageHandlers}
        >
            <section
                className={styles.section}
                data-element-id={section.id}
                data-section-id={section.id}
            >
                <h3>{m.editor_cover_page()}</h3>
                <TextInput
                    {...titleField}
                    fullWidth
                    label={m.editor_document_title()}
                    value={title}
                    onChange={(event) =>
                        dispatch({
                            type: "UPDATE_PROJECT_TITLE",
                            payload: { title: event.target.value },
                        })
                    }
                />
                <Textarea
                    {...abstractField}
                    fullWidth
                    label={m.editor_abstract()}
                    value={section.abstract_text}
                    onChange={(event) =>
                        dispatch({
                            type: "UPDATE_COVER_PAGE_ABSTRACT",
                            payload: {
                                sectionId: section.id,
                                abstractText: event.target.value,
                            },
                        })
                    }
                />
                <Textarea
                    {...affiliationsField}
                    fullWidth
                    label={m.editor_affiliations()}
                    value={section.affiliations.join("\n")}
                    onChange={(event) =>
                        dispatch({
                            type: "UPDATE_COVER_PAGE_AFFILIATIONS",
                            payload: {
                                sectionId: section.id,
                                affiliations: event.target.value
                                    .split("\n")
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                            },
                        })
                    }
                />
                <div className={styles.authorList}>
                    {section.authors.map((author, index) => (
                        <AuthorRow
                            author={author}
                            index={index}
                            key={author.name || `author-${index}`}
                            sectionId={section.id}
                        />
                    ))}
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::AddAuthor",
                            payload: null,
                        })
                    }
                >
                    {m.editor_add_author()}
                </Button>
            </section>
        </ActionContextProvider>
    );
};

const AuthorRow = ({
    author,
    index,
    sectionId,
}: {
    author: CoverPageSection["authors"][number];
    index: number;
    sectionId: string;
}) => {
    const { dispatch } = useDocument();
    const dispatchAction = useActionDispatcher();
    const nameField = useEditorFieldBinding<HTMLInputElement>({
        elementId: sectionId,
        fieldId: coverAuthorNameFieldId(sectionId, index),
    });
    const emailField = useEditorFieldBinding<HTMLInputElement>({
        elementId: sectionId,
        fieldId: coverAuthorEmailFieldId(sectionId, index),
    });

    return (
        <div className={styles.authorRow}>
            <TextInput
                {...nameField}
                fullWidth
                label={m.editor_author_name()}
                value={author.name}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_AUTHOR",
                        payload: {
                            sectionId,
                            authorIndex: index,
                            field: "name",
                            value: event.target.value,
                        },
                    })
                }
            />
            <TextInput
                {...emailField}
                fullWidth
                label={m.editor_author_email()}
                value={author.email ?? ""}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_AUTHOR",
                        payload: {
                            sectionId,
                            authorIndex: index,
                            field: "email",
                            value: event.target.value,
                        },
                    })
                }
            />
            <Button
                type="button"
                variant="danger"
                size="small"
                onClick={() =>
                    dispatchAction({
                        id: "editor::RemoveAuthor",
                        payload: { authorIndex: index },
                    })
                }
            >
                {m.editor_remove_author()}
            </Button>
        </div>
    );
};

const ContentSectionEditor = ({ section }: { section: ContentSection }) => {
    const dispatchAction = useActionDispatcher();

    return (
        <div className={styles.section}>
            <div className={styles.insertToolbar}>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::InsertHeading",
                            payload: null,
                        })
                    }
                >
                    {m.editor_add_heading()}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::InsertParagraph",
                            payload: null,
                        })
                    }
                >
                    {m.editor_add_paragraph()}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::InsertTable",
                            payload: null,
                        })
                    }
                >
                    {m.editor_add_table()}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::InsertEquation",
                            payload: null,
                        })
                    }
                >
                    {m.editor_add_equation()}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::InsertFigure",
                            payload: null,
                        })
                    }
                >
                    {m.editor_add_figure()}
                </Button>
            </div>
            {section.elements.map((element) => (
                <ElementEditor key={element.id} element={element} />
            ))}
        </div>
    );
};
