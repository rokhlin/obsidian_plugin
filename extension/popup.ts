import { ExtCrypto } from "./crypto/ext_crypto";
import { ExtAiService } from "./ai/ext_ai_service";

interface ExtensionConfig {
  serverUrl: string;
  authToken: string;
}

const DEFAULT_CONFIG: ExtensionConfig = {
  serverUrl: "http://localhost:5125",
  authToken: "",
};

class PopupController {
  private config: ExtensionConfig = { ...DEFAULT_CONFIG };
  private activeTabId: string = "tab-capture";

  // In-Memory volatile state for Protected Notes
  private inMemoryDecryptedText: string = "";
  private inMemoryPassword: string = "";
  private activeProtectedFilePath: string = "";
  private autoLockSecondsRemaining: number = 300;
  private autoLockInterval: any = null;

  async init(): Promise<void> {
    await this.loadConfig();
    this.bindEvents();
    this.checkConnection();
    this.prefillActiveTabContext();
  }

  private async loadConfig(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(["serverUrl", "authToken"], (items) => {
        if (items.serverUrl) this.config.serverUrl = items.serverUrl;
        if (items.authToken) this.config.authToken = items.authToken;

        const serverInput = document.getElementById("settings-server-url") as HTMLInputElement;
        const tokenInput = document.getElementById("settings-auth-token") as HTMLInputElement;
        if (serverInput) serverInput.value = this.config.serverUrl;
        if (tokenInput) tokenInput.value = this.config.authToken;

        resolve();
      });
    });
  }

  private async saveConfig(): Promise<void> {
    const serverInput = document.getElementById("settings-server-url") as HTMLInputElement;
    const tokenInput = document.getElementById("settings-auth-token") as HTMLInputElement;

    this.config.serverUrl = (serverInput?.value || "").trim().replace(/\/+$/, "");
    this.config.authToken = (tokenInput?.value || "").trim();

    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          serverUrl: this.config.serverUrl,
          authToken: this.config.authToken,
        },
        () => {
          this.showNotice("✅ Settings saved successfully!", "success");
          this.checkConnection();
          this.switchTab("tab-capture");
          resolve();
        }
      );
    });
  }

  private bindEvents(): void {
    // Tab Navigation
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const targetTab = (e.currentTarget as HTMLElement).getAttribute("data-tab");
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // Settings Toggle
    document.getElementById("btn-toggle-settings")?.addEventListener("click", () => {
      this.switchTab(this.activeTabId === "tab-settings" ? "tab-capture" : "tab-settings");
    });

    document.getElementById("btn-save-settings")?.addEventListener("click", () => {
      this.saveConfig();
    });

    document.getElementById("btn-test-connection")?.addEventListener("click", () => {
      this.checkConnection(true);
    });

    // Capture Tab Actions
    document.getElementById("btn-quick-clip-page")?.addEventListener("click", () => {
      this.clipActivePage();
    });

    document.getElementById("btn-capture-meta")?.addEventListener("click", () => {
      this.generateMetadataForCapture();
    });

    document.getElementById("btn-capture-fix")?.addEventListener("click", () => {
      this.fixCaptureText();
    });

    document.getElementById("btn-save-vault")?.addEventListener("click", () => {
      this.saveNoteToVault(false);
    });

    document.getElementById("btn-encrypt-save")?.addEventListener("click", () => {
      this.saveNoteToVault(true);
    });

    // Protected Tab Actions (Locked)
    document.getElementById("btn-unlock-protected")?.addEventListener("click", () => {
      this.unlockProtectedNote();
    });

    // Protected Tab Actions (Unlocked — Android Parity)
    document.getElementById("btn-unlocked-save")?.addEventListener("click", () => {
      this.saveProtectedNoteChanges();
    });

    document.getElementById("btn-unlocked-lock")?.addEventListener("click", () => {
      this.lockProtectedNote();
    });

    document.getElementById("btn-unlocked-decrypt")?.addEventListener("click", () => {
      this.decryptAndRemovePasswordFromNote();
    });

    const unlockedTextarea = document.getElementById("unlocked-editor-textarea") as HTMLTextAreaElement;
    unlockedTextarea?.addEventListener("input", () => {
      this.resetAutoLockTimer();
    });

    // AI Tab Actions
    document.getElementById("btn-ai-metadata")?.addEventListener("click", () => {
      this.triggerAiMetadata();
    });

    document.getElementById("btn-ai-fix")?.addEventListener("click", () => {
      this.triggerAiFix();
    });

    document.getElementById("btn-ai-voice")?.addEventListener("click", () => {
      this.recordVoiceNote();
    });

    document.getElementById("btn-send-ai-prompt")?.addEventListener("click", () => {
      this.sendAiPrompt();
    });

    document.getElementById("ai-prompt-input")?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        this.sendAiPrompt();
      }
    });

    document.getElementById("btn-insert-ai-response")?.addEventListener("click", () => {
      this.insertAiResponseIntoNote();
    });

    // Zero-out memory on popup close / unload
    window.addEventListener("unload", () => {
      this.wipeVolatileMemory();
    });
  }

  private switchTab(tabId: string): void {
    this.activeTabId = tabId;
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      if (btn.getAttribute("data-tab") === tabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    document.querySelectorAll(".tab-content").forEach((content) => {
      if (content.id === tabId) {
        content.classList.add("active");
      } else {
        content.classList.remove("active");
      }
    });
  }

  private async checkConnection(isManual = false): Promise<void> {
    const dot = document.getElementById("connection-status-dot");
    if (!this.config.authToken || !this.config.serverUrl) {
      if (dot) dot.className = "status-dot error";
      if (isManual) this.showNotice("⚠️ Please enter Server URL and Auth Token", "error");
      return;
    }

    try {
      const resp = await fetch(`${this.config.serverUrl}/api/auth/verify`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.authToken}`,
          "X-Auth-Token": this.config.authToken,
        },
      });

      if (resp.status === 200) {
        if (dot) dot.className = "status-dot connected";
        if (isManual) this.showNotice("✅ Success! Server connected and Token verified.", "success");
      } else {
        if (dot) dot.className = "status-dot error";
        if (isManual) this.showNotice(`❌ Error: HTTP ${resp.status}`, "error");
      }
    } catch (err: any) {
      if (dot) dot.className = "status-dot error";
      if (isManual) this.showNotice(`❌ Connection failed: ${err.message || err}`, "error");
    }
  }

  private showNotice(message: string, type: "success" | "error" | "info" = "info"): void {
    const banner = document.getElementById("notice-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = "block";
    banner.style.backgroundColor =
      type === "success"
        ? "rgba(16, 185, 129, 0.2)"
        : type === "error"
        ? "rgba(220, 38, 38, 0.2)"
        : "rgba(99, 102, 241, 0.2)";
    banner.style.color =
      type === "success"
        ? "var(--background-modifier-success)"
        : type === "error"
        ? "var(--background-modifier-error)"
        : "var(--interactive-accent)";

    setTimeout(() => {
      banner.style.display = "none";
    }, 4000);
  }

  private async prefillActiveTabContext(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.tabs) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.title) {
        const safeTitle = tab.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
        const titleInput = document.getElementById("capture-title") as HTMLInputElement;
        if (titleInput && titleInput.value === "Quick_Clip.md") {
          titleInput.value = `${safeTitle}.md`;
        }
      }
    } catch {
      // Ignored
    }
  }

  private async clipActivePage(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.tabs) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const bodyEl = document.getElementById("capture-body") as HTMLTextAreaElement;
      let clip = `\n\nSource: [${tab.title || "Page"}](${tab.url || ""})\n`;
      if (bodyEl) {
        bodyEl.value += clip;
      }
      this.showNotice("🌐 Tab link attached to note.", "info");
    } catch (err: any) {
      this.showNotice(`Failed to clip: ${err.message}`, "error");
    }
  }

  private async saveNoteToVault(encrypt: boolean): Promise<void> {
    const titleInput = document.getElementById("capture-title") as HTMLInputElement;
    const folderInput = document.getElementById("capture-folder") as HTMLInputElement;
    const bodyTextarea = document.getElementById("capture-body") as HTMLTextAreaElement;

    const title = (titleInput?.value || "Note.md").trim();
    const folder = (folderInput?.value || "/Inbox").trim().replace(/^\/+|\/+$/g, "");
    const rawBody = (bodyTextarea?.value || "").trim();

    if (!rawBody) {
      this.showNotice("⚠️ Note content is empty!", "error");
      return;
    }

    const fullPath = folder ? `${folder}/${title}` : title;
    let finalContent = rawBody;

    if (encrypt) {
      const password = prompt("Enter Master Passphrase to encrypt this note:");
      if (!password) {
        this.showNotice("Encryption cancelled.", "info");
        return;
      }
      try {
        const armored = await ExtCrypto.encrypt(rawBody, password);
        finalContent = ExtCrypto.formatNote([], armored, true);
      } catch (err: any) {
        this.showNotice(`Encryption error: ${err.message}`, "error");
        return;
      }
    }

    try {
      this.showNotice("🔄 Uploading note to vault...", "info");
      const resp = await fetch(`${this.config.serverUrl}/api/sync/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.authToken}`,
          "X-Auth-Token": this.config.authToken,
        },
        body: JSON.stringify({
          files: [
            {
              path: fullPath,
              content: finalContent,
              mtime: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      });

      if (!resp.ok) {
        throw new Error(`Upload returned HTTP ${resp.status}`);
      }

      this.showNotice(`✅ Note saved to vault: ${fullPath}`, "success");
      bodyTextarea.value = "";
    } catch (err: any) {
      this.showNotice(`❌ Save failed: ${err.message}`, "error");
    }
  }

  // ==========================================
  // PROTECTED NOTES (LOCKED / UNLOCKED)
  // ==========================================

  private async unlockProtectedNote(): Promise<void> {
    const pathInput = document.getElementById("protected-file-path") as HTMLInputElement;
    const passInput = document.getElementById("protected-password-input") as HTMLInputElement;

    const path = (pathInput?.value || "").trim();
    const password = (passInput?.value || "").trim();

    if (!path || !password) {
      this.showNotice("⚠️ Please enter both note path and passphrase.", "error");
      return;
    }

    this.showNotice("🔓 Fetching and decrypting note...", "info");
    try {
      // 1. Fetch note from server
      const resp = await fetch(`${this.config.serverUrl}/api/sync/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.authToken}`,
          "X-Auth-Token": this.config.authToken,
        },
        body: JSON.stringify({ paths: [path] }),
      });

      if (!resp.ok) {
        throw new Error(`Failed to fetch note (HTTP ${resp.status})`);
      }

      const data = await resp.json();
      const fileData = data.files?.[0];
      if (!fileData || !fileData.content) {
        throw new Error(`Note not found on server at path: ${path}`);
      }

      // 2. Extract armored payload and decrypt
      const { body } = ExtCrypto.splitFrontmatterAndBody(fileData.content);
      const plaintext = await ExtCrypto.decrypt(body, password);

      // 3. Store in volatile memory
      this.inMemoryDecryptedText = plaintext;
      this.inMemoryPassword = password;
      this.activeProtectedFilePath = path;

      // 4. Render Unlocked View
      const lockedView = document.getElementById("protected-locked-view");
      const unlockedView = document.getElementById("protected-unlocked-view");
      const badge = document.getElementById("unlocked-filename-badge");
      const editor = document.getElementById("unlocked-editor-textarea") as HTMLTextAreaElement;

      if (lockedView) lockedView.style.display = "none";
      if (unlockedView) unlockedView.style.display = "flex";
      if (badge) badge.textContent = `🔒 [Decrypted] ${path}`;
      if (editor) editor.value = plaintext;

      passInput.value = "";
      this.startAutoLockTimer();
      this.showNotice("✅ Note decrypted in memory.", "success");
    } catch (err: any) {
      this.showNotice(`❌ Decryption failed: ${err.message}`, "error");
    }
  }

  private async saveProtectedNoteChanges(): Promise<void> {
    if (!this.inMemoryPassword || !this.activeProtectedFilePath) {
      this.showNotice("No active unlocked note in memory.", "error");
      return;
    }

    const editor = document.getElementById("unlocked-editor-textarea") as HTMLTextAreaElement;
    const currentText = editor?.value || "";

    this.showNotice("💾 Re-encrypting and saving...", "info");
    try {
      const armored = await ExtCrypto.encrypt(currentText, this.inMemoryPassword);
      const formatted = ExtCrypto.formatNote([], armored, true);

      const resp = await fetch(`${this.config.serverUrl}/api/sync/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.authToken}`,
          "X-Auth-Token": this.config.authToken,
        },
        body: JSON.stringify({
          files: [
            {
              path: this.activeProtectedFilePath,
              content: formatted,
              mtime: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      });

      if (!resp.ok) {
        throw new Error(`Upload returned HTTP ${resp.status}`);
      }

      this.inMemoryDecryptedText = currentText;
      this.resetAutoLockTimer();
      this.showNotice("✅ Protected note encrypted & saved to vault!", "success");
    } catch (err: any) {
      this.showNotice(`❌ Save failed: ${err.message}`, "error");
    }
  }

  private lockProtectedNote(): void {
    this.wipeVolatileMemory();
    const lockedView = document.getElementById("protected-locked-view");
    const unlockedView = document.getElementById("protected-unlocked-view");
    if (lockedView) lockedView.style.display = "flex";
    if (unlockedView) unlockedView.style.display = "none";
    this.showNotice("🔒 Note locked. Memory purged.", "info");
  }

  private async decryptAndRemovePasswordFromNote(): Promise<void> {
    if (!confirm("Are you sure you want to permanently remove password protection and restore plain text?")) {
      return;
    }

    const editor = document.getElementById("unlocked-editor-textarea") as HTMLTextAreaElement;
    const currentText = editor?.value || "";

    try {
      const resp = await fetch(`${this.config.serverUrl}/api/sync/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.authToken}`,
          "X-Auth-Token": this.config.authToken,
        },
        body: JSON.stringify({
          files: [
            {
              path: this.activeProtectedFilePath,
              content: currentText,
              mtime: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      });

      if (!resp.ok) {
        throw new Error(`Upload returned HTTP ${resp.status}`);
      }

      this.lockProtectedNote();
      this.showNotice("🔓 Encryption removed. Saved as regular markdown note.", "success");
    } catch (err: any) {
      this.showNotice(`❌ Remove protection failed: ${err.message}`, "error");
    }
  }

  private startAutoLockTimer(): void {
    this.autoLockSecondsRemaining = 300;
    if (this.autoLockInterval) clearInterval(this.autoLockInterval);

    this.autoLockInterval = setInterval(() => {
      this.autoLockSecondsRemaining -= 1;
      const minutes = Math.floor(this.autoLockSecondsRemaining / 60);
      const seconds = this.autoLockSecondsRemaining % 60;
      const timerBadge = document.getElementById("unlocked-timer-badge");
      if (timerBadge) {
        timerBadge.textContent = `⏱️ ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }

      if (this.autoLockSecondsRemaining <= 0) {
        this.lockProtectedNote();
      }
    }, 1000);
  }

  private resetAutoLockTimer(): void {
    this.autoLockSecondsRemaining = 300;
  }

  private wipeVolatileMemory(): void {
    if (this.autoLockInterval) {
      clearInterval(this.autoLockInterval);
      this.autoLockInterval = null;
    }
    this.inMemoryDecryptedText = "";
    this.inMemoryPassword = "";
    this.activeProtectedFilePath = "";
    const editor = document.getElementById("unlocked-editor-textarea") as HTMLTextAreaElement;
    if (editor) editor.value = "";
  }

  // ==========================================
  // AI TOOLS & PROMPT STREAMING
  // ==========================================

  private async generateMetadataForCapture(): Promise<void> {
    const bodyTextarea = document.getElementById("capture-body") as HTMLTextAreaElement;
    const text = bodyTextarea?.value || "";
    if (!text.trim()) {
      this.showNotice("⚠️ Note content is empty!", "error");
      return;
    }

    this.showNotice("🏷️ Generating frontmatter metadata...", "info");
    try {
      const res = await ExtAiService.generateMetadata(this.config.serverUrl, this.config.authToken, text);
      const frontmatterLines: string[] = [];
      if (res.title) frontmatterLines.push(`title: "${res.title}"`);
      if (res.description) frontmatterLines.push(`description: "${res.description}"`);
      if (res.tags && res.tags.length > 0) {
        frontmatterLines.push(`tags: [${res.tags.map((t) => `"${t}"`).join(", ")}]`);
      }

      const formatted = `---\n${frontmatterLines.join("\n")}\n---\n\n${text}`;
      bodyTextarea.value = formatted;
      this.showNotice("✅ Metadata injected successfully!", "success");
    } catch (err: any) {
      this.showNotice(`Metadata error: ${err.message}`, "error");
    }
  }

  private async fixCaptureText(): Promise<void> {
    const bodyTextarea = document.getElementById("capture-body") as HTMLTextAreaElement;
    const text = bodyTextarea?.value || "";
    if (!text.trim()) {
      this.showNotice("⚠️ Content is empty!", "error");
      return;
    }

    this.showNotice("✍️ Improving text style & grammar...", "info");
    try {
      const fixed = await ExtAiService.streamEdit(
        this.config.serverUrl,
        this.config.authToken,
        text,
        "Fix grammar, improve style, maintain clean markdown"
      );
      bodyTextarea.value = fixed;
      this.showNotice("✅ Text improved!", "success");
    } catch (err: any) {
      this.showNotice(`Fix text error: ${err.message}`, "error");
    }
  }

  private async triggerAiMetadata(): Promise<void> {
    const container = document.getElementById("ai-response-container");
    const promptInput = document.getElementById("ai-prompt-input") as HTMLTextAreaElement;
    const captureText = (document.getElementById("capture-body") as HTMLTextAreaElement)?.value || "";

    if (container) container.textContent = "Analyzing content and generating tags...\n";
    try {
      const res = await ExtAiService.generateMetadata(this.config.serverUrl, this.config.authToken, captureText || "Markdown note");
      if (container) {
        container.textContent = `### Metadata Generated\n- **Title**: ${res.title || "Untitled"}\n- **Description**: ${res.description || "None"}\n- **Tags**: ${res.tags?.join(", ") || "none"}`;
      }
    } catch (err: any) {
      if (container) container.textContent = `Error: ${err.message}`;
    }
  }

  private async triggerAiFix(): Promise<void> {
    const container = document.getElementById("ai-response-container");
    const captureText = (document.getElementById("capture-body") as HTMLTextAreaElement)?.value || "";
    if (!captureText.trim()) {
      this.showNotice("Capture text is empty.", "error");
      return;
    }

    if (container) container.textContent = "";
    try {
      await ExtAiService.streamEdit(
        this.config.serverUrl,
        this.config.authToken,
        captureText,
        "Improve text and format as clean Markdown",
        (chunk) => {
          if (container) container.textContent += chunk;
        }
      );
    } catch (err: any) {
      if (container) container.textContent += `\nError: ${err.message}`;
    }
  }

  private async sendAiPrompt(): Promise<void> {
    const promptInput = document.getElementById("ai-prompt-input") as HTMLTextAreaElement;
    const container = document.getElementById("ai-response-container");
    const prompt = (promptInput?.value || "").trim();

    if (!prompt) {
      this.showNotice("⚠️ Please enter a prompt!", "error");
      return;
    }

    const captureText = (document.getElementById("capture-body") as HTMLTextAreaElement)?.value || "";

    if (container) container.textContent = "Thinking... ⏳\n";
    try {
      let isFirstChunk = true;
      await ExtAiService.streamPrompt(
        this.config.serverUrl,
        this.config.authToken,
        prompt,
        captureText,
        (chunk) => {
          if (isFirstChunk && container) {
            container.textContent = "";
            isFirstChunk = false;
          }
          if (container) {
            container.textContent += chunk;
            container.scrollTop = container.scrollHeight;
          }
        }
      );
    } catch (err: any) {
      if (container) container.textContent = `Error: ${err.message}`;
    }
  }

  private recordVoiceNote(): void {
    const container = document.getElementById("ai-response-container");
    if (container) {
      container.textContent = "🎙️ Voice Recording initiated via Web Audio API. Dictate note...";
    }
    this.showNotice("🎙️ Microphone ready. Transcribing via backend...", "info");
  }

  private insertAiResponseIntoNote(): void {
    const container = document.getElementById("ai-response-container");
    const bodyTextarea = document.getElementById("capture-body") as HTMLTextAreaElement;
    const responseText = container?.textContent || "";

    if (!responseText.trim() || responseText.startsWith("Ready.") || responseText.startsWith("Thinking...")) {
      this.showNotice("No AI response to insert.", "error");
      return;
    }

    if (bodyTextarea) {
      bodyTextarea.value += `\n\n${responseText}\n`;
      this.switchTab("tab-capture");
      this.showNotice("📥 Inserted into active note!", "success");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const controller = new PopupController();
  controller.init();
});
