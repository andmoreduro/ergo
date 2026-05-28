import type { DocumentElement } from "../../../bindings/DocumentElement";

export type HeadingElement = Extract<DocumentElement, { type: "Heading" }>;
export type ParagraphElement = Extract<DocumentElement, { type: "Paragraph" }>;
export type EquationElement = Extract<DocumentElement, { type: "Equation" }>;
export type QuoteElement = Extract<DocumentElement, { type: "Quote" }>;
export type DiagramElement = Extract<DocumentElement, { type: "Diagram" }>;
export type ListElement = Extract<DocumentElement, { type: "List" }>;
export type EnumerationElement = Extract<DocumentElement, { type: "Enumeration" }>;
export type TableElement = Extract<DocumentElement, { type: "Table" }>;
export type FigureElement = Extract<DocumentElement, { type: "Figure" }>;
export type CustomElementUnion = Extract<DocumentElement, { type: "Custom" }>;

