# Rule: Workflow, Documentation, and Issue Management

## 1. Documentation Structure
The root of the project must constantly maintain a `docs/` directory containing the following files:
- `Changelog.md` — Project modification history adhering to the "Keep a Changelog" standard.
- `features.md` — A checklist of planned and implemented new functionalities, including the phased implementation roadmap.
- `dependencies.md` — Matrix of required, candidate, active, and deprecated dependencies mapped to features and development stages.
- `bugs.md` — A checklist of identified and resolved bugs.
- `system_architecture.md` — Comprehensive system architecture, API documentation, module descriptions, and flow diagrams.

## 2. Managing New Features (`features.md`)
- The file maintains a checklist format using Markdown (`- [ ] Feature Name`).
- **Upon receiving a task for new functionality:** 
  1. The AI must first add a new entry to `features.md` if it does not already exist.
  2. Analyze technical dependencies and update `docs/dependencies.md` with any required/candidate libraries, Gradle coordinates, and target tier (`Client`, `Server`, or `Common`).
- **When instructed to implement a feature from the list:** The AI must read the feature description, analyze the context, ensure required dependencies are active in `dependencies.md`, and **output a step-by-step development plan** before writing any code.
- **Upon successful implementation, the AI must:**
  1. Mark the item as completed (`- [x] Feature Name`).
  2. Ensure all newly introduced dependencies in `docs/dependencies.md` are marked with status `Active`.
  3. Update `system_architecture.md` (sync diagrams, functions, and APIs with the new reality).
  4. Log the implemented feature in `Changelog.md` under the `[Unreleased]` section, categorized properly (e.g., `### Added` or `### Changed`).

## 3. Managing Dependencies (`dependencies.md`)
- **Living Document Principle:** `dependencies.md` must remain strictly synchronized with `features.md`, architectural decisions, and Gradle version catalogs (`libs.versions.toml`).
- **Feature Analysis Trigger:** Whenever a feature is analyzed, planned, or modified in `features.md`, the AI must check if new third-party libraries, SDKs, or tools are needed and record them under the appropriate category.
- **Clarification & Decision Updates:** When answers to clarifying questions or architectural decisions are made:
  - If a candidate dependency is chosen, transition its status to `Planned` or `Active`.
  - If a proposed dependency is deemed unneeded, rejected, or superseded by an alternative, the AI must mark it as `Irrelevant` / `Rejected` (with a brief rationale) or remove it from the active matrix to prevent tech-debt.
- **Categorization:** Dependencies must be organized by domain (Core UI, Text Editor, Handwritten Canvas, Storage, Security/E2EE, Networking/Sync, Collaboration, Import/Export, Server/DB, Tooling/MCP) and target (`Client`, `Server`, `Shared/Common`).

## 4. Managing Bugs (`bugs.md`)
- The workflow mirrors feature development.
- Identified bugs must be logged in `bugs.md` as unchecked list items.
- When instructed to fix a bug, the AI must formulate a troubleshooting and resolution plan.
- After fixing, the AI must check off the item (`[x]`), adjust `system_architecture.md` if the fix required architectural shifts, and document the fix in `Changelog.md` under the `[Unreleased]` -> `### Fixed` section.

## 5. System Architecture & Lifecycle Standard (`system_architecture.md`)
- **Single Source of Architectural Truth**: This document must remain the single source of truth for application architecture, runtime components, and data protocols.
- **Three-Stage Lifecycle**:
  1. **Initial Scaffolding**: Must be generated immediately when tech stack and initial vision are identified during project initiation/scaffolding (`project-scaffolding-architect` / `existing-project-onboarding`).
  2. **Phase Synthesis**: Deepened with complete data models, contracts, and interaction flows during architectural blueprinting (`system-architecture-analyst`).
  3. **Continuous Sync**: Synchronously updated upon feature completion by the Acceptance Manager (`acceptance-manager`).
- **Diagramming Skill:** The AI must seamlessly generate and maintain architecture charts, sequence diagrams, and flowcharts directly inside the Markdown file using **Mermaid.js** syntax. No external image generation is required; rely exclusively on Mermaid blocks (````mermaid ````).

## 6. Release Cycle and Changelog Standard
- `Changelog.md` must strictly follow the **Keep a Changelog** standard, utilizing categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`.
- **Release Automation:** The AI must develop and maintain a custom Gradle task (e.g., in `build.gradle.kts` or `buildSrc`) designed to be executed by GitHub Actions (e.g., `./gradlew generateRelease`).
- **On triggering the Release Task, the script must:**
  1. Parse the `[Unreleased]` block in `Changelog.md`.
  2. Prompt for or calculate the upcoming version number (SemVer).
  3. Replace the `[Unreleased]` header with the new version number and current date.
  4. Inject a new, empty `[Unreleased]` section at the top of the document.
  5. Export the parsed release notes to a format consumable by GitHub Actions for creating a GitHub Release.
