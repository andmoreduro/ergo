import { ErgoThemeLogo } from "../../atoms/ErgoThemeLogo/ErgoThemeLogo";
import { Button } from "../../atoms/Button/Button";
import { HoverRevealDismissButton } from "../../atoms/HoverRevealDismissButton/HoverRevealDismissButton";
import { TwoLineListPickerItem } from "../../molecules/TwoLineListPickerItem/TwoLineListPickerItem";
import { useContextMenuTrigger } from "../../organisms/ContextMenu/ContextMenuProvider";
import { twoLineLabelsForProjectPath } from "../../../project/paths";
import type { KeymapProfile } from "../../../commands/types";
import { lookupActionShortcut } from "../../../settings/keymap";
import { m } from "../../../paraglide/messages.js";
import styles from "./WelcomeScreen.module.css";
export interface WelcomeScreenProps {
    keymap: KeymapProfile;
    recentProjects: string[];
    onNewProject: () => void;
    onOpenProject: () => void;
    onOpenRecentProject: (path: string) => void;
    onRemoveRecentProject: (path: string) => void;
    onCommandPalette: () => void;
}

export const WelcomeScreen = ({
    keymap,
    recentProjects,
    onNewProject,
    onOpenProject,
    onOpenRecentProject,
    onRemoveRecentProject,
    onCommandPalette,
}: WelcomeScreenProps) => {
    const contextMenu = useContextMenuTrigger("app");
    const newProjectShortcut = lookupActionShortcut(
        keymap,
        "workspace::NewProject",
        "app",
    );
    const openProjectShortcut = lookupActionShortcut(
        keymap,
        "workspace::OpenProject",
        "app",
    );
    const commandPaletteShortcut = lookupActionShortcut(
        keymap,
        "view::OpenCommandPalette",
        "app",
    );

    return (
        <main className={styles.screen} {...contextMenu}>
            <section className={styles.panel} aria-labelledby="welcome-title">
                <header className={styles.header}>
                    <ErgoThemeLogo
                        className={styles.appIcon}
                        alt={m.welcome_app_icon_label()}
                    />
                    <div>
                        <h1 id="welcome-title">{m.welcome_title()}</h1>
                        <p>{m.welcome_tagline()}</p>
                    </div>
                </header>

                <section className={styles.section} aria-labelledby="welcome-get-started">
                    <h2 id="welcome-get-started" className={styles.sectionTitle}>
                        {m.welcome_get_started()}
                    </h2>
                    <div className={styles.actions}>
                        <Button fullWidth variant="ghost" onClick={onNewProject}>
                            <span className={styles.actionLabel}>
                                <span>{m.welcome_new_project()}</span>
                                {newProjectShortcut ? (
                                    <span className={styles.actionShortcut}>
                                        {newProjectShortcut}
                                    </span>
                                ) : null}
                            </span>
                        </Button>
                        <Button fullWidth variant="ghost" onClick={onOpenProject}>
                            <span className={styles.actionLabel}>
                                <span>{m.welcome_open_project()}</span>
                                {openProjectShortcut ? (
                                    <span className={styles.actionShortcut}>
                                        {openProjectShortcut}
                                    </span>
                                ) : null}
                            </span>
                        </Button>
                        <Button fullWidth variant="ghost" onClick={onCommandPalette}>
                            <span className={styles.actionLabel}>
                                <span>{m.welcome_command_palette()}</span>
                                {commandPaletteShortcut ? (
                                    <span className={styles.actionShortcut}>
                                        {commandPaletteShortcut}
                                    </span>
                                ) : null}
                            </span>
                        </Button>
                    </div>
                </section>

                <section className={styles.section} aria-labelledby="welcome-recent">
                    <h2 id="welcome-recent" className={styles.sectionTitle}>
                        {m.welcome_recent_projects()}
                    </h2>
                    {recentProjects.length > 0 ? (
                        <ul className={styles.recentList}>
                            {recentProjects.map((project) => {
                                const labels = twoLineLabelsForProjectPath(project);
                                return (
                                <li className={styles.recentItem} key={project}>
                                    <TwoLineListPickerItem
                                        className={styles.recentButton}
                                        primary={labels.primary}
                                        secondary={labels.secondary}
                                        title={labels.title}
                                        onSelect={() => onOpenRecentProject(project)}
                                    />
                                    <HoverRevealDismissButton
                                        className={styles.recentRemove}
                                        aria-label={m.welcome_remove_recent_project()}
                                        title={m.welcome_remove_recent_project()}
                                        onClick={() => onRemoveRecentProject(project)}
                                    >
                                        ×
                                    </HoverRevealDismissButton>
                                </li>
                                );
                            })}                        </ul>
                    ) : (
                        <p className={styles.empty}>{m.welcome_no_recent_projects()}</p>
                    )}
                </section>
            </section>
        </main>
    );
};
