import { ItemView, WorkspaceLeaf, TFile, Notice, ButtonComponent, MarkdownView } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";
import { CryptoManager } from "../crypto/crypto_manager";

export const VIEW_TYPE_ENCRYPTED_NOTE = "encrypted-note-view";
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class EncryptedNoteView extends ItemView {
  private plugin: ObsidianSyncAiPlugin;
  private file: TFile | null = null;
  private password = "";
  private inMemoryText = "";
  private textareaEl: HTMLTextAreaElement | null = null;
  private inactivityTimer: any = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianSyncAiPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ENCRYPTED_NOTE;
  }

  getDisplayText(): string {
    return `🔒 [Protected] ${this.file?.basename || "Note"}`;
  }

  getIcon(): string {
    return "lock";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("encrypted-note-view-container");

    // Top Action Bar
    const topBar = container.createDiv({ cls: "encrypted-note-topbar" });
    topBar.style.display = "flex";
    topBar.style.justifyContent = "space-between";
    topBar.style.alignItems = "center";
    topBar.style.padding = "8px 12px";
    topBar.style.borderBottom = "1px solid var(--background-modifier-border)";
    topBar.style.backgroundColor = "var(--background-secondary)";
    topBar.style.flexWrap = "wrap";
    topBar.style.gap = "8px";

    // Left info
    const infoDiv = topBar.createDiv({ cls: "encrypted-note-info" });
    infoDiv.style.display = "flex";
    infoDiv.style.alignItems = "center";
    infoDiv.style.gap = "6px";
    const badge = infoDiv.createEl("span", { text: "🔒 Decrypted in Memory" });
    badge.style.fontSize = "0.8em";
    badge.style.fontWeight = "bold";
    badge.style.color = "var(--text-accent)";

    // Right Action Buttons
    const actionsDiv = topBar.createDiv({ cls: "encrypted-note-actions" });
    actionsDiv.style.display = "flex";
    actionsDiv.style.gap = "6px";
    actionsDiv.style.alignItems = "center";

    // Save & Encrypt Button
    new ButtonComponent(actionsDiv)
      .setButtonText("💾 Save & Encrypt")
      .setCta()
      .setTooltip("Encrypt in-memory changes and write to disk")
      .onClick(async () => {
        await this.saveAndEncrypt();
      });

    // Lock Now Button
    new ButtonComponent(actionsDiv)
      .setButtonText("🔒 Lock")
      .setTooltip("Clear memory and lock note immediately")
      .onClick(() => {
        this.lockAndClose();
      });

    // Remove Password Button
    new ButtonComponent(actionsDiv)
      .setButtonText("🔓 Remove Password")
      .setWarning()
      .setTooltip("Decrypt permanently and restore regular plain note")
      .onClick(async () => {
        await this.decryptAndRemovePassword();
      });

    // In-Memory Editor Container
    const editorContainer = container.createDiv({ cls: "encrypted-note-editor-wrapper" });
    editorContainer.style.flex = "1";
    editorContainer.style.display = "flex";
    editorContainer.style.flexDirection = "column";
    editorContainer.style.height = "calc(100% - 50px)";
    editorContainer.style.padding = "12px";

    this.textareaEl = editorContainer.createEl("textarea", {
      cls: "encrypted-note-textarea",
    });
    this.textareaEl.style.width = "100%";
    this.textareaEl.style.height = "100%";
    this.textareaEl.style.flex = "1";
    this.textareaEl.style.resize = "none";
    this.textareaEl.style.fontFamily = "var(--font-monospace)";
    this.textareaEl.style.fontSize = "var(--font-text-size)";
    this.textareaEl.style.lineHeight = "1.5";
    this.textareaEl.style.backgroundColor = "var(--background-primary)";
    this.textareaEl.style.color = "var(--text-normal)";
    this.textareaEl.style.border = "none";
    this.textareaEl.style.outline = "none";
    this.textareaEl.style.padding = "8px";

    this.textareaEl.value = this.inMemoryText;

    // Reset inactivity timer on input
    this.textareaEl.addEventListener("input", () => {
      this.inMemoryText = this.textareaEl?.value || "";
      this.resetInactivityTimer();
    });

    // Keyboard shortcut Ctrl/Cmd+S to save & encrypt
    this.textareaEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        this.saveAndEncrypt();
      }
    });

    // Listen to visibility change for mobile app backgrounding
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this.lockAndClose();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    this.resetInactivityTimer();
  }

  async onClose(): Promise<void> {
    this.clearTimersAndMemory();
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  public setNoteData(file: TFile, decryptedText: string, password: string): void {
    this.file = file;
    this.inMemoryText = decryptedText;
    this.password = password;

    if (this.textareaEl) {
      this.textareaEl.value = decryptedText;
    }
    this.resetInactivityTimer();
  }

  public async saveAndEncrypt(): Promise<void> {
    if (!this.file) {
      new Notice("⚠️ No active file bound to this view.");
      return;
    }

    if (!this.password) {
      new Notice("⚠️ Encryption key missing. Cannot encrypt.");
      return;
    }

    try {
      this.inMemoryText = this.textareaEl?.value || "";
      const encryptedArmor = await CryptoManager.encrypt(this.inMemoryText, this.password);

      const rawFileContent = await this.app.vault.read(this.file);
      const { frontmatterLines } = CryptoManager.splitFrontmatterAndBody(rawFileContent);
      const newFileContent = CryptoManager.formatNote(frontmatterLines, encryptedArmor, true);

      await this.app.vault.modify(this.file, newFileContent);
      new Notice("💾 Note encrypted and saved to disk.");
      this.resetInactivityTimer();
    } catch (err: any) {
      new Notice(`❌ Failed to encrypt note: ${err?.message || err}`);
    }
  }

  public async decryptAndRemovePassword(): Promise<void> {
    if (!this.file) return;

    const confirmed = confirm(
      "Are you sure you want to remove password protection?\n\nThe note will be saved in regular plain format and will no longer be encrypted."
    );

    if (!confirmed) return;

    try {
      this.inMemoryText = this.textareaEl?.value || "";
      const rawFileContent = await this.app.vault.read(this.file);
      const { frontmatterLines } = CryptoManager.splitFrontmatterAndBody(rawFileContent);
      const plainFileContent = CryptoManager.formatNote(frontmatterLines, this.inMemoryText, false);

      await this.app.vault.modify(this.file, plainFileContent);
      new Notice("🔓 Password protection removed. Note saved in plain Markdown.");

      const targetFile = this.file;
      this.lockAndClose();

      // Open the regular markdown view
      const newLeaf = this.app.workspace.getLeaf(false);
      await newLeaf.openFile(targetFile);
    } catch (err: any) {
      new Notice(`❌ Failed to remove protection: ${err?.message || err}`);
    }
  }

  public lockAndClose(): void {
    this.clearTimersAndMemory();
    new Notice("🔒 Note locked. Memory cleared.");
    this.leaf.detach();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = setTimeout(() => {
      new Notice("⏱️ Protected note locked due to 5 minutes of inactivity.");
      this.lockAndClose();
    }, INACTIVITY_TIMEOUT_MS);
  }

  private clearTimersAndMemory(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this.inMemoryText = "";
    this.password = "";
    if (this.textareaEl) {
      this.textareaEl.value = "";
    }
    this.file = null;
  }
}
