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

    contentEl.createEl("h3", { text: "🤖 AI Assistant & Actions" });

    const menuList = contentEl.createDiv({ cls: "nav-folder-children" });

    // Action 1: Metadata Generation
    this.createActionButton(
      menuList,
      "🏷️ Generate Metadata (Frontmatter)",
      "Auto-generate title, description, and tags from note content",
      async () => {
        if (!this.file) {
          new Notice("⚠️ No active note found.");
          return;
        }
        this.close();
        await this.plugin.aiService.generateMetadata(this.file);
      }
    );

    // Action 2: Text Correction
    this.createActionButton(
      menuList,
      "✍️ Fix Text & Improve Style",
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

    // Action 3: Custom AI Prompt
    this.createActionButton(
      menuList,
      "💬 Custom AI Prompt",
      "Query AI using the full open note as context",
      () => {
        this.renderPromptView();
      }
    );

    // Action 4: Voice Input
    this.createActionButton(
      menuList,
      "🎙️ Voice Input (Transcribe)",
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
  }

  private createActionButton(
    container: HTMLElement,
    title: string,
    description: string,
    onClick: () => void
  ): void {
    const item = container.createDiv({ cls: "tree-item-self is-clickable" });
    item.style.padding = "12px 8px";
    item.style.borderBottom = "1px solid var(--background-modifier-border)";
    item.style.display = "flex";
    item.style.flexDirection = "column";

    const titleEl = item.createEl("strong", { text: title });
    titleEl.style.fontSize = "1.05em";

    const descEl = item.createEl("small", { text: description });
    descEl.style.color = "var(--text-muted)";
    descEl.style.marginTop = "2px";

    item.onclick = onClick;
  }

  private renderPromptView(): void {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "modal-header" });
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "12px";

    const titleEl = header.createEl("h3", { text: "💬 Custom AI Prompt" });
    titleEl.style.margin = "0";

    const backBtn = header.createEl("button", { text: "← Back" });
    backBtn.onclick = () => {
      this.onOpen();
    };

    const inputArea = contentEl.createEl("textarea", {
      placeholder: "e.g., Summarize this note in 3 bullet points, or suggest next steps...",
    });
    inputArea.style.width = "100%";
    inputArea.style.height = "80px";
    inputArea.style.padding = "8px";
    inputArea.style.marginBottom = "10px";

    const responseArea = contentEl.createDiv({ cls: "ai-prompt-response" });
    responseArea.style.maxHeight = "200px";
    responseArea.style.overflowY = "auto";
    responseArea.style.padding = "10px";
    responseArea.style.backgroundColor = "var(--background-secondary)";
    responseArea.style.borderRadius = "4px";
    responseArea.style.display = "none";
    responseArea.style.whiteSpace = "pre-wrap";

    const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });
    const sendBtn = btnContainer.createEl("button", { text: "Send Query", cls: "mod-cta" });
    const insertBtn = btnContainer.createEl("button", { text: "Insert into Note" });
    insertBtn.style.display = "none";

    let accumulatedText = "";

    sendBtn.onclick = async () => {
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
      insertBtn.style.display = "none";
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
        insertBtn.style.display = "inline-block";
      } catch (err: any) {
        responseArea.style.color = "var(--text-error, #e53935)";
        responseArea.setText(`❌ Error: ${err.message || err}`);
        new Notice(`❌ AI Query Error: ${err.message || err}`);
      } finally {
        sendBtn.setDisabled(false);
        sendBtn.setText("Send Query");
      }
    };

    insertBtn.onclick = () => {
      if (this.editor && accumulatedText) {
        this.editor.replaceRange(
          `\n\n> [!AI Response]\n> ${accumulatedText.split("\n").join("\n> ")}\n\n`,
          this.editor.getCursor()
        );
        new Notice("✅ AI response inserted into note!");
        this.close();
      }
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
