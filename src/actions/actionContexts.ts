export const ContextNames = {
    app: "app",
    welcome: "welcome",
    workspace: "workspace",
    editor: "editor",
    body: "body",
    element: "element",
    dialog: "dialog",
    quote: "quote",
    table: "table",
    tableCell: "tableCell",
    bibliography: "bibliography",
    resources: "resources",
    coverPage: "coverPage",
    preview: "preview",
    input: "input",
    settings: "settings",
    inlineElement: "inlineElement",
} as const;

export const ContextAttributes = {
    elementKind: "element.kind",
    elementId: "element.id",
    quoteInline: "quote.inline",
    dialogKind: "dialog.kind",
} as const;
