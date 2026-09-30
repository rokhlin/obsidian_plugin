import { App, Modal, Setting, ButtonComponent } from "obsidian";

export interface PasswordModalOptions {
  title: string;
  submitLabel: string;
  isConfirmationRequired?: boolean;
  onSubmit: (password: string) => Promise<boolean | void>;
}

export class PasswordModal extends Modal {
  private options: PasswordModalOptions;
  private password = "";
  private confirmPassword = "";
  private errorEl: HTMLElement | null = null;
  private isSubmitting = false;

  constructor(app: App, options: PasswordModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("encrypted-note-password-modal");

    contentEl.createEl("h3", { text: this.options.title });

    // Primary Password Input
    let passwordInputEl: HTMLInputElement | null = null;
    new Setting(contentEl)
      .setName("Password")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("Enter passphrase...");
        text.onChange((val) => {
          this.password = val;
          this.clearError();
        });
        passwordInputEl = text.inputEl;
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter" && !this.options.isConfirmationRequired) {
            e.preventDefault();
            this.handleSubmit();
          }
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon("eye")
          .setTooltip("Toggle password visibility")
          .onClick(() => {
            if (passwordInputEl) {
              const currentType = passwordInputEl.type;
              passwordInputEl.type = currentType === "password" ? "text" : "password";
              btn.setIcon(passwordInputEl.type === "password" ? "eye" : "eye-off");
            }
          });
      });

    // Optional Confirm Password Input (for encrypting new notes)
    if (this.options.isConfirmationRequired) {
      new Setting(contentEl)
        .setName("Confirm Password")
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder("Re-enter passphrase...");
          text.onChange((val) => {
            this.confirmPassword = val;
            this.clearError();
          });
          text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              this.handleSubmit();
            }
          });
        });
    }

    // Error Message Container
    this.errorEl = contentEl.createDiv({ cls: "password-modal-error" });
    this.errorEl.style.color = "var(--text-error)";
    this.errorEl.style.fontSize = "0.85em";
    this.errorEl.style.minHeight = "20px";
    this.errorEl.style.marginTop = "8px";

    // Actions Button Bar
    const buttonBar = contentEl.createDiv({ cls: "modal-button-container" });
    buttonBar.style.display = "flex";
    buttonBar.style.justifyContent = "flex-end";
    buttonBar.style.gap = "8px";
    buttonBar.style.marginTop = "16px";

    const cancelBtn = new ButtonComponent(buttonBar)
      .setButtonText("Cancel")
      .onClick(() => this.close());

    const submitBtn = new ButtonComponent(buttonBar)
      .setButtonText(this.options.submitLabel)
      .setCta()
      .onClick(() => this.handleSubmit());

    setTimeout(() => {
      if (passwordInputEl) {
        passwordInputEl.focus();
      }
    }, 100);
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting) return;

    if (!this.password || this.password.trim().length === 0) {
      this.showError("Please enter a password.");
      return;
    }

    if (this.options.isConfirmationRequired) {
      if (this.password !== this.confirmPassword) {
        this.showError("Passwords do not match.");
        return;
      }
      if (this.password.length < 4) {
        this.showError("Password should be at least 4 characters.");
        return;
      }
    }

    this.isSubmitting = true;
    this.clearError();

    try {
      const result = await this.options.onSubmit(this.password);
      if (result !== false) {
        this.close();
      }
    } catch (err: any) {
      this.showError(err?.message || "Operation failed.");
    } finally {
      this.isSubmitting = false;
    }
  }

  private showError(msg: string): void {
    if (this.errorEl) {
      this.errorEl.setText(msg);
    }
  }

  private clearError(): void {
    if (this.errorEl) {
      this.errorEl.setText("");
    }
  }
}
