import { App, Modal, Notice, Editor, TFile } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";
import { VoiceRecorderModal } from "./voice_recorder_modal";

export class MobileActionModal extends Modal {
  private plugin: ObsidianSyncAiPlugin;
  private editor: Editor | null;
  private file: TFile | null;

  constructor(app: App, plugin: ObsidianSyncAiPlugin, editor: Editor | null, file: TFile | null) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.file = file;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("obsidian-sync-ai-action-modal");

    // Header
    const header = contentEl.createDiv({ cls: "modal-header" });
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "14px";

    const titleEl = header.createEl("h3", { text: "🤖 AI Assistant & Actions" });
    titleEl.style.margin = "0";

    // 1. Quick Actions Bar (Compact icon buttons, not a vertical list)
    const quickActionsBar = contentEl.createDiv({ cls: "ai-quick-actions-bar" });
    quickActionsBar.style.display = "flex";
    quickActionsBar.style.flexWrap = "wrap";
    quickActionsBar.style.gap = "8px";
    quickActionsBar.style.marginBottom = "16px";

    // Quick Action 1: Metadata Generation
    this.createQuickActionButton(
      quickActionsBar,
      "🏷️ Metadata",
      "Auto-generate title, description, and tags for active note",
      async () => {
        if (!this.file) {
          new Notice("⚠️ No active note found.");
          return;
        }
        this.close();
        await this.plugin.aiService.generateMetadata(this.file);
      }
    );

    // Quick Action 2: Text Correction & Style Improvement
    this.createQuickActionButton(
      quickActionsBar,
      "✍️ Fix Text",
      "Correct grammar and refine phrasing for note or selected text",
      async () => {
        if (!this.editor) {
          new Notice("⚠️ No active editor found.");
          return;
        }
        this.close();
        await this.plugin.aiService.correctSelectedText(this.editor);
      }
    );

    // Quick Action 3: Voice Input
    this.createQuickActionButton(
      quickActionsBar,
      "🎙️ Voice",
      "Record audio via microphone and insert transcribed text",
      () => {
        if (!this.editor) {
          new Notice("⚠️ Please open a note to insert voice transcription.");
          return;
        }
        this.close();
        new VoiceRecorderModal(this.app, this.plugin, this.editor).open();
      }
    );

    // Quick Action 4: Protected Notes (Unlock or Encrypt)
    if (this.file) {
      const cache = this.app.metadataCache.getFileCache(this.file);
      const isEncrypted = cache?.frontmatter?.encrypted === true;

      if (isEncrypted) {
        this.createQuickActionButton(
          quickActionsBar,
          "🔓 Unlock Note",
          "Unlock protected note into secure in-memory editor",
          async () => {
            this.close();
            if (this.file) {
              await this.plugin.protectedNoteService.promptAndUnlockNote(this.file);
            }
          }
        );
      } else {
        this.createQuickActionButton(
          quickActionsBar,
          "🔒 Encrypt Note",
          "Protect this note with password encryption",
          async () => {
            this.close();
            if (this.file) {
              await this.plugin.protectedNoteService.promptAndEncryptNote(this.file);
            }
          }
        );
      }
    }

    // 2. Direct Custom AI Prompt Section (Visible immediately upon modal open)
    const promptSection = contentEl.createDiv({ cls: "ai-prompt-section" });
    promptSection.style.borderTop = "1px solid var(--background-modifier-border)";
    promptSection.style.paddingTop = "12px";

    const promptLabel = promptSection.createEl("label", {
      text: "💬 Custom AI Prompt (Markdown Output):",
    });
    promptLabel.style.display = "block";
    promptLabel.style.fontWeight = "600";
    promptLabel.style.fontSize = "0.95em";
    promptLabel.style.marginBottom = "6px";

    const inputArea = promptSection.createEl("textarea", {
      cls: "ai-prompt-input",
      placeholder: "e.g., Summarize key takeaways, extract action items, or format as a table... (Ctrl+Enter to send)",
    });
    inputArea.style.width = "100%";
    inputArea.style.minHeight = "76px";
    inputArea.style.padding = "8px 10px";
    inputArea.style.borderRadius = "var(--radius-s, 4px)";
    inputArea.style.border = "1px solid var(--background-modifier-border)";
    inputArea.style.backgroundColor = "var(--background-primary)";
    inputArea.style.color = "var(--text-normal)";
    inputArea.style.fontSize = "0.9em";
    inputArea.style.lineHeight = "1.4";
    inputArea.style.resize = "vertical";
    inputArea.style.marginBottom = "10px";

    // Controls container
    const controlsContainer = promptSection.createDiv({ cls: "modal-button-container" });
    controlsContainer.style.display = "flex";
    controlsContainer.style.justifyContent = "space-between";
    controlsContainer.style.alignItems = "center";
    controlsContainer.style.marginBottom = "10px";

