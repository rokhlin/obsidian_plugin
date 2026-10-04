# External Dependencies Matrix

This matrix tracks all external libraries, frameworks, runtimes, and Docker images utilized across the `obsidian_plugin` monorepo.

## 1. Client Application (`client/`)

| Category | Target | Dependency / Library | Version / Coordinate | Purpose & Feature Mapping | Status | Decision Context / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API & Core** | Mobile / Desktop | `obsidian` | `^1.7.0` | Obsidian Plugin API (Modal, Notice, Editor, Workspace) | Active | Official plugin framework. |
| **Hashing** | Mobile Browser | `xxhash-wasm` | `^1.1.0` | High-speed 64-bit hashing for mobile file manifest diffing | Active | WASM-powered, minimal CPU/battery impact. |
| **Tooling** | Build | `typescript` | `^5.4.0` | Type-safe development language | Active | Industry standard. |
| **Tooling** | Bundler | `esbuild` | `^0.23.0` | Fast JavaScript bundler compiling down to `main.js` | Active | Standard Obsidian build pipeline. |
| **Types** | Build | `@types/node` | `^20.0.0` | Node.js type definitions for build scripts | Active | Development environment support. |

---

## 2. Server Backend (`server/`)

| Category | Target | Dependency / Library | Version / Coordinate | Purpose & Feature Mapping | Status | Decision Context / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Framework** | Server API | `fastapi` | `^0.115.0` | Asynchronous REST and SSE streaming API framework | Active | High throughput, async I/O, auto OpenAPI docs. |
| **ASGI Server** | Server Runtime | `uvicorn` | `^0.30.0` | ASGI production server | Active | High performance event loop. |
| **Config** | Server Config | `pydantic-settings` | `^2.4.0` | Environment settings loading from `data/config/.env` | Active | Type-safe environment validation. |
| **Database** | Server Persistence | `aiosqlite` | `^0.20.0` | Async SQLite database client for `sync_manifest.db` | Active | Non-blocking file-based datastore. |
| **Hashing** | Server Sync | `xxhash` | `^3.4.0` | Python bindings for xxHash (matching `xxhash-wasm`) | Active | Consistent 64-bit checksums between client and server. |
| **AI Client** | Intelligence | `google-genai` | `^0.1.0` | Official Google GenAI SDK for Gemini 2.5 Flash | Active | Frontmatter metadata, text edits, prompts, audio. |
| **Testing** | Quality Gate | `pytest` | `^8.3.0` | Test runner for backend unit & integration tests | Active | $\ge 75\%$ code coverage requirement. |
| **Testing** | Async Test | `pytest-asyncio` | `^0.24.0` | Async test fixtures for FastAPI endpoints | Active | Async endpoint test automation. |
| **Testing** | HTTP Client | `httpx` | `^0.27.0` | Asynchronous test client for FastAPI | Active | In-process endpoint verification. |

---

## 3. Infrastructure & Deployment (`infra/`)

| Category | Target | Image / Tool | Version / Tag | Purpose & Feature Mapping | Status | Decision Context / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Container** | Backend | `python:3.12-slim` | `3.12-slim` | Base Docker runtime for FastAPI service | Active | Minimal image size with security patches. |
| **Tunnel / Ingress** | Ingress | `cloudflared` / `caddy` / `nginx` | Host / Docker | Reverse proxy or tunnel routing HTTPS to port 5125 | Active | Configured by user for remote access. |
