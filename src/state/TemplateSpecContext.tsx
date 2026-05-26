import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { TauriApi } from "../api/tauri";
import type { TemplateSpec } from "../bindings/TemplateSpec";

type TemplateSpecContextValue = {
    templateId: string;
    variantId: string | null;
    spec: TemplateSpec | null;
};

const TemplateSpecContext = createContext<TemplateSpecContextValue | undefined>(
    undefined,
);

export const TemplateSpecProvider = ({
    templateId,
    variantId,
    children,
}: {
    templateId: string;
    variantId?: string | null;
    children: ReactNode;
}) => {
    const [spec, setSpec] = useState<TemplateSpec | null>(null);

    useEffect(() => {
        let cancelled = false;
        setSpec(null);
        void TauriApi.getTemplateSpec(templateId, variantId).then((loaded) => {
            if (!cancelled) {
                setSpec(loaded);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [templateId, variantId]);

    const value = useMemo(
        () => ({
            templateId,
            variantId: variantId ?? null,
            spec,
        }),
        [templateId, variantId, spec],
    );

    return (
        <TemplateSpecContext.Provider value={value}>
            {children}
        </TemplateSpecContext.Provider>
    );
};

export const useTemplateSpecContext = (): TemplateSpecContextValue => {
    const context = useContext(TemplateSpecContext);
    if (context === undefined) {
        throw new Error(
            "useTemplateSpecContext must be used within a TemplateSpecProvider",
        );
    }
    return context;
};

export const useOptionalTemplateSpecContext = ():
    | TemplateSpecContextValue
    | undefined => useContext(TemplateSpecContext);
