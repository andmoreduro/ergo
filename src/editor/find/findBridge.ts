export interface FindBarController {
    open: () => void;
    close: () => void;
    findNext: () => void;
    findPrevious: () => void;
}

let controller: FindBarController | null = null;

export const registerFindBarController = (
    next: FindBarController | null,
): void => {
    controller = next;
};

export const openFindBar = (): void => {
    controller?.open();
};

export const closeFindBar = (): void => {
    controller?.close();
};

export const findNextFromBar = (): void => {
    controller?.findNext();
};

export const findPreviousFromBar = (): void => {
    controller?.findPrevious();
};
