import test from "node:test";
import assert from "node:assert/strict";
import { CryptoManager } from "../client_crypto_test_bundle.js";
import { ExtCrypto } from "../extension_crypto_test_bundle.js";

test("Cross-Platform Interoperability: Android/Windows -> Extension", async () => {
  const noteContent = "# Cross-Platform Confidential Note\n\nEncrypted in Obsidian Desktop/Mobile and decrypted in Browser Extension.\n- Seed: alpha bravo charlie\n- Token: secret_xyz_9981";
  const passphrase = "MasterPassphrase!2026";

  // 1. Encrypt with CryptoManager (Android/Windows Electron)
  const encryptedOnDesktop = await CryptoManager.encrypt(noteContent, passphrase);
  assert.ok(CryptoManager.isProtectedContent(encryptedOnDesktop));
  assert.ok(ExtCrypto.isProtectedContent(encryptedOnDesktop));

  // 2. Decrypt with ExtCrypto (Browser Extension)
  const decryptedInExtension = await ExtCrypto.decrypt(encryptedOnDesktop, passphrase);
  assert.equal(decryptedInExtension, noteContent);
});

test("Cross-Platform Interoperability: Extension -> Android/Windows", async () => {
  const noteContent = "# Web Extension Captured Note\n\nCreated and encrypted inside Chrome Extension popup, to be opened in Obsidian.\n- Balance: $14,250.00\n- Status: Secured";
  const passphrase = "UniqueBrowserPassphrase#77";

  // 1. Encrypt with ExtCrypto (Browser Extension)
  const encryptedInExtension = await ExtCrypto.encrypt(noteContent, passphrase);
  assert.ok(ExtCrypto.isProtectedContent(encryptedInExtension));
  assert.ok(CryptoManager.isProtectedContent(encryptedInExtension));

  // 2. Decrypt with CryptoManager (Android/Windows Electron)
  const decryptedOnDesktop = await CryptoManager.decrypt(encryptedInExtension, passphrase);
  assert.equal(decryptedOnDesktop, noteContent);
});

test("Cross-Platform Rejection on Incorrect Password", async () => {
  const secret = "Zero-Knowledge Interoperability";
  const pass = "CorrectPassword123";
  const wrongPass = "WrongPassword321";

  const encrypted = await ExtCrypto.encrypt(secret, pass);

  await assert.rejects(
    async () => {
      await CryptoManager.decrypt(encrypted, wrongPass);
    },
    {
      message: "Incorrect password or corrupted note content.",
    }
  );

  const encryptedDesktop = await CryptoManager.encrypt(secret, pass);

  await assert.rejects(
    async () => {
      await ExtCrypto.decrypt(encryptedDesktop, wrongPass);
    },
    {
      message: "Incorrect password or corrupted note content.",
    }
  );
});

test("Cross-Platform AES-GCM Auth Tag Tamper Detection", async () => {
  const text = "Authenticated integrity test";
  const pass = "Pass123!";

  const encrypted = await ExtCrypto.encrypt(text, pass);
  const parsed = ExtCrypto.parseArmoredEnvelope(encrypted);
  assert.ok(parsed);

  // Tamper ciphertext
  const tamperedCiphertext = parsed.ciphertext.slice(0, -6) + "BBBBBB";
  const tamperedEnvelope = ExtCrypto.serializeArmoredEnvelope(parsed.salt, parsed.iv, tamperedCiphertext);

  await assert.rejects(
    async () => {
      await CryptoManager.decrypt(tamperedEnvelope, pass);
    },
    {
      message: "Incorrect password or corrupted note content.",
    }
  );
});

test("Cross-Platform Frontmatter & Armored Envelope Parsing Parity", () => {
  const rawNote = `---\ntitle: Encrypted Cross-Platform\ntags: [security, vault]\n---\n\n-----BEGIN PROTECTED NOTE-----\nSalt: c2FsdDEyMzQ1Njc4OWFiYw==\nIV: aXYxMjM0NTY3ODlh\n\nY2lwaGVydGV4dGF1dGh0YWc=\n-----END PROTECTED NOTE-----`;

  const parsedDesktop = CryptoManager.splitFrontmatterAndBody(rawNote);
  const parsedExtension = ExtCrypto.splitFrontmatterAndBody(rawNote);

  assert.deepEqual(parsedDesktop, parsedExtension);

  const envDesktop = CryptoManager.parseArmoredEnvelope(parsedDesktop.body);
  const envExtension = ExtCrypto.parseArmoredEnvelope(parsedExtension.body);

  assert.deepEqual(envDesktop, envExtension);
});
