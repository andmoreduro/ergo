import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem {
    id: string;
    label: string;
    /** Optional glyph shown instead of the label; `label` becomes the
     *  accessible name and tooltip when set. */
    icon?: ReactNode;
    panel: ReactNode;
}

export interface TabsProps {
    tabs: TabItem[];
    defaultTabId?: string;
    ariaLabel?: string;
    className?: string;
}

/**
 * Accessible tabbed container. Renders a sticky tab bar and only the active
 * panel; the caller owns each panel's content. Arrow/Home/End move between tabs
 * (WAI-ARIA tabs pattern).
 */
export const Tabs = ({ tabs, defaultTabId, ariaLabel, className = "" }: TabsProps) => {
    const baseId = useId();
    const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? "");
    const activeIndex = Math.max(
        0,
        tabs.findIndex((tab) => tab.id === activeId),
    );
    const activeTab = tabs[activeIndex] ?? tabs[0];

    const tabDomId = (id: string) => `${baseId}-tab-${id}`;
    const panelDomId = (id: string) => `${baseId}-panel-${id}`;

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (tabs.length === 0) {
            return;
        }
        let nextIndex: number | null = null;
        if (event.key === "ArrowRight") {
            nextIndex = (activeIndex + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
            nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = tabs.length - 1;
        }
        if (nextIndex === null) {
            return;
        }
        event.preventDefault();
        const next = tabs[nextIndex];
        setActiveId(next.id);
        document.getElementById(tabDomId(next.id))?.focus();
    };

    if (!activeTab) {
        return null;
    }

    return (
        <div className={className ? `${styles.tabs} ${className}` : styles.tabs}>
            <div
                role="tablist"
                aria-label={ariaLabel}
                aria-orientation="horizontal"
                className={styles.tablist}
                onKeyDown={onKeyDown}
            >
                {tabs.map((tab) => {
                    const selected = tab.id === activeTab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            id={tabDomId(tab.id)}
                            aria-selected={selected}
                            aria-controls={panelDomId(tab.id)}
                            aria-label={tab.icon ? tab.label : undefined}
                            title={tab.label}
                            tabIndex={selected ? 0 : -1}
                            className={
                                selected
                                    ? `${styles.tab} ${styles.tabActive}`
                                    : styles.tab
                            }
                            onClick={() => setActiveId(tab.id)}
                        >
                            {tab.icon ? (
                                <span
                                    className={styles.tabIcon}
                                    aria-hidden="true"
                                >
                                    {tab.icon}
                                </span>
                            ) : (
                                tab.label
                            )}
                        </button>
                    );
                })}
            </div>
            <div
                role="tabpanel"
                id={panelDomId(activeTab.id)}
                aria-labelledby={tabDomId(activeTab.id)}
                className={styles.panel}
            >
                {activeTab.panel}
            </div>
        </div>
    );
};
