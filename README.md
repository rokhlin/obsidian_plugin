# 📱 Obsidian Mobile & Desktop Sync, AI Assistant & Zero-Knowledge Protected Notes

A full-stack knowledge management ecosystem for [Obsidian](https://obsidian.md). It pairs a native Obsidian client plugin (Windows Desktop & Android Mobile) and a standalone browser extension (Chrome / Chromium Manifest V3) with a self-hosted FastAPI backend to deliver:

1. **Lightweight, Zero-Loss Bidirectional Synchronization**: State diffing via xxHash manifests, debounced auto-sync, client-priority conflict resolution with external server archiving (`data/conflicts/` and `data/archive/`).
2. **Zero-Knowledge Client-Side Encryption**: AES-256-GCM + PBKDF2 authenticated encryption (100,000 iterations). Protected notes can be created, unlocked, and edited across Android, Windows Desktop, and Chrome Extension with in-memory volatile isolation (plaintext is never written to disk or temporary cache files).
3. **AI-Assisted Note Workflows**: Google Gemini integration for YAML frontmatter metadata generation, real-time SSE streaming text correction, and contextual custom prompts.
4. **Voice Note Transcription**: Microphone audio capture with intent separation (automatically formatting voice directives into clean Markdown).
5. **Flexible & Secure Deployment**: Runs in Docker on your personal server, NAS, or home lab (port `5125`) with Bearer token authentication. Expose securely to your devices via local network, Tailscale, Cloudflare Tunnel, or reverse proxy (Nginx/Caddy).

---

## 📂 Repository Layout

```text
obsidian_plugin/
├── client/                      # Obsidian Plugin (Windows Desktop & Android Mobile)
│   ├── src/                     # TypeScript source code (Sync, AI, Crypto, UI)
│   ├── package.json             # Build dependencies & scripts
│   ├── manifest.json            # Obsidian plugin metadata
│   └── styles.css               # Obsidian theme-compliant CSS styling
├── extension/                   # Standalone Web Browser Extension (Manifest V3)
│   ├── manifest.json            # Chrome/Firefox MV3 manifest
│   ├── popup.html & popup.ts    # 400x600 Companion UI (Capture, Protected, AI Tools, Settings)
│   ├── background.ts            # Service worker
│   ├── crypto/ext_crypto.ts     # Standalone in-memory browser crypto module
│   ├── ai/ext_ai_service.ts     # Fetch SSE streaming client
│   └── theme.css                # Obsidian native design tokens (Dark/Light)
├── server/                      # FastAPI Backend (Python 3.11+)
│   ├── app/                     # Routers (sync, ai, auth), services & models
│   ├── tests/                   # Automated Pytest suite (86% coverage)
│   ├── requirements.txt
│   └── Dockerfile
├── infra/                       # Deployment
│   └── docker-compose.yml       # Docker Compose service definition (Port 5125)
└── docs/                        # Technical specifications, architecture & roadmap
```

---

## 🛠️ Build Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: 3.11+ (for running the backend directly or running tests)
- **Docker & Docker Compose**: (recommended for running backend server)

### 1. Build Both Client & Extension
From the repository root:
```bash
# Install client dependencies
npm --prefix client install

# Install extension dependencies
npm --prefix extension install

# Compile production bundles for both client and browser extension
npm run build
```

### 2. Build Specific Subsystems
- **Client Plugin Only**:
  ```bash
  npm run build:client
  # Output: client/main.js, client/manifest.json, client/styles.css
  ```
- **Web Browser Extension Only**:
  ```bash
  npm run build:extension
  # Output: extension/popup.js, extension/background.js
  ```
- **Run Unit & Crypto Interoperability Tests**:
  ```bash
  npm test
  # Runs 11 automated unit tests verifying AES-256-GCM cross-client decryption
  ```

---

## 🚀 Installation & Setup Guides

### Guide 1: Installation on Windows (Obsidian Desktop)

#### 1. Compile the Plugin
Ensure the client bundle is built:
```powershell
npm --prefix client run build
```
This produces `main.js`, `manifest.json`, and `styles.css` in `client/`.

#### 2. Copy Files to Your Obsidian Vault
1. Open Obsidian and locate your vault root folder on your Windows drive (e.g., `C:\Users\<Username>\Documents\MyVault`).
2. Inside your vault, navigate to the hidden `.obsidian\plugins\` directory (enable "Hidden items" in Windows File Explorer if not visible).
3. Create a folder named `obsidian-sync-ai`:
   ```powershell
   New-Item -ItemType Directory -Force -Path "C:\Users\<Username>\Documents\MyVault\.obsidian\plugins\obsidian-sync-ai"
   ```
4. Copy the 3 distribution files into that folder:
   ```powershell
   Copy-Item "client\main.js" "C:\Users\<Username>\Documents\MyVault\.obsidian\plugins\obsidian-sync-ai\"
   Copy-Item "client\manifest.json" "C:\Users\<Username>\Documents\MyVault\.obsidian\plugins\obsidian-sync-ai\"
   Copy-Item "client\styles.css" "C:\Users\<Username>\Documents\MyVault\.obsidian\plugins\obsidian-sync-ai\"
   ```

#### 3. Enable & Configure in Obsidian
1. In Obsidian, open **Settings** (gear icon in the bottom-left corner).
2. Go to **Community plugins** $\to$ Click **Turn on community plugins** if restricted mode is enabled.
3. Click the **Reload plugins** button (circular arrow next to *Installed plugins*).
4. Find **Obsidian Mobile Sync & AI** in the list and toggle it **ON**.
5. Click **Obsidian Mobile Sync & AI Settings** at the bottom of the left sidebar:
   - **Backend Server URL**: `http://localhost:5125` (if backend is on the same machine), `http://<YOUR_SERVER_IP>:5125` (local network / NAS), or `https://your-domain.com` (via reverse proxy or tunnel).
   - **Authentication Bearer Token**: Paste your `AUTH_TOKEN`.
   - **Enable Cloud Synchronization**:
     - Keep **enabled** to sync with your remote self-hosted server.
     - Toggle **off** if your vault on Windows is already synced locally (e.g., via OneDrive, Syncthing, or Dropbox). When disabled, the plugin writes directly to local vault files without network calls.
   - Click **Test Connection** to verify green handshake status.

---

### Guide 2: Installation on Android Mobile (Obsidian Mobile App)

#### 1. Prepare Client Files
Build the client on your PC:
```bash
npm --prefix client run build
```
You need the 3 files: `client/main.js`, `client/manifest.json`, and `client/styles.css`.

#### 2. Transfer Files to Your Android Device
You can transfer the files using USB Cable (MTP), ADB, or a local sync tool:

- **Option A: Via USB Cable (Windows File Explorer)**:
  1. Connect your Android phone to your PC via USB and choose "File Transfer / MTP" mode.
  2. In Windows Explorer, open your phone storage:
     `Internal storage > Documents > [Your Vault Folder] > .obsidian > plugins`
  3. Create a folder named `obsidian-sync-ai`.
  4. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.

- **Option B: Via ADB (Command Line)**:
  ```bash
  adb shell mkdir -p "/sdcard/Documents/MyVault/.obsidian/plugins/obsidian-sync-ai"
  adb push client/main.js "/sdcard/Documents/MyVault/.obsidian/plugins/obsidian-sync-ai/"
  adb push client/manifest.json "/sdcard/Documents/MyVault/.obsidian/plugins/obsidian-sync-ai/"
  adb push client/styles.css "/sdcard/Documents/MyVault/.obsidian/plugins/obsidian-sync-ai/"
  ```

#### 3. Enable & Configure in Obsidian Mobile
1. Open the **Obsidian** app on your Android device.
2. Tap the gear icon $\to$ **Community plugins** $\to$ Tap the refresh icon next to *Installed plugins*.
3. Enable **Obsidian Mobile Sync & AI**.
4. In the plugin settings, set:
   - **Backend Server URL**: `http://<YOUR_SERVER_IP>:5125` (when connected to home Wi-Fi) or `https://your-domain.com` (via remote tunnel / reverse proxy).
   - **Authentication Token**: Your `AUTH_TOKEN`.
   - Tap **Test Connection** to confirm connectivity.
5. In Obsidian Mobile **Toolbar Settings**, add the **Open AI Action Menu** command to your mobile bottom toolbar for quick access (`🏷️ Metadata`, `✍️ Fix Text`, `🎙️ Voice Note`, `💬 Custom Prompt`).

---

### Guide 3: Installation in Google Chrome (Manifest V3 Extension)

The extension is compatible with **Google Chrome**, **Microsoft Edge**, **Brave**, and any Chromium-based browser.

#### 1. Compile the Extension
From the repository root:
```bash
npm --prefix extension run build
```
This bundles `popup.js` and `background.js` into the `extension/` directory.

#### 2. Load Unpacked in Chrome
1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
   *(Or click the 3-dots menu $\to$ **Extensions** $\to$ **Manage Extensions**)*.
2. In the top-right corner, enable the **"Developer mode"** toggle.
3. In the top-left corner, click **"Load unpacked"**.
4. Select the directory:
   ```text
   c:\projects\obsidian_plugin\extension
   ```
   *(Select the `extension` folder itself and click "Select Folder")*.
5. The extension **"Obsidian Companion — Sync, AI & Protected Notes"** will appear in your installed extensions list.

#### 3. Pin & Initial Configuration
1. Click the puzzle icon (🧩) in Chrome's top toolbar and click the **Pin (📌)** icon next to **Obsidian Companion**.
2. Click the purple **O** icon in your toolbar to open the 400x600 popup.
3. Click the gear icon (**⚙️**) in the header (Settings tab):
   - **Backend Server URL**: `http://localhost:5125` (local), `http://<YOUR_SERVER_IP>:5125` (LAN), or `https://your-domain.com`.
   - **Authentication Token**: Paste your `AUTH_TOKEN`.
   - Click **🔍 Test Connection & Auth** (a green dot will indicate verified connection).
   - Click **Save Settings**.

#### 4. Extension Features & Usage
- **📝 Capture Tab**: Enter quick notes or click **🌐 Clip Tab** to capture the active webpage title and URL. Click **💾 Save to Vault** or **🔒 Encrypt & Save** (prompts for passphrase and encrypts with AES-256-GCM before uploading).
- **🔒 Protected Tab**: 
  - **Locked View**: Enter the note vault path (e.g. `Private/Secrets.md`) and your master passphrase to decrypt strictly into volatile memory.
  - **Unlocked View**: Edit the decrypted note with full Android button parity:
    - **`[ 💾 Save ]`**: Re-encrypts in volatile memory and pushes ciphertext to vault.
    - **`[ 🔒 Lock ]`**: Immediately purges memory and wipes keys.
    - **`[ 🔓 Decrypt ]`**: Prompts confirmation, removes `encrypted: true` frontmatter, and restores note as plain Markdown.
    - **Auto-Lock**: 5-minute inactivity watchdog timer and popup-close purge.
- **🤖 AI Tools Tab**:
  - `🏷️ Metadata`: Analyzes active text and generates title, summary, and YAML tags.
  - `✍️ Fix Text`: Streams grammatical and stylistic improvements via SSE.
  - `🎙️ Voice Note`: Microphone dictation with backend intent transcription.
  - `💬 Custom Prompt`: Multi-line prompt input with `Ctrl+Enter` trigger and live SSE stream into Markdown container.
  - `📥 Insert into Active Note`: Injects formatted AI output into the Capture tab.

---

## 🔒 Security & Cryptographic Contract

All clients (Android, Windows Desktop, Chrome Extension) adhere to the identical zero-knowledge contract:
- **Engine**: Native Web Crypto API (`window.crypto.subtle`). Zero external third-party crypto packages.
- **Key Derivation**: `PBKDF2-HMAC-SHA256`, 100,000 iterations, 16-byte cryptographically secure random salt.
- **Cipher**: `AES-256-GCM`, 12-byte random IV, 128-bit authentication tag.
- **Envelope Storage Format**:
```markdown
---
encrypted: true
title: Protected Note
tags: [secure, private]
---
-----BEGIN PROTECTED NOTE-----
Salt: <Base64 16-byte salt>
IV: <Base64 12-byte IV>

<Base64 Ciphertext + Auth Tag>
-----END PROTECTED NOTE-----
```

---

## 🖥️ Backend Server Deployment (Port 5125)

The backend is a self-hosted FastAPI container that coordinates bidirectional note synchronization, conflict resolution manifests, and AI assistant capabilities. All notes and metadata are stored in persistent host volumes.

---

### 1. Environment Configuration (`.env`)

Create a configuration file (or pass variables directly into Docker). If cloning this repository, copy the example:
```bash
cp server/data/config/.env.example server/data/config/.env
```

| Environment Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `AUTH_TOKEN` | **Yes** | — | Shared secret Bearer token used to authenticate all sync, AI, and note API requests. |
| `GEMINI_API_KEY` | Optional | — | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) for AI writing, frontmatter metadata, and intent processing. |
| `GEMINI_MODEL` | No | `gemini-3.5-flash-lite` | Gemini model variant (e.g., `gemini-3.5-flash-lite`, `gemini-1.5-flash`, `gemini-1.5-pro`). |
| `TRANSCRIPTION_ENGINE`| No | `cloud_gemini` | Voice transcription engine: `cloud_gemini`, `cloud_openai`, or `local_faster_whisper`. |
| `OPENAI_API_KEY` | Conditional | — | OpenAI API key (required only if `TRANSCRIPTION_ENGINE=cloud_openai`). |
| `HOST` | No | `0.0.0.0` | Container bind address. |
| `PORT` | No | `5125` | Container bind port. |