    const hintText = controlsContainer.createEl("small", {
      text: "Note context is automatically included",
    });
    hintText.style.color = "var(--text-muted)";

    const sendBtn = controlsContainer.createEl("button", {
      text: "Send Query",
      cls: "mod-cta",
    });
    sendBtn.style.minHeight = "36px";
    sendBtn.style.padding = "0 16px";

    // Inline Streaming Response Area
    const responseArea = promptSection.createDiv({ cls: "ai-prompt-response" });
    responseArea.style.maxHeight = "220px";
    responseArea.style.overflowY = "auto";
    responseArea.style.padding = "10px 12px";
    responseArea.style.backgroundColor = "var(--background-secondary)";
    responseArea.style.borderRadius = "var(--radius-s, 4px)";
    responseArea.style.border = "1px solid var(--background-modifier-border)";
    responseArea.style.display = "none";
    responseArea.style.whiteSpace = "pre-wrap";
    responseArea.style.marginBottom = "10px";
    responseArea.style.fontSize = "0.9em";

    // Action buttons after response is generated
    const responseActionContainer = promptSection.createDiv({ cls: "ai-response-actions" });
    responseActionContainer.style.display = "none";
    responseActionContainer.style.justifyContent = "flex-end";
    responseActionContainer.style.gap = "8px";

    const insertBtn = responseActionContainer.createEl("button", {
      text: "Insert into Note",
      cls: "mod-cta",
    });
    insertBtn.style.minHeight = "36px";

    let accumulatedText = "";

    const executePrompt = async () => {
      const promptText = inputArea.value.trim();
      if (!promptText) {
        new Notice("⚠️ Please enter a prompt first.");
        return;
      }

      sendBtn.setDisabled(true);
      sendBtn.setText("Thinking... ⏳");
      responseArea.style.display = "block";
      responseArea.style.color = "var(--text-muted)";
      responseArea.setText("Thinking... 🤖✨");
      responseActionContainer.style.display = "none";
      accumulatedText = "";

      const context = this.editor
        ? this.editor.getValue()
        : (this.file ? await this.app.vault.read(this.file) : "");

      let hasReceivedFirstChunk = false;

      try {
        await this.plugin.aiService.promptWithContext(promptText, context, (chunk) => {
          if (!hasReceivedFirstChunk) {
            hasReceivedFirstChunk = true;
            responseArea.style.color = "var(--text-normal)";
            responseArea.setText("");
          }
          accumulatedText += chunk;
          responseArea.setText(accumulatedText);
          responseArea.scrollTop = responseArea.scrollHeight;
        });

        if (accumulatedText.trim().length > 0) {
          responseActionContainer.style.display = "flex";
        }
      } catch (err: any) {
        responseArea.style.color = "var(--text-error, #e53935)";
        responseArea.setText(`❌ Error: ${err.message || err}`);
        new Notice(`❌ AI Query Error: ${err.message || err}`);
      } finally {
        sendBtn.setDisabled(false);
        sendBtn.setText("Send Query");
      }
    };

    sendBtn.onclick = executePrompt;

    // Support Ctrl+Enter / Cmd+Enter shortcut
    inputArea.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        executePrompt();
      }
    });

    insertBtn.onclick = () => {
      if (this.editor && accumulatedText) {
        this.editor.replaceRange(
          `\n\n> [!AI Response]\n> ${accumulatedText.split("\n").join("\n> ")}\n\n`,
          this.editor.getCursor()
        );
        new Notice("✅ AI response inserted into note!");
        this.close();
      } else if (!this.editor) {
        new Notice("⚠️ No active editor to insert response.");
      }
    };

    // Auto-focus input area on open
    setTimeout(() => {
      inputArea.focus();
    }, 50);
  }

  private createQuickActionButton(
    container: HTMLElement,
    title: string,
    description: string,
    onClick: () => void | Promise<void>
  ): void {
    const btn = container.createEl("button", { cls: "ai-action-btn" });
    btn.setText(title);
    btn.title = description;
    btn.style.flex = "1 1 30%";
    btn.style.minHeight = "44px";
    btn.style.minWidth = "90px";
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "var(--radius-m, 6px)";
    btn.style.border = "1px solid var(--background-modifier-border)";
    btn.style.backgroundColor = "var(--background-secondary)";
    btn.style.color = "var(--text-normal)";
    btn.style.fontSize = "0.9em";
    btn.style.fontWeight = "500";
    btn.style.cursor = "pointer";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "6px";
    btn.style.transition = "background-color 0.15s ease, border-color 0.15s ease";

    btn.onclick = async () => {
      await onClick();
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
