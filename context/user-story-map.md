# Actor Definition and User Story Map

As Érgo utilizes an Agile desktop application architecture (without traditional multi-tenant cloud roles), this document replaces the traditional strict "Use Case Diagram" and "Role Definition." Instead, it uses a **User Story Map** to visually outline the system's capabilities and the user's journey through the application, satisfying the requirement for high-level capability modeling.

## Actor Definition

In the context of the Érgo IDE (v1.0), there is only one primary actor interacting with the system boundaries.

* **Actor Name:** The Author / Academic
* **Description:** A local user interacting directly with the Érgo desktop application. They are responsible for creating, configuring, authoring, and exporting documents. The system relies entirely on this actor's inputs, as there are no background administrative roles, secondary editors, or external system actors in this self-contained workflow.

## User Story Map (High-Level Capability Diagram)

The following diagram maps the Agile **User Stories** across the chronological **User Journey** (horizontal axis), grouped by specific functional phases (vertical axis). This provides a complete "bird's-eye view" of what the Actor can do within the system.

**Diagram Notes:**
* "The Author" acts as the Primary Actor within the local boundaries of the application.
* "J1" through "J6" represent the high-level steps (the Journey) the user takes.
* The story codes (e.g., US1.1) correspond directly to the formal requirements listed in the User Stories specification.

```mermaid
flowchart LR
    %% Styling and Classes
    classDef journey fill:#2c3e50,color:#fff,stroke:#333,stroke-width:2px,font-weight:bold;
    classDef story fill:#ecf0f1,color:#2c3e50,stroke:#bdc3c7,stroke-width:1px;
    classDef actor fill:#e67e22,color:#fff,stroke:#d35400,stroke-width:2px,font-weight:bold;

    %% Primary Actor
    %% Note: "The Author" acts as the Primary Actor within the local boundaries of the application.
    Actor["👤 The Author"]:::actor

    subgraph SystemCapabilities [System Capabilities]
        direction LR
        
        %% Phase 1
        
        %% Phase 0
        subgraph S0 [Infrastructure & QA]
            direction TB
            J0["Establish Foundation"]:::journey
            E0_1[Epic 0 UI Primitives]:::story
            E9_1[Epic 9 Unit & E2E Testing]:::story
            E9_2[Epic 9 IPC Type Sync]:::story
            E9_5[Epic 9 Backend Source Session]:::story
            E9_6[Epic 9 SVG Preview Contract]:::story
            J0 --- E0_1 --- E9_1 --- E9_2 --- E9_5 --- E9_6
        end

        subgraph S1 [Initialization]
            direction TB
            J1["Setup Project"]:::journey
            E1_1[US1.1 Create via Template]:::story
            E1_2[US1.2 Open Existing]:::story
            E1_7[US1.7 Welcome Screen]:::story
            E2_1[US2.1 Global Settings]:::story
            E2_2[US2.2 Project Settings]:::story
            E2_3[US2.3 History Buffer]:::story
            J1 --- E1_1 --- E1_2 --- E1_7 --- E2_1 --- E2_2 --- E2_3
        end

        %% Phase 2
        subgraph S2 [Workspace Layout]
            direction TB
            J2["Navigate UI"]:::journey
            E3_1[US3.1 Tri-Column UI]:::story
            E3_2[US3.2 Sidebar Menus]:::story
            E3_4[US3.4 Key Shortcuts]:::story
            E3_5[US3.5 Custom Keymaps]:::story
            E3_6[US3.6 Menubar]:::story
            E8_2[US8.2 Localization]:::story
            E8_3[Tech8.3 Paraglide]:::story
            J2 --- E3_1 --- E3_2 --- E3_4 --- E3_5 --- E3_6 --- E8_2 --- E8_3
        end

        %% Phase 3
        subgraph S3 [Content Authoring]
            direction TB
            J3["Edit Content"]:::journey
            E1_3[US1.3 Toggle Sections]:::story
            E1_4[US1.4 Form Adaptability]:::story
            E4_1[US4.1 Paragraphs]:::story
            E4_2[US4.2 Inline Embeds]:::story
            E4_3[US4.3 Inline Highlight]:::story
            E4_4[US4.4 Headings]:::story
            E4_8[US4.8 Delete Confirm]:::story
            E4_9[US4.9 Input Sanitize]:::story
            J3 --- E1_3 --- E1_4 --- E4_1 --- E4_2 --- E4_3 --- E4_4 --- E4_8 --- E4_9
        end

        %% Phase 4
        subgraph S4 [Advanced Elements]
            direction TB
            J4["Insert & Reference"]:::journey
            E3_3[US3.3 Visual Insert]:::story
            E4_5[US4.5 Visual Tables]:::story
            E4_6[US4.6 Figure Settings]:::story
            E4_7[US4.7 Math Autocomplete]:::story
            E4_10[US4.10 LaTeX Math]:::story
            E7_1[US7.1 Universal IDs]:::story
            E7_2[US7.2 Manual Labels]:::story
            E7_3[US7.3 Bibliography]:::story
            E7_4[US7.4 Ref Dropdown]:::story
            J4 --- E3_3 --- E4_5 --- E4_6 --- E4_7 --- E4_10 --- E7_1 --- E7_2 --- E7_3 --- E7_4
        end

        %% Phase 5
        subgraph S5 [Rendering & Sync]
            direction TB
            J5["Live Preview"]:::journey
            E5_1[US5.1 Real-Time Render]:::story
            E5_2[US5.2 Prioritize Render]:::story
            E5_3[US5.3 Background Save]:::story
            E6_1[US6.1 Forward Sync]:::story
            E6_2[US6.2 Backward Sync]:::story
            J5 --- E5_1 --- E5_2 --- E5_3 --- E6_1 --- E6_2
        end

        %% Phase 6
        subgraph S6 [Distribution]
            direction TB
            J6["Export & Share"]:::journey
            E1_5[US1.5 Multiformat Export]:::story
            E1_6[US1.6 Online/Offline Modes]:::story
            E8_1[US8.1 Desktop Installers]:::story
            J6 --- E1_5 --- E1_6 --- E8_1
        end

        %% Journey Flow
        S0 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6
    end

    %% Actor Interaction
    Actor --> SystemCapabilities
```