> [!TIP]
> Generate a strong `AUTH_TOKEN` using OpenSSL:
> ```bash
> openssl rand -hex 24
> ```

---

### 2. Deployment Methods

#### Option A: Standalone Docker Compose (Recommended)

Save the following as `docker-compose.yml` on your server (VPS, Raspberry Pi, NAS, Unraid, CasaOS):

```yaml
services:
  obsidian-backend:
    image: ghcr.io/rokhlin/obsidian_plugin:latest
    container_name: obsidian-sync-ai-backend
    restart: unless-stopped
    ports:
      - "5125:5125"
    environment:
      - HOST=0.0.0.0
      - PORT=5125
      - AUTH_TOKEN=your_secure_bearer_token_here
      - GEMINI_API_KEY=your_gemini_api_key_here
      - GEMINI_MODEL=gemini-3.5-flash-lite
      - TRANSCRIPTION_ENGINE=cloud_gemini
    volumes:
      - ./data/vault:/data/vault
      - ./data/archive:/data/archive
      - ./data/conflicts:/data/conflicts
      - ./data:/data
```

Start the container:
```bash
docker compose up -d
```

#### Option B: Standalone Docker CLI (`docker run`)

Run directly with Docker without a Compose file:

```bash
docker run -d \
  --name obsidian-sync-ai-backend \
  --restart unless-stopped \
  -p 5125:5125 \
  -e AUTH_TOKEN="your_secure_bearer_token_here" \
  -e GEMINI_API_KEY="your_gemini_api_key_here" \
  -v $(pwd)/data/vault:/data/vault \
  -v $(pwd)/data/archive:/data/archive \
  -v $(pwd)/data/conflicts:/data/conflicts \
  -v $(pwd)/data:/data \
  ghcr.io/rokhlin/obsidian_plugin:latest
```

