import { Plugin, MarkdownView, Notice, TFile } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { SyncManager } from "./sync/sync_manager";
import { AiService } from "./ai/ai_service";
import { MobileActionModal } from "./ui/action_modal";
import { ProtectedNoteService } from "./crypto/protected_note_service";
import { EncryptedNoteView, VIEW_TYPE_ENCRYPTED_NOTE } from "./ui/encrypted_note_view";

export default class ObsidianSyncAiPlugin extends Plugin {
  settings!: PluginSettings;
  syncManager!: SyncManager;
  aiService!: AiService;
  protectedNoteService!: ProtectedNoteService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.syncManager = new SyncManager(this.app, this);
    this.aiService = new AiService(this.app, this);
    this.protectedNoteService = new ProtectedNoteService(this.app, this);

    // 0. Register Custom Protected Note View
    this.registerView(
      VIEW_TYPE_ENCRYPTED_NOTE,
      (leaf) => new EncryptedNoteView(leaf, this)
    );

    // 1. Settings Tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // 2. Mobile Toolbar & Ribbon Icons (Primary Action Menus)
    this.addRibbonIcon("bot", "AI Assistant & Sync Actions", () => {
      this.openMobileActionModal();
    });

    this.addRibbonIcon("lock", "Protect / Unlock Note", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile instanceof TFile) {
        const isEncrypted = await this.protectedNoteService.isNoteEncrypted(activeFile);
        if (isEncrypted) {
          await this.protectedNoteService.promptAndUnlockNote(activeFile);
        } else {
          await this.protectedNoteService.promptAndEncryptNote(activeFile);
        }
      } else {
        new Notice("⚠️ Please open a note to protect or unlock.");
      }
    });

    // 3. Register Commands (Always visible & addable to Mobile Toolbar)
    this.addCommand({
      id: "open-action-modal",
      name: "Open AI Action Menu",
      callback: () => {
        this.openMobileActionModal();
      },
    });

    this.addCommand({
      id: "sync-now",
      name: "Sync Vault Now",
      callback: async () => {
        await this.syncManager.performSync(true);
      },
    });

    this.addCommand({
      id: "protect-note-toggle",
      name: "Protect or unlock note (Lock / Encrypt)",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile) {
          const isEncrypted = await this.protectedNoteService.isNoteEncrypted(activeFile);
          if (isEncrypted) {
            await this.protectedNoteService.promptAndUnlockNote(activeFile);
          } else {
            await this.protectedNoteService.promptAndEncryptNote(activeFile);
          }
        } else {
          new Notice("⚠️ Please open a note to protect or unlock.");
        }
      },
    });

    this.addCommand({
      id: "encrypt-current-note",
      name: "Encrypt current note with password",
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile) {
          this.protectedNoteService.promptAndEncryptNote(activeFile);
        } else {
          new Notice("⚠️ Please open a note to encrypt.");
        }
      },
    });

    this.addCommand({
      id: "unlock-current-note",
      name: "Unlock protected note",
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile) {
          this.protectedNoteService.promptAndUnlockNote(activeFile);
        } else {
          new Notice("⚠️ Please open a note to unlock.");
        }
      },
    });

    this.addCommand({
      id: "generate-metadata",
      name: "Generate Frontmatter Metadata",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile) {
          if (!checking) {
            this.aiService.generateMetadata(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "fix-selection",
      name: "Fix Selected Text with AI",
      editorCallback: (editor) => {
        this.aiService.correctSelectedText(editor);
      },
    });

    // 4. File Watchers for Debounced Auto-Sync & Tombstones
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && this.settings.autoSyncOnSave) {
          this.syncManager.scheduleDebouncedSync();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.syncManager.recordLocalDeletion(file.path);
        }
      })
    );

    // 5. Automatic Startup Sync Trigger
    if (this.settings.autoSyncOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        this.syncManager.performSync(false);
      });
    }

    // 6. Protected Note Auto-Detection on File Open
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (file instanceof TFile) {
          const isEncrypted = await this.protectedNoteService.isNoteEncrypted(file);
          if (isEncrypted) {
            new Notice("🔒 Protected Note detected. Run 'Unlock Protected Note' or tap Action Menu to view.", 4000);
          }
        }
      })
    );

    console.log("Obsidian Mobile Sync & AI Plugin loaded successfully.");
  }

  onunload(): void {
    console.log("Obsidian Mobile Sync & AI Plugin unloaded.");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  public openMobileActionModal(): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = activeView ? activeView.editor : null;
    const activeFile = this.app.workspace.getActiveFile();
    new MobileActionModal(this.app, this, editor, activeFile).open();
  }
}
