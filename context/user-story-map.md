# Actor definition and user story map

Érgo is a single-user local desktop application. This document defines the primary actor and maps product capabilities across the author’s journey. Story codes (e.g. US1.1) match `user-stories.md` and `requirements.md`.

## Actor definition

* **Actor name:** The author / academic
* **Description:** A local user of the Érgo desktop app who creates projects, edits structured metadata and body content, manages bibliography and resources, previews compiled output, and exports finished documents. There are no multi-tenant roles, shared editing, or external workflow actors in v1.

## User story map

The horizontal axis is the chronological journey; the vertical groupings are functional phases. Technical epics (Epic 9) underpin all phases but sit outside the journey spine.

```mermaid
flowchart LR
    Actor[Author]
    subgraph SystemCapabilities [System capabilities]
        direction LR
        subgraph S0 [Foundation]
            direction TB
            J0[Platform and architecture]
            T9_1[Tech9.1 Design system]
            T9_2[Tech9.2 Rust Typst session]
            T9_3[Tech9.3 WASM preview]
            T9_4[Tech9.4 IPC bindings]
            T9_5[Tech9.5 Action catalog]
            J0 --- T9_1 --- T9_2 --- T9_3 --- T9_4 --- T9_5
        end
        subgraph S1 [Project setup]
            direction TB
            J1[Start or resume]
            E1_1[US1.1 Create project]
            E1_2[US1.2 Open project]
            E1_3[US1.3 Recent projects]
            E1_4[US1.4 Welcome screen]
            E1_5[US1.5 Close project]
            E2_1[US2.1 Global settings]
            E2_2[US2.2 Project settings]
            E2_3[US2.3 Keymap settings]
            J1 --- E1_1 --- E1_2 --- E1_3 --- E1_4 --- E1_5 --- E2_1 --- E2_2 --- E2_3
        end
        subgraph S2 [Workspace]
            direction TB
            J2[Navigate UI]
            E3_1[US3.1 Tri-column layout]
            E3_2[US3.2 Sidebar panels]
            E3_4[US3.4 Menubar]
            E3_5[US3.5 Command palette]
            E3_6[US3.6 Find and replace]
            E3_7[US3.7 Keyboard actions]
            E8_2[US8.2 UI localization]
            E8_3[US8.3 Template locales]
            J2 --- E3_1 --- E3_2 --- E3_4 --- E3_5 --- E3_6 --- E3_7 --- E8_2 --- E8_3
        end
        subgraph S3 [Metadata and forms]
            direction TB
            J3[Configure document]
            E1_6[US1.6 Template forms]
            E1_7[US1.7 Variants and options]
            E1_8[US1.8 Outline overrides]
            E1_9[US1.9 Author references]
            E4_14[US4.14 Field types]
            J3 --- E1_6 --- E1_7 --- E1_8 --- E1_9 --- E4_14
        end
        subgraph S4 [Body authoring]
            direction TB
            J4[Edit body]
            E3_3[US3.3 Editor toolbar]
            E4_1[US4.1 ProseMirror body]
            E4_2[US4.2 Paragraph flow]
            E4_3[US4.3 Headings]
            E4_4[US4.4 Inline embeds]
            E4_8[US4.8 Quotes]
            E4_9[US4.9 Lists]
            E4_10[US4.10 Diagrams]
            E4_11[US4.11 Element settings]
            E4_12[US4.12 Delete confirm]
            E4_13[US4.13 Sanitization]
            J4 --- E3_3 --- E4_1 --- E4_2 --- E4_3 --- E4_4 --- E4_8 --- E4_9 --- E4_10 --- E4_11 --- E4_12 --- E4_13
        end
        subgraph S5 [Rich elements and refs]
            direction TB
            J5[Tables figures math]
            E4_5[US4.5 Tables]
            E4_6[US4.6 Figures]
            E4_7[US4.7 Equations]
            E7_1[US7.1 Stable IDs]
            E7_2[US7.2 Bibliography editor]
            E7_3[US7.3 Insert reference]
            E7_4[US7.4 Metadata lookup]
            E7_5[US7.5 Resource catalog]
            J5 --- E4_5 --- E4_6 --- E4_7 --- E7_1 --- E7_2 --- E7_3 --- E7_4 --- E7_5
        end
        subgraph S6 [Preview and sync]
            direction TB
            J6[Live preview]
            E5_1[US5.1 Live preview]
            E5_2[US5.2 Stable layout]
            E5_3[US5.3 Autosave]
            E5_4[US5.4 Manual save]
            E5_5[US5.5 Zoom and fit]
            E6_1[US6.1 Forward sync]
            E6_2[US6.2 Backward sync]
            E6_3[US6.3 Outline jumps]
            J6 --- E5_1 --- E5_2 --- E5_3 --- E5_4 --- E5_5 --- E6_1 --- E6_2 --- E6_3
        end
        subgraph S7 [Export]
            direction TB
            J7[Export and share]
            E1_10[US1.10 Document export]
            E1_11[US1.11 Bibliography export]
            E8_1[US8.1 Desktop app]
            J7 --- E1_10 --- E1_11 --- E8_1
        end
        S0 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7
    end
    Actor --> SystemCapabilities
```
