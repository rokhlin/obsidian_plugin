# Project Roadmap: Obsidian Mobile Plugin & Sync Backend

This document outlines the phased implementation milestones for the **Obsidian Mobile Plugin & Backend** ecosystem.

---

## Phase 0: Foundations, Topography & Project Scaffolding
- [x] **0.1**: Repository topography setup (`client/`, `server/`, `infra/`, `docs/`, `data/`).
- [x] **0.2**: Environment variable structure (`data/config/.env.example` and `.gitignore`).
- [x] **0.3**: System architecture documentation and living rule deployment.
- [x] **0.4**: TypeScript client build pipeline (`package.json`, `esbuild.config.mjs`, `manifest.json`).
- [x] **0.5**: Python FastAPI server skeleton (`pyproject.toml`, Dockerfile, settings loading).

---

## Phase 1: Robust Synchronization Subsystem
- [x] **1.1**: SQLite manifest state engine (`sync_manifest.db`).
- [x] **1.2**: Client-side `xxhash-wasm` calculation and status handshake (`POST /api/sync/status`).
- [x] **1.3**: Batch upload (`POST /api/sync/upload`) and download (`POST /api/sync/download`).
- [x] **1.4**: Safe external archiving (`/data/archive/`) and conflict backup (`/data/conflicts/`).
- [x] **1.5**: Hybrid sync triggers: startup (`onload`), debounced auto-sync (3-5s), and manual button.

---

## Phase 2: AI Subsystem & Mobile Workflows
- [x] **2.1**: Mobile Action Modal integrated with Obsidian Mobile Toolbar.
- [x] **2.2**: Metadata & YAML frontmatter generation (`POST /api/ai/metadata`).
- [x] **2.3**: Streaming inline text correction via SSE (`POST /api/ai/edit`).
- [x] **2.4**: Contextual custom prompting via SSE (`POST /api/ai/prompt`).
- [x] **2.5**: Mobile voice recording and cloud transcription (`POST /api/ai/transcribe`).
- [x] **2.6**: Mobile Action Modal redesign & Prompt formatting refinement.

---

## Phase 3: Infrastructure, Tunnel & Release Hardening
- [x] **3.1**: Docker Compose orchestration binding to host port `5125`.
- [x] **3.2**: Secure header and Bearer token enforcement.
- [x] **3.3**: Automated unit and integration test suites ($\ge 75\%$ coverage).
- [x] **3.4**: Plugin distribution packaging (`main.js`, `manifest.json`, `styles.css`).

---

## Phase 4: Protected & Encrypted Notes Subsystem
- [x] **4.1**: Zero-knowledge client-side encryption using Web Crypto API (AES-256-GCM + PBKDF2 HMAC-SHA256, 100k iterations).
- [x] **4.2**: YAML frontmatter marker (`encrypted: true`) preserving note indexing while securing note body.
- [x] **4.3**: Dedicated in-memory editor view (`EncryptedNoteView`) preventing plaintext leaks to disk during Obsidian auto-save.
- [x] **4.4**: Inactivity timer (5 minutes) and app minimization auto-lock (`visibilitychange`) with memory clearing.
- [x] **4.5**: Password dialog (`PasswordModal`), quick actions in `MobileActionModal`, commands, and permanent "Remove Password" decryption.
- [x] **4.6**: Automated unit tests for cryptographic round-trip, tampered ciphertext detection, and envelope serialization.

---

## Phase 5: Cross-Platform Support (Windows Desktop & Web Extension)
- [x] **5.1**: Windows Desktop Obsidian compatibility with optional local sync bypass (`enableCloudSync`).
- [x] **5.2**: Dynamic note actions (Normal vs Locked vs Unlocked) in Windows file explorer context menu and `EncryptedNoteView` button labels.
- [x] **5.3**: Standalone Chrome/Firefox Manifest V3 companion extension (`extension/`) with 4-tab interface (Capture, Protected, AI Tools, Settings).
- [x] **5.4**: Zero-knowledge in-memory AES-256-GCM browser encryption with full Android button parity (Save, Lock, Remove Password) and auto-lock.
- [x] **5.5**: Automated cross-platform cryptographic interoperability test suite (`test_cross_platform_crypto.mjs`) passing with 100% success.


