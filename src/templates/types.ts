import type { ProjectSettings } from "../bindings/ProjectSettings";

export interface TemplateField {
    id: string;
    label: string;
    section: "cover" | "content" | "bibliography";
    required: boolean;
}

export interface TemplateManifest {
    id: string;
    name: string;
    version: string;
    packageName: string;
    packageVersion: string;
    defaultProjectSettings: ProjectSettings;
    fields: TemplateField[];
}
