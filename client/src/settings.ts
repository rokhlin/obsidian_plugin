import { App, PluginSettingTab, Setting, Notice, requestUrl } from "obsidian";
import type ObsidianSyncAiPlugin from "./main";

export interface PluginSettings {
  serverUrl: string;
  authToken: string;
  syncDebounceSeconds: number;
  autoSyncOnStartup: boolean;
  autoSyncOnSave: boolean;
  aiModel: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "https://ob.alltogo.net",
  authToken: "",
  syncDebounceSeconds: 3,
  autoSyncOnStartup: true,
  autoSyncOnSave: true,
  aiModel: "gemini-2.5-flash",
};

export class SettingsTab extends PluginSettingTab {
  plugin: ObsidianSyncAiPlugin;

  constructor(app: App, plugin: ObsidianSyncAiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Mobile Sync & AI Settings" });

    new Setting(containerEl)
      .setName("Backend Server URL")
      .setDesc("Address of your self-hosted FastAPI backend (e.g., https://ob.alltogo.net or http://192.168.1.100:5125)")
      .addText((text) =>
        text
          .setPlaceholder("https://ob.alltogo.net")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Authentication Bearer Token")
      .setDesc("Pre-shared secret token configured in your server data/config/.env file")
      .addText((text) =>
        text
          .setPlaceholder("Enter AUTH_TOKEN")
          .setValue(this.plugin.settings.authToken)
          .onChange(async (value) => {
            this.plugin.settings.authToken = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Test Backend Connection")
      .setDesc("Verify reachability and authentication with your backend")
      .addButton((btn) =>
        btn.setButtonText("Test Connection").onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Testing...");
          try {
            const url = `${this.plugin.settings.serverUrl}/api/health`;
            const resp = await requestUrl({
              url,
              method: "GET",
              headers: {
                Authorization: `Bearer ${this.plugin.settings.authToken}`,
                "X-Auth-Token": this.plugin.settings.authToken,
              },
            });
            if (resp.status === 200) {
              const data = resp.json;
              new Notice(`✅ Connected! Service: ${data.service}, Port: ${data.port}`);
            } else {
              new Notice(`⚠️ Server returned HTTP ${resp.status}`);
            }
          } catch (err: any) {
            new Notice(`❌ Connection failed: ${err.message || err}`);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText("Test Connection");
          }
        })
      );

    containerEl.createEl("h3", { text: "Synchronization Options" });

    new Setting(containerEl)
      .setName("Auto-Sync on Startup")
      .setDesc("Trigger an automatic sync check as soon as Obsidian loads")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-Sync on Note Modification")
      .setDesc("Trigger synchronization after editing a note")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncOnSave)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncOnSave = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync Debounce Delay (Seconds)")
      .setDesc("Delay of user inactivity after typing before auto-sync triggers")
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.syncDebounceSeconds)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncDebounceSeconds = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
