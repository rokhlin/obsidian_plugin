# Rule: Repository Structure and CI/CD Automation

## 1. Repository Structure & Topography
The system architecture must define explicit repository boundaries based on architectural requirements:
- **Multi-Repository Architecture (Recommended for complex systems):**
  - **Server Repository:** Backend applications, database migrations, container configurations (Docker), and server microservices.
  - **Client Repository:** Front-end applications, shared multiplatform logic, and client UI implementations (e.g., Web, Mobile, Desktop).
  - **Common/Shared Repository:** Shared models, contracts, and serialization protocols if maintained across independent repositories.
- **Monorepo Architecture (Alternative when unified build tooling is preferred):**
  - Clear module isolation with explicit dependency boundaries between `:client`, `:server`, and `:common` modules.

## 2. Pull Request Automation (GitHub Actions)
For every Pull Request created in project repositories, the CI pipeline (`.github/workflows/pr_validation.yml`) must execute and enforce:
1. **Compilation & Build Validation:** 
   - Compile all modules to guarantee zero build or syntax errors.
   - Fail the PR immediately if compilation fails.
2. **Automated Test Suites:**
   - Execute all unit, integration, and UI component tests.
   - Enforce code coverage thresholds (e.g., minimum 75% coverage).
3. **Static Analysis & Linting:**
   - Run platform-appropriate linters (e.g., `ktlint`, `detekt`, `eslint`, `golangci-lint`).
   - Block PR merges on unformatted code or lint violations.
4. **Security Vulnerability Scan:**
   - Run dependency scanning (e.g., GitHub Dependabot, Trivy, OWASP Dependency-Check).
   - Flag CVEs and generate required dependency remediation steps.
5. **AI-Powered Code Review:**
   - Execute automated AI review integrations on PR `git diff`.
   - Post automated, actionable suggestions for code quality, edge cases, and performance regressions.

## 3. Release Automation & Artifact Preparation
When a release is triggered (via tag push or manual dispatch), the CD pipeline (`.github/workflows/release.yml`) must automate:
1. **Artifact Compilation:**
   - Build production-ready artifacts (e.g., Android APK/AAB, iOS IPA, Desktop binaries, Web distribution bundles, or Docker container images).
2. **Changelog & Semantic Versioning Automation:**
   - Parse `docs/Changelog.md` to extract release notes under `[Unreleased]`.
   - Compute or validate the SemVer version tag (`vMAJOR.MINOR.PATCH`).
   - Populate GitHub Release notes with extracted changelog items.
   - Update version declarations in project build manifests (`build.gradle.kts`, `package.json`, `Cargo.toml`, etc.).
   - Cycle `docs/Changelog.md` by replacing `[Unreleased]` with the new version and release date, prepending a fresh `[Unreleased]` block.
