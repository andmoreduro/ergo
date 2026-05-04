import type { DocumentAST } from "../bindings/DocumentAST";
import type { SourceMapEntry } from "./sourceMap";

export interface ProjectSourceLayout {
    mainPath: string;
    sectionPaths: string[];
    referencesPath: string;
    sourceMapPath: string;
    documentStatePath: string;
    projectSettingsPath: string;
    templatePath: string;
}

export interface DocumentSessionStatus {
    sourceRevision: number;
    layout: ProjectSourceLayout;
    sourceMap: SourceMapEntry[];
    dirtySectionIds: string[];
    dirtyElementIds: string[];
    fragmentCount: number;
}

export type DocumentEvent = {
    type: "snapshotSynced";
    ast: DocumentAST;
};
