import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { ProjectSettings } from "../bindings/ProjectSettings";
import { TauriApi } from "../api/tauri";

export async function resolveProjectSettingsForCompile(
    settings: ProjectSettings,
): Promise<ProjectSettings> {
    return TauriApi.resolveProjectFonts(settings);
}

export async function documentAstForCompile(ast: DocumentAST): Promise<DocumentAST> {
    const project_settings = await resolveProjectSettingsForCompile(
        ast.metadata.project_settings,
    );
    return {
        ...ast,
        metadata: {
            ...ast.metadata,
            project_settings,
        },
    };
}

export async function documentEventsForCompile(
    events: DocumentEvent[],
): Promise<DocumentEvent[]> {
    return Promise.all(
        events.map(async (event) => {
            if (event.type !== "setProjectSettings") {
                return event;
            }
            return {
                ...event,
                settings: await resolveProjectSettingsForCompile(event.settings),
            };
        }),
    );
}
