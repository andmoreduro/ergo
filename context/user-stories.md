# Érgo User Stories

This document categorizes the core functionalities of Érgo into specific Epics and User Stories. These are written from the perspective of the end-user, focusing on desired outcomes rather than technical implementation details.

## Epic 0: Foundational UI & Design System (Technical Epic)

- **Tech0.1 (Atoms) - Core Primitives:** Build the core primitive UI components (e.g., base buttons, text inputs, checkboxes, typography wrappers) completely from scratch to establish the visual language and unblock feature development.
- **Tech0.2 (Molecules) - Reusable Combinations:** Build reusable, simple component combinations (e.g., labeled form inputs, accordion headers, styled tooltips) that will be shared across multiple forms and features.
- **Tech0.3 (Infrastructure) - Styling Architecture:** Setup the foundational custom styling architecture and design tokens (colors, spacing, typography) to ensure consistency since no external CSS frameworks will be used.

## Epic 1: Project & Template Management

- **US1.1 - Create Project via Template:** As a user, I want to create a new project by naming it, reviewing the Documents-folder destination, optionally choosing a different folder, optionally disabling the default generated file name, and selecting a document template (e.g., APA7) so that my work automatically adheres to strict formatting standards from the beginning and is saved as a clear `.ergproj` archive immediately.
- **US1.2 - Open Recent/Existing Projects:** As a user, I want to easily open recent projects or browse for existing project files so that I can seamlessly resume my work.
- **US1.7 - Welcome Screen Entry Point:** As a user, I want a polished welcome screen with New Project, Open Project, command palette, and recent project actions so that I can start or resume work without first entering an empty editor.
- **US1.3 - Toggle Document Sections:** As a user, I want to toggle specific sections of my document (like a cover page) on or off so that I can tailor the template's structure to my specific assignment.
- **US1.4 - Dynamic Form Adaptability:** As a user, I want the editing form to intelligently adapt to my inputs (e.g., adding an affiliation automatically provides matching checkboxes for authors) so that I don't have to enter the same metadata multiple times.
- **US1.5 - Multiformat Document Export:** As a user, I want to export my entire document, specific pages, or individual elements to standard formats (PDF, PNG, SVG) so that I can easily share or publish my finished work.
- **US1.6 - Online/Offline Project Modes:** As a user, I want to save or convert my project file between an "online" mode (lightweight) and an "offline" mode (bundling all dependencies) so that I can optimize for file size or ensure the project compiles anywhere without internet access.

## Epic 2: Settings & Configuration

- **US2.1 - Global Application Settings:** As a user, I want to set application-wide defaults for page size, language, and core fonts so that all my new projects start with my preferred baseline configuration.
- **US2.2 - Local Project Settings Override:** As a user, I want to override default settings on a per-project basis so that I can customize individual documents for unique requirements without altering my global preferences.
- **US2.3 - Configurable History Buffer:** As a user, I want to configure the maximum number of undo/history events kept in memory so that I can prevent the application from consuming too much RAM during long editing sessions.

## Epic 3: Workspace & Navigation UI

- **US3.1 - Resizable Tri-Column Layout:** As a user, I want a resizable three-column interface so that I can simultaneously navigate the document structure, edit my content, and view the final rendered result.
- **US3.2 - Sidebar Navigation Menus:** As a user, I want dedicated sidebar menus for document structure, references, and assets so that I can quickly organize and locate my project's resources.
- **US3.3 - Visual Element Insertion:** As a user, I want straightforward visual buttons to insert complex elements like tables, images, and equations so that I don't have to memorize code commands or markup.
- **US3.4 - Comprehensive Keyboard Navigation:** As a user, I want to use comprehensive keyboard shortcuts for navigation, inserting elements, and standard operations so that I can work efficiently without constantly relying on my mouse.
- **US3.5 - Custom Keymap Configuration:** As a user, I want to be able to customize and remap my keyboard shortcuts so that the IDE matches my personal workflow preferences.
- **US3.6 - Command-Driven Menubar:** As a user, I want a complete localized menubar for project, edit, insert, view, options, and help actions so that desktop workflows feel predictable and native.

## Epic 4: Document Editing & Forms (No-Code Experience)

