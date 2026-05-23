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
    spec: TemplateSpec | null;
};

const TemplateSpecContext = createContext<TemplateSpecContextValue | undefined>(
    undefined,
);

export const TemplateSpecProvider = ({
    templateId,
    children,
}: {
    templateId: string;
    children: ReactNode;
}) => {
    const [spec, setSpec] = useState<TemplateSpec | null>(null);

    useEffect(() => {
        let cancelled = false;
        setSpec(null);
        void TauriApi.getTemplateSpec(templateId).then((loaded) => {
            if (!cancelled) {
                setSpec(loaded);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [templateId]);

    const value = useMemo(
        () => ({
            templateId,
            spec,
        }),
        [templateId, spec],
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
