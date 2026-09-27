import { Plugin, MarkdownView, Notice, TFile } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { SyncManager } from "./sync/sync_manager";
import { AiService } from "./ai/ai_service";
import { MobileActionModal } from "./ui/action_modal";

export default class ObsidianSyncAiPlugin extends Plugin {
  settings!: PluginSettings;
  syncManager!: SyncManager;
  aiService!: AiService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.syncManager = new SyncManager(this.app, this);
    this.aiService = new AiService(this.app, this);

    // 1. Settings Tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // 2. Mobile Toolbar & Ribbon Icon (Primary Action Menu)
    this.addRibbonIcon("bot", "AI Assistant & Sync Actions", () => {
      this.openMobileActionModal();
    });

    // 3. Register Commands
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
