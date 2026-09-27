# 1. System Description

The project is a custom Obsidian plugin designed specifically for the Android application, paired with a self-hosted Dockerized backend. It serves two primary, seamlessly integrated purposes: AI-assisted note-taking and robust bidirectional file synchronization.

The client application communicates with the backend via a REST API over a secure Cloudflare Tunnel, utilizing token-based authentication. The AI feature set is powered by Google's Gemini API and a Whisper model for voice processing. It provides seamless on-the-go tools directly within the Obsidian mobile interface, including context-aware automatic generation of YAML frontmatter (tags, title, description), inline text correction, custom prompting, and voice-to-text transcription.

The custom synchronization engine is highly optimized for mobile devices. It minimizes payload by using lightweight hash-and-timestamp manifests. To guarantee zero data loss, the synchronization adheres to a strict "client-priority with safe archiving" conflict resolution strategy. When a file is deleted on the mobile device, or when a file conflict occurs (both client and server have differing modifications), the server prioritizes the client's version but never permanently deletes data. Instead, it moves the server's previous versions into dedicated, read-only `archive` and `conflicts` directories, preserving the user's data history for manual retrieval if needed.

# 2. Features

## 2.1. Synchronization Subsystem

* **Bidirectional REST API Sync:** File exchange between the Android device and the user's local server.
* **Sync Triggers:**
  * **Automatic on Startup:** Triggered when the application is launched (`onload`).
  * **Automatic Debounced:** Triggered after editing/saving a note (e.g., after 3-5 seconds of user inactivity).
  * **Manual:** Triggered by a dedicated button within the Obsidian interface.
* **Traffic Optimization:** Before transmitting files, the plugin compares `mtime` (modification time) and calculates a lightweight hash (e.g., xxHash) *only* for modified files. It initially sends only this metadata (`sync-status`) to the server.
* **Safe Deletion (Archiving):** If a note is deleted on the phone, the server does not physically delete the file. Instead, it moves it to an `_archive/` directory on the server.
* **Conflict Resolution (Safe Overwrite):** If a file is modified on both the server and the phone simultaneously, the phone's version takes priority. Before overwriting, the server moves its current version of the file to a `_conflicts/` directory, appending a timestamp to the filename (e.g., `Note_conflict_20260927.md`).

## 2.2. AI Subsystem (Mobile UI & Integration)

* **Mobile Action Modal:** Adds a single action button to the native Obsidian Mobile Toolbar. Tapping it opens a bottom menu (Modal) presenting 4 actions.
* **Metadata Generation (Frontmatter):**
  * Sends the current note's content and a list of existing Vault tags to the server.
  * Receives a JSON response and automatically generates or updates the YAML Frontmatter block (title, description, tags).
* **Text Correction:**
  * Takes the text selected by the user and sends it to the AI with a system prompt (e.g., "Fix grammar and improve style").
  * Replaces the selected text in the editor with the AI's response (supports real-time streaming).
* **Custom Prompt:**
  * Opens a modal window for entering a custom user query. The entire content of the current note is passed to the AI as context.
* **Voice Input (Transcription):**
  * Provides a button to record audio via the phone's microphone.
  * The audio file is sent to the server, transcribed via the Whisper model, and the resulting text is inserted at the current cursor position.

# 3. Technology Stack

## 3.1. Client Side (Obsidian Plugin)

* **Language:** TypeScript.
* **Bundler:** `esbuild` (compiles down to a single `main.js` file).
* **UI/API:** Obsidian Plugin API (`Modal`, `Notice`, `Editor`, `Workspace`), and native HTML/DOM API for rendering menu buttons.
* **Hashing:** A lightweight JS/WASM library (such as `xxhash-wasm`) for fast hash calculations that avoid overloading the mobile CPU.

## 3.2. Server Side (Docker Backend)