#### Option C: Build from Monorepo Source

If you cloned the full `obsidian_plugin` repository:
```bash
# 1. Populate config
cp server/data/config/.env.example server/data/config/.env
# Edit server/data/config/.env with your AUTH_TOKEN and GEMINI_API_KEY

# 2. Build and launch
cd infra
docker compose up -d --build
```

---

### 3. Persistent Data Storage Structure

The container mounts the `./data` directory on the host to ensure all notes and history persist across restarts:
- `./data/vault/`: Live Markdown vault files synchronized across your devices.
- `./data/archive/`: Historical versions of deleted or overwritten notes (for disaster recovery).
- `./data/conflicts/`: Timestamped copies of conflicting note edits (never lost).
- `./data/sync_manifest.db`: SQLite database storing xxHash cryptographic state manifests and sync timestamps.

---

### 4. Networking & Remote Access Setup

Choose the setup that matches your infrastructure:

#### 1. Local Network / Home Wi-Fi (Simplest)
Connect directly via your host server's local IP address:
- **Server URL**: `http://<YOUR_LOCAL_IP>:5125` (e.g., `http://192.168.1.150:5125`)
- No domain name or public port exposure required.

#### 2. Private Mesh / VPN (Tailscale, WireGuard) — Recommended for Security
Install [Tailscale](https://tailscale.com) on your server and client devices:
- **Server URL**: `http://<TAILSCALE_IP>:5125` (e.g., `http://100.85.20.10:5125`)
- Encrypted peer-to-peer connection worldwide with zero public ports open to the Internet.

#### 3. Cloudflare Tunnel (Zero-Port Forwarding with HTTPS)
If using a custom domain with Cloudflare:
```bash
cloudflared tunnel run --url http://localhost:5125 <your-tunnel-name>
```
- **Server URL**: `https://notes.yourdomain.com`

#### 4. Reverse Proxy with SSL (Nginx / Caddy)
If hosting on a public VPS with a domain:
- **Caddyfile**:
  ```caddyfile
  notes.yourdomain.com {
      reverse_proxy localhost:5125
  }
  ```
- **Nginx snippet**:
  ```nginx
  server {
      server_name notes.yourdomain.com;
      location / {
          proxy_pass http://127.0.0.1:5125;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```

---

### 5. Verifying Server Health & Connection

After starting the container, verify that it is responding:

```bash
# 1. Health probe
curl http://localhost:5125/health
# Response: {"status":"healthy"}

# 2. Authenticated handshake check
curl -H "Authorization: Bearer your_secure_bearer_token_here" http://localhost:5125/api/auth/verify
# Response: {"status":"authenticated"}
```

---

### 6. Running Backend Unit Tests (Development)
```bash
cd server
python -m pytest tests/
# 17 passed, 86% coverage
```

---

## 📄 License
MIT License.
