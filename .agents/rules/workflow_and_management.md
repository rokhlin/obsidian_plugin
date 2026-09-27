# Rule: Workflow and Project Management

## 1. Automated Project Provisioning (`project-initiator`)
Prior to product management engagement, the `project-initiator` agent must automatically create the target project management hub in `projects/<project_name>/`:
- `project_overview.md` — Project context, clickable workspace-relative repository mappings, and technical overview.
- `checklist.md` — Master implementation checklist pre-populated with roadmap phases linking to isolated feature files.
- `features/` — Subfolder containing isolated feature specifications (`<feature_name>.md`), initialized with `features/README.md`.
- `discovery_summary.md` — Complete summary of the 30–50 Q&A discovery results and Architecture Decision Records (ADRs).
- Automatic registration in `projects/projects_registry.md` and SDM root `README.md`.

## 2. Refinement Protocol (Max 4 Rounds) (`product-manager`)
1. Generation of Acceptance Criteria via `pm-acceptance-criteria`.
2. Establishing DoR & DoD via `dor-dod-specifier`.
3. Critical audit via `spec-critic-reviewer`.
4. Max 4 rounds of Q&A. On Round 5, circuit breaker triggers and developer defaults are supplied.

## 3. Git Branching & Scope Isolation Protocol
1. **Dedicated Session Branching**: Whenever working with any agent inside SDM, a dedicated Git branch must be created prior to making changes:
   - Branch naming format: `<project_name>/<work_type_or_agent_name>/<feature_name>`
   - All session work and edits must be committed to this dedicated branch.
   - Every new user session or distinct agent invocation requires switching to a new dedicated branch.
2. **Project Scope Isolation**:
   - When executing work on a project, changes are strictly limited to the target project directory: `projects/<project_name>/`.
   - Modifying framework configuration directories (`.agents/agents/`, `.agents/rules/`, `.agents/skills/`, etc.) during project tasks is strictly forbidden.

## 4. End-to-End Feature Lifecycle & Gatekeeper Pipeline
All feature development tasks progress through a standardized sequence of specialized subagents:
1. **Product Specification (`product-manager`)**: Formulates user stories, Acceptance Criteria (AC-1..N), DoR, and DoD in `features/<feature_name>.md`.
2. **Visual Prototyping (`ui-ux-designer`)**: Develops interactive UI mockups, verifies dual theming and 200% zoom scaling, and updates `shared_components/catalog.md`.
3. **Architecture Blueprint (`system-architect`)**: Produces layer-by-layer architectural stages, verifies target project developer skills, and maintains architectural maturity gates.
4. **Full Stack Implementation (`fullstack-developer`)**: Implements production-ready code across client/server repositories, achieving $\ge 75\%$ test coverage.
5. **Quality Verification (`qa-engineer`, Optional)**: Executes automated UI/E2E test matrices, multi-platform MCP harnesses, and generates formal DoD verification reports.
6. **Code Review Gatekeeper (`code-reviewer`, Mandatory)**: Audits three-dot Git diffs, runs static linters, checks security/cryptography standards, and certifies code cleanliness.
7. **Acceptance & Living Docs Synchronization (`acceptance-manager`, Mandatory)**: Verifies feature completion against AC, documents implementation details in `features/<feature_name>.md`, synchronizes `docs/system_architecture.md` (per `system_architecture_doc`), updates roadmap and `docs/Changelog.md` (per `workflow_and_documentation`), audits `docs/dependencies.md`, and signs off in `projects/<project_name>/checklist.md`.
8. **Master Merge**: Feature branch is certified production-ready and merged into the target master/main branch.

## 5. Change Management & Scope Pivots (`change-manager`)
Whenever requirements change or feature scope is redirected at any stage of the lifecycle:
1. **Trigger & Inputs**: The `change-manager` is invoked with three core dimensions:
   - What needs to be done differently (functional logic and behavior).
   - How it should look (UI/UX layouts, styling, interaction states).
   - What will be replaced or deprecated (superseded classes, obsolete models, retired endpoints).
2. **Cross-System Impact & Dependency Analysis**: Comprehensive analysis across Client, Server, Shared models, persistence/storage schemas, and sibling features.
3. **Living Architecture Invariance**:
   - `docs/system_architecture.md` represents active codebase reality and **MUST NOT** be modified during Change Request authoring.
   - Architectural adjustments are drafted in the Change Request artifact; formal synchronization in `docs/system_architecture.md` is strictly deferred until implementation completion (executed by `acceptance-manager`).
4. **Future-Impact Clarification Questions**: The Change Manager must formulate probing questions addressing data migration, backwards compatibility, scalability, cross-platform parity, and security.
5. **Artifact & Tracking Synchronization**:
   - Create isolated artifact: `projects/<project_name>/features/<feature_name>_cr_<change_id>.md`.
   - Update `projects/<project_name>/checklist.md` with a tracking checkbox under the feature.
   - Update `## Change Requests` section in the target feature spec and all affected sibling features.