* **Language & Framework:** Python 3.11+ / FastAPI (asynchronous, ideal for streaming and I/O-bound tasks).
* **Database:** SQLite (a local `sync_manifest.db` file to store sync states: file paths, mtimes, and hashes).
* **Infrastructure:** Docker and Docker Compose (using volume mounts for the main Vault directory, `_archive`, and `_conflicts`).
* **AI Models:** Google Gemini API (for text generation/processing), and the Whisper API (or a local `faster-whisper` Docker instance) for audio transcription.
* **Network & Security:** Cloudflare Tunnel (a `cloudflared` container running alongside the backend) to expose a secure HTTPS endpoint without opening router ports. Request authentication is handled via an `Authorization: Bearer <TOKEN>` header.

# 4. API Specification (REST)

*All endpoints require the following header: `Authorization: Bearer <secret_token>`*

## 4.1. Sync API

### POST `/api/sync/status`

**Description:** State verification. The client sends its local file hashes and a list of locally deleted files (tombstones).
**Request Body:**
```json
{
  "clientFiles": {
    "Folder/Note1.md": "hash123",
    "Folder/Note2.md": "hash456"
  },
  "deletedOnClient": ["Folder/OldNote.md"]
}
```
**Response:** The server processes deletions (moving `Folder/OldNote.md` to `_archive/`) and calculates the differential state.
```json
{
  "status": "ok",
  "toDownload": ["Folder/NewServerNote.md"],
  "toUpload": ["Folder/Note1.md"], 
  "acknowledgedDeletions": ["Folder/OldNote.md"]
}
```
*(Note: `toUpload` includes files where the client hash differs from the server hash).*

### POST `/api/sync/upload`

**Description:** Upload modified or newly created files from the client to the server.
**Request Body:**
```json
{
  "files": [
    {
      "path": "Folder/Note1.md",
      "content": "# Hello World",
      "mtime": 1727442000000,
      "hash": "hash123"
    }
  ]
}
```
**Server Behavior:** If the file already exists on the server and its current server hash differs from the last known synced state (a conflict), the server copies its local version to `_conflicts/Note1_timestamp.md` before overwriting the main file with the client's payload.

### POST `/api/sync/download`

**Description:** Download files from the server to the client (requested by the client based on the `/api/sync/status` response).
**Request Body:**
```json
{
  "paths": ["Folder/NewServerNote.md"]
}
```
**Response:**
```json
{
  "files": [
    {
      "path": "Folder/NewServerNote.md",
      "content": "Server content...",
      "mtime": 1727442100000,
      "hash": "hash789"
    }
  ]
}
```

### POST `/api/sync/delete`

**Description:** Immediate deletion signal (used for real-time sync while the app is active).
**Request Body:** 
```json
{
  "path": "Folder/DeletedNote.md"
}
```
**Server Behavior:** The server moves `Folder/DeletedNote.md` to `_archive/Folder/DeletedNote.md` and returns `{"status": "archived"}`.

## 4.2. AI API

### POST `/api/ai/metadata`

**Description:** Generates tags, title, and description for a given note.
**Request Body:**
```json
{
  "text": "Full text of the current note...",
  "existingTags": ["#dev", "#python", "#idea"]
}
```
**Response:**
```json
{
  "title": "AI Integration in Obsidian",
  "description": "Development plan for an Android plugin",
  "tags": ["#dev", "#obsidian", "#ai"]
}
```

### POST `/api/ai/edit`

**Description:** AI text correction and styling (supports Server-Sent Events streaming).
**Request Body:**
```json
{
  "text": "Selected text with typos or poor styling",
  "prompt": "Fix grammar while preserving the original tone" 
}
```
*(Note: `prompt` is optional).*
**Response:** Chunked stream of the generated text.

### POST `/api/ai/prompt`

**Description:** Custom AI query utilizing the current note as context.
**Request Body:**
```json
{
  "prompt": "Summarize this note",
  "context": "Full text of the open note..."
}
```
**Response:** Chunked stream of the generated text.

### POST `/api/ai/transcribe` (Multipart/form-data)

**Description:** Converts uploaded audio to text.
**Request:** Uploads an `audio.webm` or `audio.mp4` file (format depends on the Android MediaRecorder API).
**Response:**
```json
{
  "text": "Recognized and formatted text from the audio."
}
```