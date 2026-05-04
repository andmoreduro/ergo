import { DEFAULT_PROJECT_SETTINGS } from "../settings/defaults";
import type { TemplateManifest } from "./types";

export const APA7_TEMPLATE: TemplateManifest = {
    id: "apa7",
    name: "APA 7",
    version: "1.0.0",
    packageName: "@preview/versatile-apa",
    packageVersion: "7.2.0",
    defaultProjectSettings: DEFAULT_PROJECT_SETTINGS,
    fields: [
        {
            id: "title",
            label: "Title",
            section: "cover",
            required: true,
        },
        {
            id: "authors",
            label: "Authors",
            section: "cover",
            required: false,
        },
        {
            id: "affiliations",
            label: "Affiliations",
            section: "cover",
            required: false,
        },
        {
            id: "abstract",
            label: "Abstract",
            section: "cover",
            required: false,
        },
        {
            id: "references",
            label: "References",
            section: "bibliography",
            required: false,
        },
    ],
};
