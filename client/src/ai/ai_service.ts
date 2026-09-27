import { App, Editor, Notice, TFile, requestUrl } from "obsidian";
import type ObsidianSyncAiPlugin from "../main";

export class AiService {
  private app: App;
  private plugin: ObsidianSyncAiPlugin;

  constructor(app: App, plugin: ObsidianSyncAiPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  public async generateMetadata(file: TFile): Promise<void> {
    const { serverUrl, authToken } = this.plugin.settings;
    if (!serverUrl || !authToken) {
      new Notice("⚠️ Please configure Server URL and Auth Token in settings.");
      return;
    }

    new Notice("🧠 Analyzing note and generating metadata...");
    try {
      const content = await this.app.vault.read(file);
      
      // Collect existing tags across vault
      const existingTagsSet = new Set<string>();
      const allFiles = this.app.vault.getMarkdownFiles();
      for (const f of allFiles) {
        const cache = this.app.metadataCache.getFileCache(f);
        if (cache?.tags) {
          cache.tags.forEach((t) => existingTagsSet.add(t.tag));
        }
      }

      const response = await requestUrl({
        url: `${serverUrl}/api/ai/metadata`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Auth-Token": authToken,
        },
        body: JSON.stringify({
          text: content,
          existingTags: Array.from(existingTagsSet).slice(0, 50),
        }),
      });

      if (response.status !== 200) {
        throw new Error(`AI Metadata returned HTTP ${response.status}`);
      }

      const { title, description, tags } = response.json;

      // Update YAML Frontmatter
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (title) frontmatter["title"] = title;
        if (description) frontmatter["description"] = description;
        if (Array.isArray(tags) && tags.length > 0) {
          const currentTags = Array.isArray(frontmatter["tags"]) ? frontmatter["tags"] : [];
          const merged = Array.from(new Set([...currentTags, ...tags.map((t: string) => t.replace(/^#/, ""))]));
          frontmatter["tags"] = merged;
        }
      });

      new Notice("✅ Frontmatter metadata generated successfully!");
    } catch (err: any) {
      console.error("AI Metadata error:", err);
      new Notice(`❌ Metadata error: ${err.message || err}`);
    }
  }

  public async correctSelectedText(editor: Editor, customInstructions?: string): Promise<void> {
    const { serverUrl, authToken } = this.plugin.settings;
    if (!serverUrl || !authToken) {
      new Notice("⚠️ Please configure Server URL and Auth Token in settings.");
      return;
    }

    const selectedText = editor.getSelection();
    if (!selectedText.trim()) {
      new Notice("⚠️ Please select some text in the editor first.");
      return;
    }

    new Notice("✨ Improving selected text...");
    try {
      const response = await fetch(`${serverUrl}/api/ai/edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Auth-Token": authToken,
        },
        body: JSON.stringify({
          text: selectedText,
          prompt: customInstructions || "Fix grammar and improve style",
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Edit returned HTTP ${response.status}`);
      }

      // Stream SSE chunks
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Unable to read response stream");
      }

      const decoder = new TextDecoder();
      let replacement = "";
      editor.replaceSelection(""); // clear selection and start streaming in place

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.chunk) {
                replacement += parsed.chunk;
                editor.replaceSelection(parsed.chunk);
              }
            } catch {
              // Non-JSON SSE string
            }
          }
        }
      }
      new Notice("✅ Text correction complete!");
    } catch (err: any) {
      console.error("AI Edit error:", err);
      new Notice(`❌ AI Edit error: ${err.message || err}`);
    }
  }

  public async promptWithContext(
    promptText: string,
    context: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const { serverUrl, authToken } = this.plugin.settings;
    if (!serverUrl || !authToken) {
      throw new Error("Please configure Server URL and Auth Token in settings.");
    }

    const response = await fetch(`${serverUrl}/api/ai/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify({
        prompt: promptText,
        context,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Prompt returned HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Unable to read response stream");

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.chunk) {
              onChunk(parsed.chunk);
            }
          } catch {
            // raw text fallback
          }
        }
      }
    }
  }

  public async transcribeAudio(audioBlob: Blob, filename: string): Promise<string> {
    const { serverUrl, authToken } = this.plugin.settings;
    if (!serverUrl || !authToken) {
      throw new Error("Please configure Server URL and Auth Token in settings.");
    }

    const formData = new FormData();
    formData.append("file", audioBlob, filename);

    const response = await fetch(`${serverUrl}/api/ai/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "X-Auth-Token": authToken,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Transcription returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.text || "";
  }
}
