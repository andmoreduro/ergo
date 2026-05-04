import { useDocument } from "../../../state/DocumentContext";
import {
    ActionContextProvider,
    useActionDispatcher,
    type ActionHandlerMap,
} from "../../../actions/runtime";
import { ElementEditor } from "../../organisms/ElementEditor/ElementEditor";
import { Button } from "../../atoms/Button/Button";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { m } from "../../../paraglide/messages.js";
import styles from "./Editor.module.css";

export const Editor = () => {
    const { state, dispatch, setActiveElementId } = useDocument();
    const dispatchAction = useActionDispatcher();

    return (
        <ActionContextProvider id="editor" contexts={["editor"]}>
            <main className={styles.editor}>
            <h2>{m.workspace_form_editor()}</h2>
            {state.sections.map((section) => {
                if (section.type !== "CoverPage") {
                    return null;
                }

                const coverPageHandlers: ActionHandlerMap = {
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
                };

                return (
                    <ActionContextProvider
                        key={section.id}
                        id={`section-${section.id}`}
                        contexts={["section", "coverPage"]}
                        attributes={{ "section.id": section.id }}
                        handlers={coverPageHandlers}
                    >
                        <section
                            className={styles.section}
                            data-element-id={section.id}
                            data-section-id={section.id}
                            onFocus={() => setActiveElementId(section.id)}
                        >
                            <h3>{m.editor_cover_page()}</h3>
                            <TextInput
                                fullWidth
                                label={m.editor_document_title()}
                                value={state.metadata.title}
                                onChange={(event) =>
                                    dispatch({
                                        type: "UPDATE_PROJECT_TITLE",
                                        payload: { title: event.target.value },
                                    })
                                }
                            />
                            <Textarea
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
                                    <div className={styles.authorRow} key={index}>
                                        <TextInput
                                            fullWidth
                                            label={m.editor_author_name()}
                                            value={author.name}
                                            onChange={(event) =>
                                                dispatch({
                                                    type: "UPDATE_AUTHOR",
                                                    payload: {
                                                        sectionId: section.id,
                                                        authorIndex: index,
                                                        field: "name",
                                                        value: event.target.value,
                                                    },
                                                })
                                            }
                                        />
                                        <TextInput
                                            fullWidth
                                            label={m.editor_author_email()}
                                            value={author.email ?? ""}
                                            onChange={(event) =>
                                                dispatch({
                                                    type: "UPDATE_AUTHOR",
                                                    payload: {
                                                        sectionId: section.id,
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
            })}
            {state.sections.map((section) => {
                if (section.type === "Content") {
                    return (
                        <div key={section.id} className={styles.section}>
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
                                <ElementEditor
                                    key={element.id}
                                    element={element}
                                />
                            ))}
                        </div>
                    );
                }
                return null;
            })}
            </main>
        </ActionContextProvider>
    );
};
