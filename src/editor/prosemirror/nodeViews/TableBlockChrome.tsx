import { useDocumentAst } from "../../../state/DocumentContext";
import { useElementSettingsShortcut } from "../../../components/organisms/ElementEditor/useElementSettingsShortcut";
import { TableSettingsPanel } from "../../../components/organisms/ElementEditor/table/TableSettingsPanel";
import type { TableElement } from "../table/tableSubBridge";
import chromeStyles from "./tableBlockNodeView.module.css";

export const TableBlockChrome = ({
    elementFromNode,
    elementId,
    editing,
}: {
    elementFromNode: TableElement | null;
    elementId: string;
    editing: boolean;
}) => {
    const { state } = useDocumentAst();
    const settings = useElementSettingsShortcut(elementId);

    const element =
        elementFromNode ??
        (() => {
            for (const section of state.sections) {
                if (section.type !== "Content") {
                    continue;
                }
                const found = section.elements.find(
                    (entry) => entry.type === "Table" && entry.id === elementId,
                );
                if (found?.type === "Table") {
                    return found;
                }
            }
            return null;
        })();

    if (!element) {
        return null;
    }

    return (
        <div className={chromeStyles.chrome}>
            {editing ? (
                <TableSettingsPanel
                    element={element}
                    open={settings.open}
                    onOpenChange={settings.setOpen}
                />
            ) : null}
        </div>
    );
};
