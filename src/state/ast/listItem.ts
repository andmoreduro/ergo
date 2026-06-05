import type { ListItem } from "../../bindings/ListItem";
import type { RichText } from "../../bindings/RichText";
import { richTextPlainLength } from "../../richText/richText";
import { createRichText } from "./defaults";

export const createListItem = (text = ""): ListItem => ({
    content: text ? [createRichText(text)] : [createRichText("")],
    children: [],
});

export const listItemPlainLength = (item: ListItem): number =>
    richTextPlainLength(item.content) +
    item.children.reduce((sum, child) => sum + listItemPlainLength(child), 0);

export const getListItemAtPath = (
    items: ListItem[],
    path: readonly number[],
): ListItem | null => {
    if (path.length === 0) {
        return null;
    }
    const [head, ...rest] = path;
    const item = items[head];
    if (!item) {
        return null;
    }
    if (rest.length === 0) {
        return item;
    }
    return getListItemAtPath(item.children, rest);
};

export const updateListItemAtPath = (
    items: ListItem[],
    path: readonly number[],
    content: RichText[],
): ListItem[] => {
    if (path.length === 0) {
        return items;
    }
    const [head, ...rest] = path;
    return items.map((item, index) => {
        if (index !== head) {
            return item;
        }
        if (rest.length === 0) {
            return { ...item, content };
        }
        return {
            ...item,
            children: updateListItemAtPath(item.children, rest, content),
        };
    });
};

export const appendListItem = (items: ListItem[], content: RichText[]): ListItem[] => [
    ...items,
    { content, children: [] },
];
