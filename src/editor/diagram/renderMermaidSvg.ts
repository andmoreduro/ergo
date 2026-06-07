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
            });
            return mermaid;
        });
    }
    return mermaidModule;
};

/** Render Mermaid source to an SVG string. `renderId` must be unique per call. */
export const renderMermaidSvg = async (
    source: string,
    renderId: string,
): Promise<string> => {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(renderId, source);
    return svg;
};
