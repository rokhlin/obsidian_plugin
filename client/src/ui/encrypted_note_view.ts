import { ItemView, WorkspaceLeaf, TFile, Notice, ButtonComponent, MarkdownView, Platform } from "obsidian";
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
  private autoSaveTimer: any = null;
  private isSaving = false;
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

    // Left info badge
    const infoDiv = topBar.createDiv({ cls: "encrypted-note-info" });
    const badge = infoDiv.createEl("span", { text: "🔒 Encrypted" });
    badge.style.fontSize = "0.8em";
    badge.style.fontWeight = "bold";
    badge.style.color = "var(--text-accent)";
    badge.style.whiteSpace = "nowrap";

    // Right Action Buttons (Desktop displays full text labels for clarity)
    const actionsDiv = topBar.createDiv({ cls: "encrypted-note-actions" });

    // Save & Encrypt Button ("Сохранить")
    const saveBtn = new ButtonComponent(actionsDiv)
      .setIcon("save")
      .setCta()
      .setTooltip("Save & Encrypt changes to disk");
    if (Platform.isDesktopApp) {
      saveBtn.setButtonText("Save & Encrypt");
    }
    saveBtn.onClick(async () => {
      await this.saveAndEncrypt(false);
    });

    // Lock Now Button ("Заблокировать")
    const lockBtn = new ButtonComponent(actionsDiv)
      .setIcon("lock")
      .setTooltip("Lock note immediately (Clear memory)");
    if (Platform.isDesktopApp) {
      lockBtn.setButtonText("Lock Now");
    }
    lockBtn.onClick(async () => {
      await this.lockAndClose();
    });

    // Clear Password / Remove Protection Button ("Снять блокировку")
    const removeBtn = new ButtonComponent(actionsDiv)
      .setIcon("key")
      .setWarning()
      .setTooltip("Clear Password & Restore Plain Format");
    if (Platform.isDesktopApp) {
      removeBtn.setButtonText("Remove Password");
    }
    removeBtn.onClick(async () => {
      await this.decryptAndRemovePassword();
    });

    // Markdown Formatting Toolbar Strip
    const formattingBar = container.createDiv({ cls: "encrypted-note-formatting-bar" });

    const createFormatBtn = (icon: string, tooltip: string, action: () => void) => {
      new ButtonComponent(formattingBar)
        .setIcon(icon)
        .setTooltip(tooltip)
        .onClick(action);
    };

    createFormatBtn("bold", "Bold (**text**)", () => this.insertFormatting("**", "**", "bold"));
    createFormatBtn("italic", "Italic (*text*)", () => this.insertFormatting("*", "*", "italic"));
    createFormatBtn("strikethrough", "Strikethrough (~~text~~)", () => this.insertFormatting("~~", "~~", "text"));
    createFormatBtn("heading", "Heading (#)", () => this.insertLinePrefix("# "));
    createFormatBtn("list", "Bullet List (-)", () => this.insertLinePrefix("- "));
    createFormatBtn("check-square", "Task List (- [ ])", () => this.insertLinePrefix("- [ ] "));
    createFormatBtn("quote-glyph", "Quote (>)", () => this.insertLinePrefix("> "));
    createFormatBtn("code", "Code (`code`)", () => this.insertFormatting("`", "`", "code"));
    createFormatBtn("link", "Link ([title](url))", () => this.insertFormatting("[", "](url)", "title"));

    // In-Memory Editor Container
    const editorContainer = container.createDiv({ cls: "encrypted-note-editor-wrapper" });

    this.textareaEl = editorContainer.createEl("textarea", {
      cls: "encrypted-note-textarea",
    });
    this.textareaEl.value = this.inMemoryText;

    // Register active editor shim on focus for mobile toolbar compatibility
    this.textareaEl.addEventListener("focus", () => {
      (this.app.workspace as any).activeEditor = this;
    });

    // Reset inactivity timer and trigger debounced auto-save on input
    this.textareaEl.addEventListener("input", () => {
      this.inMemoryText = this.textareaEl?.value || "";
      this.resetInactivityTimer();
      this.scheduleAutoSave();
    });

    // Flush auto-save on blur
    this.textareaEl.addEventListener("blur", async () => {
      if ((this.app.workspace as any).activeEditor === this) {
        (this.app.workspace as any).activeEditor = null;
      }
      await this.flushAutoSave();
    });

    // Keyboard shortcut Ctrl/Cmd+S to save & encrypt
    this.textareaEl.addEventListener("keydown", async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        await this.saveAndEncrypt(false);
      }
    });

    // Listen to visibility change for mobile app backgrounding
    this.visibilityHandler = async () => {
      if (document.visibilityState === "hidden") {
        await this.lockAndClose();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    this.resetInactivityTimer();
  }

  /**
   * Helper to wrap selected text or insert markdown formatting markers.
   */
  private insertFormatting(prefix: string, suffix = prefix, placeholder = "text"): void {
    if (!this.textareaEl) return;
    const start = this.textareaEl.selectionStart;
    const end = this.textareaEl.selectionEnd;
    const value = this.textareaEl.value;
    const selected = value.substring(start, end);

    let replacement = "";
    if (selected.length > 0) {
      replacement = `${prefix}${selected}${suffix}`;
    } else {
      replacement = `${prefix}${placeholder}${suffix}`;
    }

    this.textareaEl.setRangeText(replacement, start, end, "select");
    const newCursor = start + prefix.length + (selected.length || placeholder.length);
    this.textareaEl.setSelectionRange(newCursor, newCursor);
    this.textareaEl.focus();
    this.inMemoryText = this.textareaEl.value;
    this.resetInactivityTimer();
    this.scheduleAutoSave();
  }

  /**
   * Helper to prepend a line prefix (heading, bullet, checkbox, quote) to the current line.
   */
  private insertLinePrefix(prefix: string): void {
    if (!this.textareaEl) return;
    const start = this.textareaEl.selectionStart;
    const value = this.textareaEl.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    this.textareaEl.setRangeText(prefix, lineStart, lineStart, "end");
    this.textareaEl.focus();
    this.inMemoryText = this.textareaEl.value;
    this.resetInactivityTimer();
    this.scheduleAutoSave();
  }

  /**
   * Editor interface shim for Obsidian mobile toolbar and command compatibility.
   */
  public get editor(): any {
    return {
      getSelection: () => {
        if (!this.textareaEl) return "";
        return this.textareaEl.value.substring(this.textareaEl.selectionStart, this.textareaEl.selectionEnd);
      },
      replaceSelection: (replacement: string) => {
        if (!this.textareaEl) return;
        const start = this.textareaEl.selectionStart;
        const end = this.textareaEl.selectionEnd;
        this.textareaEl.setRangeText(replacement, start, end, "end");
        this.inMemoryText = this.textareaEl.value;
        this.scheduleAutoSave();
      },
      getValue: () => this.textareaEl?.value || "",
      setValue: (val: string) => {
        if (this.textareaEl) {
          this.textareaEl.value = val;
          this.inMemoryText = val;
          this.scheduleAutoSave();
        }
      },
      focus: () => this.textareaEl?.focus(),
    };
  }

  async onClose(): Promise<void> {
    await this.flushAutoSave();
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

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(async () => {
      this.autoSaveTimer = null;
      await this.saveAndEncrypt(true);
    }, 1500);
  }

  public async flushAutoSave(): Promise<void> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
      await this.saveAndEncrypt(true);
    }
  }

  public async saveAndEncrypt(silent = false): Promise<void> {
    if (this.isSaving) return;
    if (!this.file) {
      if (!silent) new Notice("⚠️ No active file bound to this view.");
      return;
    }

    if (!this.password) {
      if (!silent) new Notice("⚠️ Encryption key missing. Cannot encrypt.");
      return;
    }

    this.isSaving = true;
    try {
      this.inMemoryText = this.textareaEl?.value || "";
      const encryptedArmor = await CryptoManager.encrypt(this.inMemoryText, this.password);

      const rawFileContent = await this.app.vault.read(this.file);
      const { frontmatterLines } = CryptoManager.splitFrontmatterAndBody(rawFileContent);
      const newFileContent = CryptoManager.formatNote(frontmatterLines, encryptedArmor, true);

      await this.app.vault.modify(this.file, newFileContent);
      if (!silent) {
        new Notice("💾 Note encrypted and saved to disk.");
      }
      this.resetInactivityTimer();

      // Trigger automatic debounced full-note sync
      if (this.plugin.settings.autoSyncOnSave) {
        this.plugin.syncManager.scheduleDebouncedSync();
      }
    } catch (err: any) {
      if (!silent) {
        new Notice(`❌ Failed to encrypt note: ${err?.message || err}`);
      } else {
        console.error("Auto-save failed in EncryptedNoteView:", err);
      }
    } finally {
      this.isSaving = false;
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
      await this.lockAndClose();

      // Open the regular markdown view
      const newLeaf = this.app.workspace.getLeaf(false);
      await newLeaf.openFile(targetFile);
    } catch (err: any) {
      new Notice(`❌ Failed to remove protection: ${err?.message || err}`);
    }
  }

  public async lockAndClose(): Promise<void> {
    await this.flushAutoSave();
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
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
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
