import { useContextMenuTrigger } from "../../../contextMenu/ContextMenuProvider";
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
                    <div
                        className={styles.appIconPlaceholder}
                        role="img"
                        aria-label={m.welcome_app_icon_label()}
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
                    <button
                        className={styles.action}
                        type="button"
                        onClick={onNewProject}
                    >
                        <span className={styles.actionIcon}>+</span>
                        <span>{m.welcome_new_project()}</span>
                    </button>
                    <button
                        className={styles.action}
                        type="button"
                        onClick={onOpenProject}
                    >
                        <span className={styles.actionIcon}>[]</span>
                        <span>{m.welcome_open_project()}</span>
                        <kbd>{m.welcome_shortcut_open_project()}</kbd>
                    </button>
                    <button
                        className={styles.action}
                        type="button"
                        onClick={onCommandPalette}
                    >
                        <span className={styles.actionIcon}>&gt;</span>
                        <span>{m.welcome_command_palette()}</span>
                        <kbd>{m.welcome_shortcut_command_palette()}</kbd>
                    </button>
                </div>

                <div className={styles.group}>
                    <div className={styles.rule}>
                        <span>{m.welcome_recent_projects()}</span>
                    </div>
                    {recentProjects.length > 0 ? (
                        recentProjects.map((project) => (
                            <div className={styles.recentProject} key={project}>
                                <button
                                    className={`${styles.action} ${styles.recentAction}`}
                                    type="button"
                                    onClick={() => onOpenRecentProject(project)}
                                >
                                    <span className={styles.actionIcon}>[]</span>
                                    <span>{project}</span>
                                </button>
                                <button
                                    aria-label={m.welcome_remove_recent_project()}
                                    className={styles.recentRemove}
                                    title={m.welcome_remove_recent_project()}
                                    type="button"
                                    onClick={() => onRemoveRecentProject(project)}
                                >
                                    <span aria-hidden="true">&times;</span>
                                </button>
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
