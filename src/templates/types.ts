export interface TemplateIdentity {
    id: string;
    name: string;
    version: string;
    description?: string;
}

export type ImportSymbol =
    | string
    | { symbol: string; alias: string };

export interface PackageDependency {
    name: string;
    version: string;
    imports: ImportSymbol[];
}

export interface PackageSpec {
    name: string;
    version: string;
    imports: ImportSymbol[];
    dependencies?: PackageDependency[];
}

export type ParamType =
    | "content"
    | "string"
    | "length"
    | "boolean"
    | "integer"
    | "float"
    | "string_array"
    | "author_list"
    | "affiliation_map";

export interface ParamSpec {
    key: string;
    type: ParamType;
    source: string;
    default?: any;
    label?: string;
}

export interface ShowRuleSpec {
    function: string;
    params?: ParamSpec[];
}

export type SectionKind = "function_call" | "content" | "bibliography" | "appendix";

export interface SectionSpec {
    id: string;
    kind: SectionKind;
    label: string;
    function?: string;
    params?: ParamSpec[];
    file?: string;
    title?: string;
    pagebreak_before?: boolean;
    show_rule?: string;
}

export interface ExtraFieldSpec {
    key: string;
    type: "content" | "string";
    label: string;
}

export interface ElementOverrideSpec {
    function?: string;
    wrapper?: string;
    extra_fields?: ExtraFieldSpec[];
}

export interface ElementOverrides {
    figure?: ElementOverrideSpec;
    table?: ElementOverrideSpec;
}

export interface DefaultsSpec {
    paper_size?: string;
    language?: string;
    text_font?: string;
    math_font?: string;
    raw_font?: string;
    font_size?: number;
    table_stroke_width?: number;
}

export type InputType =
    | "string"
    | "integer"
    | "float"
    | "boolean"
    | "array"
    | "object"
    | "reference"
    | "content";

export type Importance = "required" | "recommended" | "optional";

export interface InputSchema {
    id?: string;
    type: InputType;
    label?: string;
    description?: string;
    default?: any;
    importance?: Importance;
    properties?: InputSchema[];
    items?: InputSchema;
    target?: string;
}

export interface InputGroupSpec {
    id: string;
    label: string;
    inputs: string[];
}

export interface CustomElementSpec {
    kind: string;
    label: string;
    description?: string;
    function: string;
    fields: ParamSpec[];
}

export interface ResourcePreviewPolicySpec {
    width_pt?: number;
    margin_pt?: number;
    wrapper?: string;
}

export interface PastedImagePolicySpec {
    behavior?: "resource" | "figure";
    wrapper?: string;
}

export interface ResourcePolicySpec {
    preview?: ResourcePreviewPolicySpec;
    pasted_image?: PastedImagePolicySpec;
}

export interface TemplateSpec {
    template: TemplateIdentity;
    package: PackageSpec;
    show_rule?: ShowRuleSpec;
    inputs?: InputSchema[];
    groups?: InputGroupSpec[];
    custom_elements?: CustomElementSpec[];
    resource_policy?: ResourcePolicySpec;
    sections: SectionSpec[];
    element_overrides?: ElementOverrides;
    defaults?: DefaultsSpec;
}
