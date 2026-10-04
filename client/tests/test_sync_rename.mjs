import test from "node:test";
import assert from "node:assert/strict";
import { SyncManager } from "../client_sync_test_bundle.js";
import { TFile } from "./mocks/obsidian_mock.js";

function createMockAppAndPlugin() {
  const fileStore = new Map();
  const diskStore = new Map();

  const app = {
    vault: {
      adapter: {
        async exists(path) {
          return diskStore.has(path);
        },
        async read(path) {
          if (!diskStore.has(path)) throw new Error("File not found: " + path);
          return diskStore.get(path);
        },
        async write(path, data) {
          diskStore.set(path, data);
        },
        async mkdir(dir) {},
      },
      getMarkdownFiles() {
        return Array.from(fileStore.values()).filter((f) => f.extension === "md");
      },
      getAbstractFileByPath(path) {
        return fileStore.get(path) || null;
      },
      async read(file) {
        return file.content || "";
      },
      async modify(file, content) {
        file.content = content;
      },
      async create(path, content) {
        const file = new TFile(path, content);
        fileStore.set(path, file);
        return file;
      },
      async createFolder(path) {},
    },
    workspace: {
      getLeavesOfType() {
        return [];
      },
    },
  };

  const plugin = {
    settings: {
      enableCloudSync: true,
      serverUrl: "http://localhost:5125",
      authToken: "test_token",
      autoSyncOnSave: false,
    },
    manifest: {
      dir: ".obsidian/plugins/obsidian-sync-ai",
    },
  };

  return { app, plugin, fileStore, diskStore };
}

test("SyncManager - recordLocalRename marks old path as tombstone and untombstones new path", async () => {
  const { app, plugin, fileStore } = createMockAppAndPlugin();
  const manager = new SyncManager(app, plugin);

  const oldPath = "Notes/OldName.md";
  const newPath = "Notes/NewName.md";

  fileStore.set(newPath, new TFile(newPath, "Hello"));

  manager.recordLocalRename(oldPath, newPath);

  // Access private localTombstones via reflected inspect or serializing
  await manager.saveSyncState();
  const savedStateRaw = await app.vault.adapter.read(".obsidian/plugins/obsidian-sync-ai/.sync-state.json");
  const savedState = JSON.parse(savedStateRaw);

  assert.ok(savedState.tombstones.includes(oldPath), "Old path must be in tombstones");
  assert.ok(!savedState.tombstones.includes(newPath), "New path must NOT be in tombstones");
});

test("SyncManager - recordLocalFolderRename marks all nested child paths as tombstones", async () => {
  const { app, plugin, fileStore } = createMockAppAndPlugin();
  const manager = new SyncManager(app, plugin);

  // User moved folder 'Projects/Alpha' to 'Archive/Alpha'
  const newFile1 = "Archive/Alpha/Overview.md";
  const newFile2 = "Archive/Alpha/Docs/Spec.md";

  fileStore.set(newFile1, new TFile(newFile1, "Overview content"));
  fileStore.set(newFile2, new TFile(newFile2, "Spec content"));

  manager.recordLocalFolderRename("Projects/Alpha", "Archive/Alpha");

  await manager.saveSyncState();
  const savedStateRaw = await app.vault.adapter.read(".obsidian/plugins/obsidian-sync-ai/.sync-state.json");
  const savedState = JSON.parse(savedStateRaw);

  assert.ok(savedState.tombstones.includes("Projects/Alpha/Overview.md"), "Old nested file 1 must be tombstoned");
  assert.ok(savedState.tombstones.includes("Projects/Alpha/Docs/Spec.md"), "Old nested file 2 must be tombstoned");
  assert.ok(!savedState.tombstones.includes(newFile1), "New nested file 1 must NOT be tombstoned");
  assert.ok(!savedState.tombstones.includes(newFile2), "New nested file 2 must NOT be tombstoned");
});

test("SyncManager - recordLocalFolderDeletion tombstones cached files under folder prefix", async () => {
  const { app, plugin, fileStore, diskStore } = createMockAppAndPlugin();

  // Populate lastSyncedFiles with files in 'Drafts/'
  diskStore.set(
    ".obsidian/plugins/obsidian-sync-ai/.sync-state.json",
    JSON.stringify({
      tombstones: [],
      lastSyncedFiles: {
        "Drafts/Idea1.md": "hash1",
        "Drafts/Idea2.md": "hash2",
        "Keep/Note.md": "hash3",
      },
    })
  );

  // Keep/Note.md actively exists in vault
  fileStore.set("Keep/Note.md", new TFile("Keep/Note.md", "Keep"));

  const manager = new SyncManager(app, plugin);
  await manager.loadSyncState();

  manager.recordLocalFolderDeletion("Drafts");

  await manager.saveSyncState();
  const savedStateRaw = await app.vault.adapter.read(".obsidian/plugins/obsidian-sync-ai/.sync-state.json");
  const savedState = JSON.parse(savedStateRaw);

  assert.ok(savedState.tombstones.includes("Drafts/Idea1.md"));
  assert.ok(savedState.tombstones.includes("Drafts/Idea2.md"));
  assert.ok(!savedState.tombstones.includes("Keep/Note.md"));
});

test("SyncManager - loadSyncState reconciles offline moved/deleted files and sanitizes active files", async () => {
  const { app, plugin, fileStore, diskStore } = createMockAppAndPlugin();

  // Active file exists in vault
  fileStore.set("Active.md", new TFile("Active.md", "Active"));

  // State on disk has Active.md wrongly tombstoned, and Missing.md was tracked at last sync
  diskStore.set(
    ".obsidian/plugins/obsidian-sync-ai/.sync-state.json",
    JSON.stringify({
      tombstones: ["Active.md"],
      lastSyncedFiles: {
        "Active.md": "hash_active",
        "OfflineDeleted.md": "hash_missing",
      },
    })
  );

  const manager = new SyncManager(app, plugin);
  await manager.loadSyncState();

  await manager.saveSyncState();
  const savedStateRaw = await app.vault.adapter.read(".obsidian/plugins/obsidian-sync-ai/.sync-state.json");
  const savedState = JSON.parse(savedStateRaw);

  // Active file must have been sanitized and removed from tombstones
  assert.ok(!savedState.tombstones.includes("Active.md"), "Active file must not remain in tombstones");
  // OfflineDeleted file must have been reconciled and added to tombstones
  assert.ok(savedState.tombstones.includes("OfflineDeleted.md"), "Offline deleted file must be tombstoned");
});
