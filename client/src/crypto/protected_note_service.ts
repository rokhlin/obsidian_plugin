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

          // Open custom tab/leaf
          let leaf: WorkspaceLeaf | null = null;
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ENCRYPTED_NOTE);
          if (leaves.length > 0) {
            leaf = leaves[0];
          } else {
            leaf = this.app.workspace.getLeaf(true);
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
            leaf = this.app.workspace.getLeaf(true);
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
}
