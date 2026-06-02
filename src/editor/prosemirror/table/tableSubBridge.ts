import type { Node as PMNode } from "prosemirror-model";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import {
    cellFragmentToElements,
    tableCellToSubDocNodes,
} from "./tableCellBridge";
import { type TableSchema, tableSchema } from "./tableSchema";

export type TableElement = Extract<DocumentElement, { type: "Table" }>;

export const tableToSubDoc = (
    schema: TableSchema = tableSchema,
    table: TableElement,
): PMNode => {
    const rows = table.cells.map((row) => {
        const cells = row.map((cell) => {
            const colspan = cell.col_span ?? 1;
            const rowspan = cell.row_span ?? 1;
            return schema.nodes.table_cell.create(
                { colspan, rowspan },
                tableCellToSubDocNodes(schema, cell),
            );
        });
        return schema.nodes.table_row.create(null, cells);
    });
    const inner = schema.nodes.table.create(null, rows);
    return schema.nodes.doc.create(null, [inner]);
};

export const subDocToTable = (doc: PMNode, prev: TableElement): TableElement => {
    const tableNode = doc.firstChild;
    if (!tableNode || tableNode.type.name !== "table") {
        throw new Error("Table sub-document must contain a table node");
    }

    const cells: TableElement["cells"] = [];
    tableNode.content.forEach((row) => {
        const rowCells: TableElement["cells"][number] = [];
        row.content.forEach((cell) => {
            const rowspan = cell.attrs.rowspan ?? 1;
            const colspan = cell.attrs.colspan ?? 1;
            rowCells.push({
                elements: cellFragmentToElements(tableSchema, cell.content),
                row_span: rowspan !== 1 ? rowspan : null,
                col_span: colspan !== 1 ? colspan : null,
            });
        });
        cells.push(rowCells);
    });

    const cols =
        cells[0]?.reduce((total, cell) => total + (cell.col_span ?? 1), 0) ?? 0;

    return {
        type: "Table",
        id: prev.id,
        rows: cells.length,
        cols,
        cells,
        column_sizes: prev.column_sizes,
        extra_fields: prev.extra_fields,
    };
};
