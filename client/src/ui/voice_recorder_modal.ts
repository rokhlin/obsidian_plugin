import { App, Modal, Notice, Editor } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";

export class VoiceRecorderModal extends Modal {
  private plugin: ObsidianSyncAiPlugin;
  private editor: Editor;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private timerInterval: number | null = null;
  private secondsElapsed = 0;
  private statusEl!: HTMLElement;
  private actionBtn!: HTMLButtonElement;

  constructor(app: App, plugin: ObsidianSyncAiPlugin, editor: Editor) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("obsidian-sync-ai-voice-modal");

    contentEl.createEl("h3", { text: "🎙️ Voice Note Transcription" });
    this.statusEl = contentEl.createEl("p", {
      text: "Tap 'Start Recording' and speak clearly into your microphone.",
    });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    this.actionBtn = buttonContainer.createEl("button", {
      text: "Start Recording",
      cls: "mod-cta",
    });

    this.actionBtn.onclick = () => {
      if (!this.isRecording) {
        this.startRecording();
      } else {
        this.stopRecording();
      }
    };

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => {
      this.cleanup();
      this.close();
    };
  }

  private async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.cleanupStream(stream);
        await this.handleAudioRecorded(mimeType);
      };

      this.mediaRecorder.start(250);
      this.isRecording = true;
      this.secondsElapsed = 0;
      this.actionBtn.setText("⏹️ Stop & Transcribe");
      this.actionBtn.removeClass("mod-cta");
      this.actionBtn.addClass("mod-warning");

      this.timerInterval = window.setInterval(() => {
        this.secondsElapsed++;
        this.statusEl.setText(`🔴 Recording in progress: ${this.secondsElapsed}s`);
      }, 1000);
    } catch (err: any) {
      new Notice(`Microphone error: ${err.message || err}`);
      this.statusEl.setText("❌ Failed to access microphone.");
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.actionBtn.setDisabled(true);
      this.statusEl.setText("⏳ Transcribing audio via backend...");
    }
  }

  private async handleAudioRecorded(mimeType: string): Promise<void> {
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const filename = `recording_${Date.now()}.${ext}`;

    try {
      const transcribedText = await this.plugin.aiService.transcribeAudio(audioBlob, filename);
      if (transcribedText) {
        this.editor.replaceRange(`\n${transcribedText}\n`, this.editor.getCursor());
        new Notice("✅ Voice note transcribed and inserted at cursor!");
      }
      this.close();
    } catch (err: any) {
      new Notice(`❌ Transcription failed: ${err.message || err}`);
      this.statusEl.setText(`Error: ${err.message || err}`);
      this.actionBtn.setDisabled(false);
      this.actionBtn.setText("Try Again");
    }
  }

  private cleanupStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop());
  }

  private cleanup(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  onClose(): void {
    this.cleanup();
    this.contentEl.empty();
  }
}
