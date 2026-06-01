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
