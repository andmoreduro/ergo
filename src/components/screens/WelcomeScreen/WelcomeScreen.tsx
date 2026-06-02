import { useContextMenuTrigger } from "../../organisms/ContextMenu/ContextMenuProvider";
import { WelcomeActionButton } from "../../atoms/WelcomeActionButton/WelcomeActionButton";
import { WelcomeRemoveButton } from "../../atoms/WelcomeRemoveButton/WelcomeRemoveButton";
import { m } from "../../../paraglide/messages.js";
import styles from "./WelcomeScreen.module.css";

export interface WelcomeScreenProps {
    recentProjects: string[];
    onNewProject: () => void;
    onOpenProject: () => void;
    onOpenRecentProject: (path: string) => void;
    onRemoveRecentProject: (path: string) => void;
    onCommandPalette: () => void;
}

export const WelcomeScreen = ({
    recentProjects,
    onNewProject,
    onOpenProject,
    onOpenRecentProject,
    onRemoveRecentProject,
    onCommandPalette,
}: WelcomeScreenProps) => {
    const contextMenu = useContextMenuTrigger("app");

    return (
        <main className={styles.screen} {...contextMenu}>
            <section className={styles.panel} aria-labelledby="welcome-title">
                <header className={styles.header}>
                    <img
                        className={styles.appIcon}
                        src="/app_logo.jpg"
                        alt={m.welcome_app_icon_label()}
                        width={44}
                        height={44}
                    />
                    <div>
                        <h1 id="welcome-title">{m.welcome_title()}</h1>
                        <p>{m.welcome_tagline()}</p>
                    </div>
                </header>

                <div className={styles.group}>
                    <div className={styles.rule}>
                        <span>{m.welcome_get_started()}</span>
                    </div>
                    <WelcomeActionButton icon="+" onClick={onNewProject}>
                        {m.welcome_new_project()}
                    </WelcomeActionButton>
                    <WelcomeActionButton
                        icon="[]"
                        shortcut={m.welcome_shortcut_open_project()}
                        onClick={onOpenProject}
                    >
                        {m.welcome_open_project()}
                    </WelcomeActionButton>
                    <WelcomeActionButton
                        icon=">"
                        shortcut={m.welcome_shortcut_command_palette()}
                        onClick={onCommandPalette}
                    >
                        {m.welcome_command_palette()}
                    </WelcomeActionButton>
                </div>

                <div className={styles.group}>
                    <div className={styles.rule}>
                        <span>{m.welcome_recent_projects()}</span>
                    </div>
                    {recentProjects.length > 0 ? (
                        recentProjects.map((project) => (
                            <div className={styles.recentProject} key={project}>
                                <WelcomeActionButton
                                    icon="[]"
                                    variant="recent"
                                    onClick={() => onOpenRecentProject(project)}
                                >
                                    {project}
                                </WelcomeActionButton>
                                <WelcomeRemoveButton
                                    aria-label={m.welcome_remove_recent_project()}
                                    title={m.welcome_remove_recent_project()}
                                    className={styles.recentRemove}
                                    onClick={() => onRemoveRecentProject(project)}
                                >
                                    <span aria-hidden="true">&times;</span>
                                </WelcomeRemoveButton>
                            </div>
                        ))
                    ) : (
                        <p className={styles.empty}>
                            {m.welcome_no_recent_projects()}
                        </p>
                    )}
                </div>
            </section>
        </main>
    );
};
