import type { DocumentElement } from "../../../bindings/DocumentElement";
import { useDocument } from "../../../state/DocumentContext";
import { focusEditorElement } from "../../../utils/editorFocus";
import { Accordion } from "../../molecules/Accordion/Accordion";
import { m } from "../../../paraglide/messages.js";
import styles from "./Sidebar.module.css";

const previewLabel = (text: string): string => {
    const normalized = text.trim().replace(/\s+/g, " ");
    if (!normalized) {
        return "";
    }

    return normalized.length > 44 ? `${normalized.slice(0, 41)}...` : normalized;
};

const elementTitle = (element: DocumentElement): string => {
    if (element.type === "Heading") {
        const text = previewLabel(element.content.map((span) => span.text).join(""));
        return text || m.sidebar_heading({ level: element.level });
    }

    if (element.type === "Paragraph") {
        const text = previewLabel(element.content.map((span) => span.text).join(""));
        return text || m.sidebar_paragraph();
    }

    if (element.type === "Table") {
        return `${m.sidebar_table()} (${element.rows} x ${element.cols})`;
    }

    if (element.type === "Equation") {
        return previewLabel(element.latex_source) || m.sidebar_equation();
    }

    return previewLabel(element.caption) || m.sidebar_figure();
};

export const Sidebar = () => {
    const { state } = useDocument();
    const coverPage = state.sections.find((section) => section.type === "CoverPage");
    const contentSections = state.sections.filter(
        (section) => section.type === "Content",
    );
    const contentElements = contentSections.flatMap((section) =>
        section.type === "Content" ? section.elements : [],
    );

    return (
        <aside className={styles.sidebar}>
            <Accordion title={m.sidebar_document_structure()} defaultOpen>
                <div className={styles.navList}>
                    {coverPage && (
                        <button
                            className={styles.navItem}
                            type="button"
                            onClick={() => focusEditorElement(coverPage.id)}
                        >
                            <span>{m.sidebar_cover_page()}</span>
                            <small>{state.metadata.title}</small>
                        </button>
                    )}
                    {contentElements.length > 0 ? (
                        contentElements.map((element) => (
                            <button
                                className={styles.navItem}
                                type="button"
                                key={element.id}
                                onClick={() => focusEditorElement(element.id)}
                            >
                                <span>{elementTitle(element)}</span>
                                <small>{element.type}</small>
                            </button>
                        ))
                    ) : (
                        <p className={styles.empty}>
                            {m.sidebar_empty_structure()}
                        </p>
                    )}
                </div>
            </Accordion>
            <Accordion title={m.sidebar_references()}>
                {state.references.length > 0 ? (
                    <div className={styles.navList}>
                        {state.references.map((reference) => (
                            <button
                                className={styles.navItem}
                                type="button"
                                key={reference.id}
                            >
                                <span>{reference.citation_key}</span>
                                <small>{reference.id}</small>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className={styles.empty}>{m.sidebar_empty_references()}</p>
                )}
            </Accordion>
            <Accordion title={m.sidebar_assets()}>
                {state.assets.length > 0 ? (
                    <div className={styles.navList}>
                        {state.assets.map((asset) => (
                            <button
                                className={styles.navItem}
                                type="button"
                                key={asset.id}
                            >
                                <span>{asset.caption || asset.path}</span>
                                <small>{asset.kind}</small>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className={styles.empty}>{m.sidebar_empty_assets()}</p>
                )}
            </Accordion>
        </aside>
    );
};
