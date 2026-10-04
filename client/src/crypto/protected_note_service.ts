import { App, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";
import { CryptoManager } from "./crypto_manager";
import { PasswordModal } from "../ui/password_modal";
import { EncryptedNoteView, VIEW_TYPE_ENCRYPTED_NOTE } from "../ui/encrypted_note_view";

export class ProtectedNoteService {
  private app: App;
  private plugin: ObsidianSyncAiPlugin;

  constructor(app: App, plugin: ObsidianSyncAiPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Checks if the given file has `encrypted: true` frontmatter or contains the protected note armored envelope.
   */
  public async isNoteEncrypted(file: TFile): Promise<boolean> {
    const fileCache = this.app.metadataCache.getFileCache(file);
    if (fileCache?.frontmatter && fileCache.frontmatter.encrypted === true) {
      return true;
    }

    try {
      const content = await this.app.vault.read(file);
      return CryptoManager.isProtectedContent(content);
    } catch {
      return false;
    }
  }

  /**
   * Prompts for password, decrypts the note, and opens it inside EncryptedNoteView.
   */
  public async promptAndUnlockNote(file: TFile): Promise<void> {
    const isEncrypted = await this.isNoteEncrypted(file);
    if (!isEncrypted) {
      new Notice("ℹ️ This note is not protected.");
      return;
    }

    new PasswordModal(this.app, {
      title: `🔓 Unlock "${file.basename}"`,
      submitLabel: "Unlock",
      onSubmit: async (password: string) => {
        try {
          const rawContent = await this.app.vault.read(file);
          const { body } = CryptoManager.splitFrontmatterAndBody(rawContent);

          if (!CryptoManager.isProtectedContent(body) && !CryptoManager.isProtectedContent(rawContent)) {
            throw new Error("No encrypted payload found in note body.");
          }

          const targetArmor = CryptoManager.isProtectedContent(body) ? body : rawContent;
          const decryptedText = await CryptoManager.decrypt(targetArmor, password);

          new Notice("✅ Note unlocked successfully.");

          // Open custom tab/leaf with buffer collision prevention
          let leaf: WorkspaceLeaf | null = null;
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ENCRYPTED_NOTE);
          if (leaves.length > 0) {
            leaf = leaves[0];
          } else {
            const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
            const fileMarkdownLeaf = markdownLeaves.find(
              (l) => (l.view as any)?.file?.path === file.path
            );
            leaf = fileMarkdownLeaf || this.app.workspace.getLeaf(false);
          }

          // Detach any remaining markdown leaves showing this file to prevent stale buffer overwrites
          for (const mLeaf of this.app.workspace.getLeavesOfType("markdown")) {
            if (mLeaf !== leaf && (mLeaf.view as any)?.file?.path === file.path) {
              mLeaf.detach();
            }
          }

          await leaf.setViewState({
            type: VIEW_TYPE_ENCRYPTED_NOTE,
            active: true,
          });

          const view = leaf.view as EncryptedNoteView;
          view.setNoteData(file, decryptedText, password);
          this.app.workspace.setActiveLeaf(leaf, { focus: true });

          return true;
        } catch (err: any) {
          throw new Error(err?.message || "Failed to unlock note.");
        }
      },
    }).open();
  }

  /**
   * Prompts to set a password with confirmation, encrypts the note, and opens EncryptedNoteView.
   */
  public async promptAndEncryptNote(file: TFile): Promise<void> {
    const isAlreadyEncrypted = await this.isNoteEncrypted(file);
    if (isAlreadyEncrypted) {
      new Notice("⚠️ Note is already encrypted. Unlock it to edit or re-encrypt.");
      return;
    }

    new PasswordModal(this.app, {
      title: `🔒 Encrypt "${file.basename}"`,
      submitLabel: "Encrypt & Protect",
      isConfirmationRequired: true,
      onSubmit: async (password: string) => {
        try {
          const rawContent = await this.app.vault.read(file);
          const { frontmatterLines, body } = CryptoManager.splitFrontmatterAndBody(rawContent);

          const encryptedArmor = await CryptoManager.encrypt(body, password);
          const formattedNote = CryptoManager.formatNote(frontmatterLines, encryptedArmor, true);

          await this.app.vault.modify(file, formattedNote);
          new Notice("🔒 Note encrypted and saved to disk.");

          // Automatically open in EncryptedNoteView for seamless editing
          let leaf: WorkspaceLeaf | null = null;
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ENCRYPTED_NOTE);
          if (leaves.length > 0) {
            leaf = leaves[0];
          } else {
            const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
            const fileMarkdownLeaf = markdownLeaves.find(
              (l) => (l.view as any)?.file?.path === file.path
            );
            leaf = fileMarkdownLeaf || this.app.workspace.getLeaf(false);
          }

          // Detach any remaining markdown leaves showing this file to prevent buffer collisions
          for (const mLeaf of this.app.workspace.getLeavesOfType("markdown")) {
            if (mLeaf !== leaf && (mLeaf.view as any)?.file?.path === file.path) {
              mLeaf.detach();
            }
          }

          await leaf.setViewState({
            type: VIEW_TYPE_ENCRYPTED_NOTE,
            active: true,
          });

          const view = leaf.view as EncryptedNoteView;
          view.setNoteData(file, body, password);
          this.app.workspace.setActiveLeaf(leaf, { focus: true });

          return true;
        } catch (err: any) {
          throw new Error(err?.message || "Failed to encrypt note.");
        }
      },
    }).open();
  }

  /**
   * Creates a new protected note by prompting for a filename and password,
   * then creating an encrypted file and opening it.
   */
  public async createProtectedNote(): Promise<void> {
    // Generate a default untitled filename
    let defaultName = "Untitled Protected Note";
    let index = 1;
    let newPath = `${defaultName}.md`;
    while (this.app.vault.getAbstractFileByPath(newPath)) {
      newPath = `${defaultName} ${index}.md`;
      index++;
    }

    new PasswordModal(this.app, {
      title: `🔒 Create Protected Note`,
      submitLabel: "Set Password & Create",
      isConfirmationRequired: true,
      onSubmit: async (password: string) => {
        try {
          const body = "";
          const frontmatterLines = ["---", "encrypted: true", "---"];
          const encryptedArmor = await CryptoManager.encrypt(body, password);
          const formattedNote = CryptoManager.formatNote(frontmatterLines, encryptedArmor, true);

          const newFile = await this.app.vault.create(newPath, formattedNote);
          new Notice(`🔒 Created ${newFile.basename} successfully.`);

          // Open in EncryptedNoteView
          let leaf: WorkspaceLeaf | null = null;
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ENCRYPTED_NOTE);
          if (leaves.length > 0) {
            leaf = leaves[0];
          } else {
            leaf = this.app.workspace.getLeaf(false);
          }

          await leaf.setViewState({
            type: VIEW_TYPE_ENCRYPTED_NOTE,
            active: true,
          });

          const view = leaf.view as EncryptedNoteView;
          view.setNoteData(newFile, body, password);
          this.app.workspace.setActiveLeaf(leaf, { focus: true });

          return true;
        } catch (err: any) {
          throw new Error(err?.message || "Failed to create protected note.");
        }
      },
    }).open();
  }
}
