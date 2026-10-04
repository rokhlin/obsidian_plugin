import { App, TFile, Notice, requestUrl } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";
import { computeContentHash } from "./hash_utils";

interface LocalFileState {
  mtime: number;
  size: number;
  hash: string;
}

export class SyncManager {
  private app: App;
  private plugin: ObsidianSyncAiPlugin;
  private isSyncing = false;
  private debounceTimer: number | null = null;
  private localStateCache: Record<string, LocalFileState> = {};
  private localTombstones: Set<string> = new Set();
  private lastSyncedFiles: Record<string, string> = {};

  constructor(app: App, plugin: ObsidianSyncAiPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  private getSyncStatePath(): string {
    const dir = this.plugin?.manifest?.dir || ".obsidian/plugins/obsidian-sync-ai";
    return `${dir}/.sync-state.json`;
  }

  public async loadSyncState(): Promise<void> {
    try {
      const statePath = this.getSyncStatePath();
      if (this.app?.vault?.adapter && (await this.app.vault.adapter.exists(statePath))) {
        const raw = await this.app.vault.adapter.read(statePath);
        const data = JSON.parse(raw);
        if (Array.isArray(data.tombstones)) {
          for (const t of data.tombstones) {
            if (typeof t === "string") this.localTombstones.add(t);
          }
        }
        if (data.lastSyncedFiles && typeof data.lastSyncedFiles === "object") {
          this.lastSyncedFiles = data.lastSyncedFiles;
        }
      }
    } catch (err) {
      console.warn("Could not load sync state from disk:", err);
    }

    // Reconcile offline moves/deletes: if a tracked file disappeared from vault, tombstone it
    if (this.app?.vault?.getAbstractFileByPath) {
      for (const trackedPath of Object.keys(this.lastSyncedFiles)) {
        if (!this.app.vault.getAbstractFileByPath(trackedPath)) {
          this.localTombstones.add(trackedPath);
        }
      }
    }

    // Sanitize: ensure no actively existing markdown file is mistakenly tombstoned
    if (this.app?.vault?.getMarkdownFiles) {
      const activeFiles = this.app.vault.getMarkdownFiles();
      for (const f of activeFiles) {
        if (this.localTombstones.has(f.path)) {
          this.localTombstones.delete(f.path);
        }
      }
    }
  }

  public async saveSyncState(): Promise<void> {
    try {
      if (this.app?.vault?.adapter) {
        const statePath = this.getSyncStatePath();
        const dir = this.plugin?.manifest?.dir || ".obsidian/plugins/obsidian-sync-ai";
        if (!(await this.app.vault.adapter.exists(dir))) {
          await this.app.vault.adapter.mkdir(dir);
        }
        const data = {
          tombstones: Array.from(this.localTombstones),
          lastSyncedFiles: this.lastSyncedFiles,
        };
        await this.app.vault.adapter.write(statePath, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.warn("Could not save sync state to disk:", err);
    }
  }

  public recordLocalDeletion(path: string): void {
    this.localTombstones.add(path);
    delete this.localStateCache[path];
    this.saveSyncState().catch(() => {});
    if (this.plugin.settings.autoSyncOnSave) {
      this.scheduleDebouncedSync();
    }
  }

  public recordLocalFolderDeletion(folderPath: string): void {
    const prefix = folderPath.endsWith("/") ? folderPath : folderPath + "/";
    const affectedPaths = new Set<string>();

    for (const key of Object.keys(this.localStateCache)) {
      if (key.startsWith(prefix)) affectedPaths.add(key);
    }
    for (const key of Object.keys(this.lastSyncedFiles)) {
      if (key.startsWith(prefix)) affectedPaths.add(key);
    }
    for (const p of affectedPaths) {
      this.localTombstones.add(p);
      delete this.localStateCache[p];
    }
    this.saveSyncState().catch(() => {});
    if (this.plugin.settings.autoSyncOnSave) {
      this.scheduleDebouncedSync();
    }
  }

  public recordLocalRename(oldPath: string, newPath: string): void {
    this.localTombstones.add(oldPath);
    delete this.localStateCache[oldPath];
    this.localTombstones.delete(newPath);

    this.saveSyncState().catch(() => {});
    if (this.plugin.settings.autoSyncOnSave) {
      this.scheduleDebouncedSync();
    }
  }

  public recordLocalFolderRename(oldFolderPath: string, newFolderPath: string): void {
    const oldPrefix = oldFolderPath.endsWith("/") ? oldFolderPath : oldFolderPath + "/";
    const newPrefix = newFolderPath.endsWith("/") ? newFolderPath : newFolderPath + "/";

    // 1. Files currently in vault under newPrefix
    if (this.app?.vault?.getMarkdownFiles) {
      const currentFiles = this.app.vault.getMarkdownFiles();
      for (const file of currentFiles) {
        if (file.path.startsWith(newPrefix)) {
          const relPath = file.path.substring(newPrefix.length);
          const oldFilePath = oldPrefix + relPath;
          this.localTombstones.add(oldFilePath);
          delete this.localStateCache[oldFilePath];
          this.localTombstones.delete(file.path);
        }
      }
    }

    // 2. Previously cached or tracked files under oldPrefix
    const affectedOldPaths = new Set<string>();
    for (const key of Object.keys(this.localStateCache)) {
      if (key.startsWith(oldPrefix)) affectedOldPaths.add(key);
    }
    for (const key of Object.keys(this.lastSyncedFiles)) {
      if (key.startsWith(oldPrefix)) affectedOldPaths.add(key);
    }
    for (const oldFilePath of affectedOldPaths) {
      this.localTombstones.add(oldFilePath);
      delete this.localStateCache[oldFilePath];
    }

    this.saveSyncState().catch(() => {});
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
    if (this.plugin.settings.enableCloudSync === false) {
      if (isManual) {
        new Notice("ℹ️ Cloud Sync is disabled in settings. Operating in Local Direct Mode.");
      }
      return;
    }

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
      // 0. Flush in-memory editor buffers to disk before reading vault
      const encryptedLeaves = this.app.workspace.getLeavesOfType("encrypted-note-view");
      const activeEncryptedPaths = new Set<string>();
      for (const leaf of encryptedLeaves) {
        if (leaf.view && typeof (leaf.view as any).flushAutoSave === "function") {
          try {
            await (leaf.view as any).flushAutoSave();
            const boundFile = (leaf.view as any).file;
            if (boundFile?.path) {
              activeEncryptedPaths.add(boundFile.path);
            }
          } catch (e) {
            console.warn("Could not flush encrypted note leaf:", e);
          }
        }
      }

      const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
      for (const leaf of markdownLeaves) {
        const filePath = (leaf.view as any)?.file?.path;
        if (filePath && activeEncryptedPaths.has(filePath)) {
          continue; // Prevent stale CodeMirror buffer from overwriting freshly saved encrypted note
        }
        if (leaf.view && typeof (leaf.view as any).save === "function") {
          try {
            await (leaf.view as any).save();
          } catch (saveErr) {
            console.warn("Could not flush markdown leaf before sync:", saveErr);
          }
        }
      }

      // 1. Gather all local files & compute hashes only if mtime and size are unmodified
      const markdownFiles = this.app.vault.getMarkdownFiles();
      const clientFiles: Record<string, string> = {};

      for (const file of markdownFiles) {
        // Ensure no actively present vault file is marked as deleted
        if (this.localTombstones.has(file.path)) {
          this.localTombstones.delete(file.path);
        }

        const path = file.path;
        const currentMtime = file.stat.mtime;
        const currentSize = file.stat.size;
        const cached = this.localStateCache[path];

        if (cached && cached.mtime === currentMtime && cached.size === currentSize) {
          clientFiles[path] = cached.hash;
        } else {
          const content = await this.app.vault.read(file);
          const hash = await computeContentHash(content);
          this.localStateCache[path] = { mtime: currentMtime, size: currentSize, hash };
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
          delete this.lastSyncedFiles[ackPath];
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

            const updatedFile = this.app.vault.getAbstractFileByPath(serverFile.path);
            const finalSize = updatedFile instanceof TFile ? updatedFile.stat.size : serverFile.content.length;

            this.localStateCache[serverFile.path] = {
              mtime: serverFile.mtime,
              size: finalSize,
              hash: serverFile.hash,
            };
          }
        }
      }

      // 6. Update lastSyncedFiles snapshot and persist sync state
      const finalMarkdownFiles = this.app.vault.getMarkdownFiles();
      const updatedLastSynced: Record<string, string> = {};
      for (const f of finalMarkdownFiles) {
        const cached = this.localStateCache[f.path];
        if (cached) {
          updatedLastSynced[f.path] = cached.hash;
        } else if (clientFiles[f.path]) {
          updatedLastSynced[f.path] = clientFiles[f.path];
        }
      }
      this.lastSyncedFiles = updatedLastSynced;
      await this.saveSyncState();

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
