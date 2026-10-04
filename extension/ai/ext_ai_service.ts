/**
 * Browser Extension AI Service for Metadata, Streaming Text Correction, and Custom Prompts.
 * Consumes FastAPI SSE endpoints from the self-hosted Obsidian Sync & AI backend.
 */

export interface MetadataResult {
  title?: string;
  description?: string;
  tags?: string[];
}

export class ExtAiService {
  /**
   * Generates note title, summary description, and relevant tags using Gemini backend.
   */
  public static async generateMetadata(
    serverUrl: string,
    authToken: string,
    text: string
  ): Promise<MetadataResult> {
    if (!serverUrl || !authToken) {
      throw new Error("Server URL and Auth Token are required in extension settings.");
    }

    const response = await fetch(`${serverUrl}/api/ai/metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify({
        text,
        existingTags: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Metadata failed with HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Corrects and improves text via streaming SSE endpoint.
   */
  public static async streamEdit(
    serverUrl: string,
    authToken: string,
    text: string,
    prompt: string = "Fix grammar, spelling, and improve formatting",
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (!serverUrl || !authToken) {
      throw new Error("Server URL and Auth Token are required.");
    }

    const response = await fetch(`${serverUrl}/api/ai/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify({
        text,
        prompt,
        context: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Edit returned HTTP ${response.status}`);
    }

    return await this.consumeSseStream(response, onChunk);
  }

  /**
   * Executes custom user prompt with note / active tab context via streaming SSE endpoint.
   */
  public static async streamPrompt(
    serverUrl: string,
    authToken: string,
    prompt: string,
    context: string = "",
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (!serverUrl || !authToken) {
      throw new Error("Server URL and Auth Token are required.");
    }

    const response = await fetch(`${serverUrl}/api/ai/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Auth-Token": authToken,
      },
      body: JSON.stringify({
        prompt,
        context,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Prompt returned HTTP ${response.status}`);
    }

    return await this.consumeSseStream(response, onChunk);
  }

  /**
   * Helper to parse SSE streaming chunks from fetch ReadableStream.
   */
  private static async consumeSseStream(
    response: Response,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Unable to read streaming response from server.");
    }

    const decoder = new TextDecoder();
    let accumulatedText = "";
    let streamError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      const lines = chunkText.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              streamError = parsed.error;
              break;
            }
            if (parsed.chunk) {
              accumulatedText += parsed.chunk;
              if (onChunk) onChunk(parsed.chunk);
            }
          } catch {
            if (dataStr && !dataStr.startsWith("{")) {
              accumulatedText += dataStr;
              if (onChunk) onChunk(dataStr);
            }
          }
        }
      }

      if (streamError) break;
    }

    if (streamError) {
      throw new Error(streamError);
    }

    return accumulatedText;
  }
}
