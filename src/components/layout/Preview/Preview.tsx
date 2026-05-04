import { useEffect, useRef, type MouseEvent } from "react";
import { useDocument } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import { m } from "../../../paraglide/messages.js";
import styles from "./Preview.module.css";

export const Preview = () => {
    const { state, activeElementId, setActiveElementId } = useDocument();
    const { svgs, error, sourceMap } = useCompiler(state);
    const previewRef = useRef<HTMLDivElement>(null);
    const activeSource = sourceMap.find(
        (entry) => entry.elementId === activeElementId,
    );

    useEffect(() => {
        if (!activeSource) {
            return;
        }

        previewRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeSource]);

    const handlePreviewClick = (event: MouseEvent<HTMLElement>) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const labeledElement = target.closest<HTMLElement>(
            "[data-ergo-element-id]",
        );
        const elementId = labeledElement?.dataset.ergoElementId;
        if (elementId) {
            setActiveElementId(elementId);
        }
    };

    return (
        <aside
            className={styles.preview}
            data-active-source-label={activeSource?.label}
            onClick={handlePreviewClick}
        >
            <h2>{m.workspace_live_preview()}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.svgContainer} ref={previewRef}>
                {svgs.length > 0 ? (
                    svgs.map((svg, index) => (
                        <div
                            key={index}
                            className={styles.page}
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    ))
                ) : (
                    <div className={styles.placeholder}>
                        {m.workspace_preview_placeholder()}
                    </div>
                )}
            </div>
        </aside>
    );
};
