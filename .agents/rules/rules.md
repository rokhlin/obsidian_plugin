# Rule: Core Operating Guidelines

1. **Decoupling Rule**: Keep project management metadata cleanly decoupled from application runtime code.
2. **Language Rule**: English only across all documentation and markdown files.
3. **Traceability Rule**: Every feature ticket in `projects/<project>/features/` must cross-reference target repository paths (e.g. `notesClientApp`, `notesServer`).
4. **Pre-PM Discovery & Scaffolding Rule**: Greenfield projects must be initiated by `project-initiator` to execute the 30–50 Q&A questionnaire, establish repository boundaries, deploy `.agents/rules/`, and initialize `docs/` (`roadmap.md`, `dependencies.md`, `system_architecture.md`) prior to `product-manager` task formulation.
5. **Living Documentation Rule**: Target projects must maintain their `docs/` suite (`roadmap.md`, `dependencies.md`, `system_architecture.md`, `Changelog.md`) continuously synchronized with code changes.
6. **Workspace-Relative Paths Rule**: SDM is integrated at the workspace level. All repository mappings, documentation references, and cross-project links must strictly use workspace-relative paths. Machine-specific absolute paths (e.g. `C:/...`, local user directories, or absolute file URIs) are strictly forbidden to ensure seamless portability across environments and developer workstations.
7. **Session Branching Rule**: When working with any agent within System Development Management, a dedicated branch must be created for the session's work before any modifications are made. Branch naming format: `<project_name>/<work_type_or_agent_name>/<feature_name>`. All session changes must be committed to this branch. Every new user request or distinct agent invocation requires switching to a new dedicated branch.
8. **Project Scope Isolation Rule**: During project tasks, changes are strictly confined to `projects/<projectName>/`. Modifying meta-framework directories (`.agents/agents/`, `.agents/rules/`, `.agents/skills/`, etc.) during project tasks is strictly prohibited.


