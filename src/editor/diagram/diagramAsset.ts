import type { AssetEntry } from "../../bindings/AssetEntry";

export const diagramAssetPath = (diagramId: string) =>
    `assets/diagrams/${diagramId}.svg`;

export const isGeneratedDiagramAssetPath = (path: string): boolean => {
    if (!path.startsWith("assets/diagrams/") || !path.endsWith(".svg")) {
        return false;
    }
    const fileName = path.slice("assets/diagrams/".length);
    return fileName.length > 0 && !fileName.includes("/") && !fileName.includes("..");
};

export const isGeneratedDiagramAsset = (asset: AssetEntry): boolean =>
    isGeneratedDiagramAssetPath(asset.path);
