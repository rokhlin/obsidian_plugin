/**
 * Zero-Knowledge Cryptographic Manager for Protected Notes
 * Implements AES-256-GCM authenticated encryption and PBKDF2 key derivation using the native Web Crypto API.
 */

const ARMOR_HEADER = "-----BEGIN PROTECTED NOTE-----";
const ARMOR_FOOTER = "-----END PROTECTED NOTE-----";
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedPayload {
  salt: string; // Base64
  iv: string;   // Base64
  ciphertext: string; // Base64
}

export class CryptoManager {
  private static textEncoder = new TextEncoder();
  private static textDecoder = new TextDecoder();

  /**
   * Encrypts plaintext using AES-256-GCM with a PBKDF2 derived key and returns an armored envelope.
   */
  public static async encrypt(plainText: string, password: string): Promise<string> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty.");
    }

    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);

    const derivedKey = await this.deriveKey(password, salt, ["encrypt"]);

    const encodedPlaintext = this.textEncoder.encode(plainText);
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      derivedKey,
      encodedPlaintext
    );

    const saltB64 = this.arrayBufferToBase64(salt.buffer);
    const ivB64 = this.arrayBufferToBase64(iv.buffer);
    const ciphertextB64 = this.arrayBufferToBase64(encryptedBuffer);

    return this.serializeArmoredEnvelope(saltB64, ivB64, ciphertextB64);
  }

  /**
   * Decrypts an armored envelope using the provided password.
   * Throws an error if the password is incorrect or the envelope is corrupted.
   */
  public static async decrypt(armoredPayload: string, password: string): Promise<string> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty.");
    }

    const parsed = this.parseArmoredEnvelope(armoredPayload);
    if (!parsed) {
      throw new Error("Invalid or unarmored protected note format.");
    }

    const salt = new Uint8Array(this.base64ToArrayBuffer(parsed.salt));
    const iv = new Uint8Array(this.base64ToArrayBuffer(parsed.iv));
    const ciphertext = this.base64ToArrayBuffer(parsed.ciphertext);

    const derivedKey = await this.deriveKey(password, salt, ["decrypt"]);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        derivedKey,
        ciphertext
      );
      return this.textDecoder.decode(decryptedBuffer);
    } catch {
      throw new Error("Incorrect password or corrupted note content.");
    }
  }

  /**
   * Checks whether the given text contains a valid protected note armored envelope.
   */
  public static isProtectedContent(content: string): boolean {
    return content.includes(ARMOR_HEADER) && content.includes(ARMOR_FOOTER);
  }

  /**
   * Serializes salt, IV, and ciphertext into standard ASCII-armored format.
   */
  public static serializeArmoredEnvelope(saltB64: string, ivB64: string, ciphertextB64: string): string {
    return `${ARMOR_HEADER}\nSalt: ${saltB64}\nIV: ${ivB64}\n\n${ciphertextB64}\n${ARMOR_FOOTER}`;
  }

  /**
   * Parses an armored envelope and extracts Salt, IV, and Ciphertext.
   */
  public static parseArmoredEnvelope(content: string): EncryptedPayload | null {
    const startIndex = content.indexOf(ARMOR_HEADER);
    const endIndex = content.indexOf(ARMOR_FOOTER);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return null;
    }

    const body = content.substring(startIndex + ARMOR_HEADER.length, endIndex).trim();
    const lines = body.split("\n");

    let salt = "";
    let iv = "";
    let payloadStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("Salt:")) {
        salt = line.substring(5).trim();
      } else if (line.startsWith("IV:")) {
        iv = line.substring(3).trim();
      } else if (line.length === 0 && salt && iv) {
        payloadStartIndex = i + 1;
        break;
      }
    }

    if (!salt || !iv || payloadStartIndex === -1) {
      return null;
    }

    const ciphertext = lines.slice(payloadStartIndex).join("").trim();
    if (!ciphertext) {
      return null;
    }

    return { salt, iv, ciphertext };
  }

  /**
   * Splits a file into YAML frontmatter string and body text.
   */
  public static splitFrontmatterAndBody(fileContent: string): {
    hasFrontmatter: boolean;
    frontmatterLines: string[];
    body: string;
  } {
    if (!fileContent.startsWith("---")) {
      return { hasFrontmatter: false, frontmatterLines: [], body: fileContent };
    }

    const lines = fileContent.split("\n");
    let closingIndex = -1;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex === -1) {
      return { hasFrontmatter: false, frontmatterLines: [], body: fileContent };
    }

    const frontmatterLines = lines.slice(1, closingIndex);
    const body = lines.slice(closingIndex + 1).join("\n").trim();

    return {
      hasFrontmatter: true,
      frontmatterLines,
      body,
    };
  }

  /**
   * Recombines frontmatter lines and body into full note text, adding or removing `encrypted: true`.
   */
  public static formatNote(frontmatterLines: string[], body: string, setEncrypted: boolean): string {
    const filteredLines = frontmatterLines.filter(
      (line) => !line.trim().startsWith("encrypted:")
    );

    if (setEncrypted) {
      filteredLines.unshift("encrypted: true");
    }

    if (filteredLines.length === 0) {
      return body;
    }

    return `---\n${filteredLines.join("\n")}\n---\n\n${body}\n`;
  }

  /**
   * Derives a 256-bit AES-GCM CryptoKey using PBKDF2 with SHA-256.
   */
  private static async deriveKey(
    password: string,
    salt: Uint8Array,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    const rawKey = this.textEncoder.encode(password);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      keyUsages
    );
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