- **US4.1 - Seamless Paragraph Creation:** As a user, I want to press "Enter" while typing to automatically create a new paragraph so that my writing process feels natural and fluid.
- **US4.2 - Embedded Inline Elements:** As a user, I want to be able to seamlessly embed items like equations and references directly inside my text fields so that my writing isn't interrupted by rigid form limitations.
- **US4.3 - Distinct Inline Highlighting:** As a user, I want embedded items within text to have a distinct background color so that I can easily differentiate them from standard text at a glance.
- **US4.4 - Hierarchical Heading Controls:** As a user, I want to add up to five levels of headings via the interface so that I can logically organize my document.
- **US4.5 - Visual Table Manipulation:** As a user, I want to manipulate tables (add/remove rows and columns, merge cells, and resize columns) using visual UI controls so that I can create complex tables without writing specialized code.
- **US4.6 - Figure Parameter Controls:** As a user, I want dedicated settings for my images and tables so that I can easily define captions and control where they are placed on the page.
- **US4.7 - Math Symbol Autocomplete:** As a user, I want an autocomplete menu for math symbols when editing equations so that I can easily insert complex mathematical notation without memorizing specific syntax.
- **US4.8 - Element Deletion Confirmation:** As a user, I want to be asked for confirmation before deleting entire document elements so that I don't accidentally lose major sections of my work.
- **US4.9 - Automated Input Sanitization:** As a user, I want my text inputs to be automatically sanitized in the background so that accidentally entering special code characters doesn't unexpectedly break my document.
- **US4.10 - Native LaTeX Math Support:** As a user, I want the equation editor to natively support standard LaTeX math syntax so that I can write formulas using a familiar academic standard without having to learn Typst's specific math language.

## Epic 5: Live Preview & Performance

- **US5.1 - Real-Time Document Rendering:** As a user, I want the document preview to update instantly as I type so that I get immediate visual feedback on my edits.
- **US5.2 - Live Preview Prioritization:** As a user, I want the live visual preview to be prioritized over full document exports so that the interface remains incredibly fast and responsive during active typing.
- **US5.3 - Seamless Background Saving:** As a user, I want the application to automatically save my progress in the background without causing the interface to freeze or stutter so that my data is safe without interrupting my workflow.

## Epic 6: Bi-directional Synchronization

- **US6.1 - Forward Sync (Form to Preview):** As a user, I want the live preview to automatically scroll to vertically center the new content I am adding so that I never lose sight of my active editing location.
- **US6.2 - Backward Sync (Preview to Form):** As a user, I want to click on any specific word or visual element in the rendered preview, and have the editor instantly focus the exact input field where that content was written, so that I can quickly fix typos without hunting through long forms.

## Epic 7: References & Labeling

- **US7.1 - Universal Background IDs:** As a user, I want every single element I create (paragraphs, tables, images, equations) to be automatically assigned a unique, invisible identifier in the background so that everything is instantly ready to be cross-referenced without manual setup.
- **US7.2 - Manual Custom Labeling:** As a user, I want to right-click on specific text selections to manually attach a hidden label so that I can create hyperlinks to highly specific parts of my writing.
- **US7.3 - Form-Based Bibliography Editor:** As a user, I want to manage my bibliography using a dedicated form so that I can easily add, remove, and edit citations without learning citation code formats.
- **US7.4 - Searchable Reference Dropdown:** As a user, I want to trigger a searchable dropdown menu (focusable via a keyboard shortcut like `Shift+Enter`) when inserting a reference so that I can rapidly locate the correct label or citation entry.

## Epic 8: Platform & Language Support

- **US8.1 - Native Desktop Installers:** As a user, I want to install and run the application natively on both Linux and Windows operating systems (including via a standard Windows installer) so that I can easily set it up on my preferred computer.
- **US8.2 - English/Spanish Localization:** As a user, I want to be able to switch the application's interface language between English and Spanish so that I can work in the language I am most comfortable with.
- **Tech8.3 - Paraglide Localization Pipeline:** As a developer, I want frontend localization to use Paraglide JS with typed message functions so that translations are tree-shakable, type-safe, and consistent across the welcome screen, menubar, settings, and editor UI.

## Epic 9: Testing & Quality Assurance (Technical Epic)

- **Tech9.1 (Unit Testing) - AST & VFS:** Setup Vitest and Cargo Test to ensure AST reducers and VFS text patching logic are mathematically rigorous and bug-free.
- **Tech9.2 (Component Isolation) - Storybook:** Implement Storybook to test and visualize the custom UI primitives in isolation.
- **Tech9.3 (Type Synchronization) - `ts-rs`:** Integrate the `ts-rs` crate into the Rust backend to automatically generate strict TypeScript interfaces for all IPC payloads.
- **Tech9.4 (E2E Integration) - Playwright:** Establish Playwright for End-to-End testing of the built Tauri desktop application.
- **Tech9.5 (Backend Source Session) - Fragmented Typst Generation:** As a developer, I want Rust to own canonical Typst source generation through a document session, section files, retained Typst sources, and an element fragment cache so that large documents can update preview sources incrementally without regenerating one monolithic file on every edit.
- **Tech9.6 (Preview Artifact Contract) - SVG File Preview:** As a developer, I want preview compilation to write SVG page files into the backend VFS and return page-file metadata to the frontend so that the preview uses the same artifacts that exports and archives can reason about.
