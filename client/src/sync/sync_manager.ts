import { App, TFile, Notice, requestUrl } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";
import { computeContentHash } from "./hash_utils";

interface LocalFileState {
  mtime: number;
  hash: string;
}

export class SyncManager {
  private app: App;
  private plugin: ObsidianSyncAiPlugin;
  private isSyncing = false;
  private debounceTimer: number | null = null;
  private localStateCache: Record<string, LocalFileState> = {};
  private localTombstones: Set<string> = new Set();

  constructor(app: App, plugin: ObsidianSyncAiPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  public recordLocalDeletion(path: string): void {
    this.localTombstones.add(path);
    delete this.localStateCache[path];
    if (this.plugin.settings.autoSyncOnSave) {
      this.scheduleDebouncedSync();
    }
  }

  public scheduleDebouncedSync(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    const delayMs = (this.plugin.settings.syncDebounceSeconds || 3) * 1000;
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.performSync(false);
    }, delayMs);
  }

  public async performSync(isManual = false): Promise<void> {
    if (this.isSyncing) {
      if (isManual) new Notice("⏳ Synchronization already in progress...");
      return;
    }

    const { serverUrl, authToken } = this.plugin.settings;
    if (!serverUrl || !authToken) {
      if (isManual) {
        new Notice("⚠️ Please configure Server URL and Auth Token in settings.");
      }
      return;
    }

    this.isSyncing = true;
    if (isManual) new Notice("🔄 Starting bidirectional sync...");

    try {
      // 1. Gather all local files & compute hashes only if mtime modified
      const markdownFiles = this.app.vault.getMarkdownFiles();
      const clientFiles: Record<string, string> = {};

      for (const file of markdownFiles) {
        const path = file.path;
        const currentMtime = file.stat.mtime;
        const cached = this.localStateCache[path];

        if (cached && cached.mtime === currentMtime) {
          clientFiles[path] = cached.hash;
        } else {
          const content = await this.app.vault.read(file);
          const hash = await computeContentHash(content);
          this.localStateCache[path] = { mtime: currentMtime, hash };
          clientFiles[path] = hash;
        }
      }

      // 2. Status Handshake
      const deletedOnClient = Array.from(this.localTombstones);
      const statusResp = await requestUrl({
        url: `${serverUrl}/api/sync/status`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Auth-Token": authToken,
        },
        body: JSON.stringify({ clientFiles, deletedOnClient }),
      });

      if (statusResp.status !== 200) {
        throw new Error(`Sync status check returned HTTP ${statusResp.status}`);
      }

      const { toDownload, toUpload, acknowledgedDeletions } = statusResp.json;

      // 3. Clear acknowledged deletions
      if (Array.isArray(acknowledgedDeletions)) {
        for (const ackPath of acknowledgedDeletions) {
          this.localTombstones.delete(ackPath);
        }
      }

      // 4. Process Uploads (files modified locally)
      if (Array.isArray(toUpload) && toUpload.length > 0) {
        const uploadPayloads = [];
        for (const uploadPath of toUpload) {
          const file = this.app.vault.getAbstractFileByPath(uploadPath);
          if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            const hash = this.localStateCache[uploadPath]?.hash || (await computeContentHash(content));
            uploadPayloads.push({
              path: uploadPath,
              content,
              mtime: file.stat.mtime,
              hash,
            });
          }
        }

        if (uploadPayloads.length > 0) {
          await requestUrl({
            url: `${serverUrl}/api/sync/upload`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
              "X-Auth-Token": authToken,
            },
            body: JSON.stringify({ files: uploadPayloads }),
          });
        }
      }

      // 5. Process Downloads (new or modified notes on server)
      if (Array.isArray(toDownload) && toDownload.length > 0) {
        const downloadResp = await requestUrl({
          url: `${serverUrl}/api/sync/download`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "X-Auth-Token": authToken,
          },
          body: JSON.stringify({ paths: toDownload }),
        });

        if (downloadResp.status === 200 && Array.isArray(downloadResp.json.files)) {
          for (const serverFile of downloadResp.json.files) {
            const existingFile = this.app.vault.getAbstractFileByPath(serverFile.path);
            if (existingFile instanceof TFile) {
              await this.app.vault.modify(existingFile, serverFile.content);
            } else {
              // Create folders if needed
              const folderPath = serverFile.path.substring(0, serverFile.path.lastIndexOf("/"));
              if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
                await this.app.vault.createFolder(folderPath);
              }
              await this.app.vault.create(serverFile.path, serverFile.content);
            }

            this.localStateCache[serverFile.path] = {
              mtime: serverFile.mtime,
              hash: serverFile.hash,
            };
          }
        }
      }

      const uploadCount = toUpload ? toUpload.length : 0;
      const downloadCount = toDownload ? toDownload.length : 0;
      if (isManual || uploadCount > 0 || downloadCount > 0) {
        new Notice(`✅ Sync completed: ↑${uploadCount} uploaded, ↓${downloadCount} downloaded`);
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      if (isManual) {
        new Notice(`❌ Sync error: ${err.message || err}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }
}
