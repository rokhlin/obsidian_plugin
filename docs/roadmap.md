# Project Roadmap: Obsidian Mobile Plugin & Sync Backend

This document outlines the phased implementation milestones for the **Obsidian Mobile Plugin & Backend** ecosystem.

---

## Phase 0: Foundations, Topography & Project Scaffolding
- [x] **0.1**: Repository topography setup (`client/`, `server/`, `infra/`, `docs/`, `data/`).
- [x] **0.2**: Environment variable structure (`data/config/.env.example` and `.gitignore`).
- [x] **0.3**: System architecture documentation and living rule deployment.
- [ ] **0.4**: TypeScript client build pipeline (`package.json`, `esbuild.config.mjs`, `manifest.json`).
- [ ] **0.5**: Python FastAPI server skeleton (`pyproject.toml`, Dockerfile, settings loading).

---

## Phase 1: Robust Synchronization Subsystem
- [ ] **1.1**: SQLite manifest state engine (`sync_manifest.db`).
- [ ] **1.2**: Client-side `xxhash-wasm` calculation and status handshake (`POST /api/sync/status`).
- [ ] **1.3**: Batch upload (`POST /api/sync/upload`) and download (`POST /api/sync/download`).
- [ ] **1.4**: Safe external archiving (`/data/archive/`) and conflict backup (`/data/conflicts/`).
- [ ] **1.5**: Hybrid sync triggers: startup (`onload`), debounced auto-sync (3-5s), and manual button.

---

## Phase 2: AI Subsystem & Mobile Workflows
- [ ] **2.1**: Mobile Action Modal integrated with Obsidian Mobile Toolbar.
- [ ] **2.2**: Metadata & YAML frontmatter generation (`POST /api/ai/metadata`).
- [ ] **2.3**: Streaming inline text correction via SSE (`POST /api/ai/edit`).
- [ ] **2.4**: Contextual custom prompting via SSE (`POST /api/ai/prompt`).
- [ ] **2.5**: Mobile voice recording and cloud transcription (`POST /api/ai/transcribe`).

---

## Phase 3: Infrastructure, Tunnel & Release Hardening
- [ ] **3.1**: Docker Compose orchestration binding to host port `5125`.
- [ ] **3.2**: Secure header and Bearer token enforcement.
- [ ] **3.3**: Automated unit and integration test suites ($\ge 75\%$ coverage).
- [ ] **3.4**: Plugin distribution packaging (`main.js`, `manifest.json`, `styles.css`).
