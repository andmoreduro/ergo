type MermaidApi = {
    initialize: (config: Record<string, unknown>) => void;
    render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidModule: Promise<MermaidApi> | null = null;

const loadMermaid = async (): Promise<MermaidApi> => {
    if (!mermaidModule) {
        mermaidModule = import("mermaid").then((mod) => {
            const mermaid = mod.default as MermaidApi;
            mermaid.initialize({
                startOnLoad: false,
                securityLevel: "strict",
                // Render labels as native SVG <text>, never HTML in
                // <foreignObject>. These SVGs are embedded as images and
                // rasterized by Typst (resvg/usvg), which cannot render
                // foreignObject — so htmlLabels:true silently drops all text
                // from flowcharts (the default diagram type) while leaving
                // <text>-based diagrams like sequence diagrams intact.
                htmlLabels: false,
                flowchart: { htmlLabels: false },
                // Never draw Mermaid's "syntax error" graphic. Without this,
                // a failed render leaves that graphic in a temporary element
                // Mermaid appended to document.body (it throws before its
                // own cleanup), so every failed attempt while typing stacked
                // another unreachable error picture below the app shell.
                suppressErrorRendering: true,
            });
            return mermaid;
        });
    }
    return mermaidModule;
};

/**
 * Removes the temporary elements Mermaid appends to `document.body` for a
 * render (`d<id>` wrapper, `i<id>` sandbox iframe, and the `<id>` svg when it
 * was left at body level). Mermaid removes them itself on success; a failed
 * render can leave them behind, which shows up as an unreachable graphic
 * below the app. Only body-level nodes are touched.
 */
export const removeMermaidRenderLeftovers = (
    renderId: string,
    doc: Document = document,
): void => {
    for (const id of [`d${renderId}`, `i${renderId}`, renderId]) {
        const node = doc.getElementById(id);
        if (node && node.parentElement === doc.body) {
            node.remove();
        }
    }
};

/** Render Mermaid source to an SVG string. `renderId` must be unique per call. */
export const renderMermaidSvg = async (
    source: string,
    renderId: string,
): Promise<string> => {
    const mermaid = await loadMermaid();
    try {
        const { svg } = await mermaid.render(renderId, source);
        return svg;
    } finally {
        removeMermaidRenderLeftovers(renderId);
    }
};
