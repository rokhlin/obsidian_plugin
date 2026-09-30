import test from "node:test";
import assert from "node:assert/strict";
import { CryptoManager } from "../client_crypto_test_bundle.js";

test("CryptoManager - Successful encryption and decryption round-trip", async () => {
  const secretText = "# Top Secret Note\n\nThis is private financial data and confidential notes.\n- Account: 123456\n- PIN: 9876";
  const password = "CorrectHorseBatteryStaple!2026";

  const encryptedArmored = await CryptoManager.encrypt(secretText, password);

  assert.ok(encryptedArmored.includes("-----BEGIN PROTECTED NOTE-----"));
  assert.ok(encryptedArmored.includes("-----END PROTECTED NOTE-----"));
  assert.ok(encryptedArmored.includes("Salt:"));
  assert.ok(encryptedArmored.includes("IV:"));
  assert.ok(!encryptedArmored.includes(secretText));

  const decryptedText = await CryptoManager.decrypt(encryptedArmored, password);
  assert.equal(decryptedText, secretText);
});

test("CryptoManager - Fails decryption with incorrect password", async () => {
  const secretText = "Confidential Journal Entry";
  const correctPassword = "CorrectPassword123";
  const wrongPassword = "WrongPassword456";

  const encryptedArmored = await CryptoManager.encrypt(secretText, correctPassword);

  await assert.rejects(
    async () => {
      await CryptoManager.decrypt(encryptedArmored, wrongPassword);
    },
    {
      message: "Incorrect password or corrupted note content.",
    }
  );
});

test("CryptoManager - Fails on tampered ciphertext (AES-GCM Auth Tag validation)", async () => {
  const secretText = "Tamper Detection Test";
  const password = "SecurePassword!";

  const encryptedArmored = await CryptoManager.encrypt(secretText, password);
  const parsed = CryptoManager.parseArmoredEnvelope(encryptedArmored);
  assert.ok(parsed);

  // Flip characters in the ciphertext
  const tamperedCiphertext = parsed.ciphertext.substring(0, parsed.ciphertext.length - 4) + "AAAA";
  const tamperedArmored = CryptoManager.serializeArmoredEnvelope(parsed.salt, parsed.iv, tamperedCiphertext);

  await assert.rejects(
    async () => {
      await CryptoManager.decrypt(tamperedArmored, password);
    },
    {
      message: "Incorrect password or corrupted note content.",
    }
  );
});

test("CryptoManager - Validates empty password", async () => {
  await assert.rejects(
    async () => {
      await CryptoManager.encrypt("text", "");
    },
    {
      message: "Password cannot be empty.",
    }
  );

  await assert.rejects(
    async () => {
      await CryptoManager.decrypt("some-envelope", "");
    },
    {
      message: "Password cannot be empty.",
    }
  );
});

test("CryptoManager - Armored envelope detection and parsing", () => {
  const validEnvelope = "-----BEGIN PROTECTED NOTE-----\nSalt: dGVzdHNhbHQ=\nIV: dGVzdGl2\n\ndGVzdGNpcGhlcg==\n-----END PROTECTED NOTE-----";
  assert.equal(CryptoManager.isProtectedContent(validEnvelope), true);

  const parsed = CryptoManager.parseArmoredEnvelope(validEnvelope);
  assert.ok(parsed);
  assert.equal(parsed.salt, "dGVzdHNhbHQ=");
  assert.equal(parsed.iv, "dGVzdGl2");
  assert.equal(parsed.ciphertext, "dGVzdGNpcGhlcg==");

  assert.equal(CryptoManager.isProtectedContent("Regular markdown note"), false);
  assert.equal(CryptoManager.parseArmoredEnvelope("Regular markdown note"), null);
});

test("CryptoManager - Frontmatter splitting and note formatting", () => {
  const sampleNote = `---\ntitle: My Private Note\ntags: [personal, secrets]\n---\n\nHere is the note body.`;

  const { hasFrontmatter, frontmatterLines, body } = CryptoManager.splitFrontmatterAndBody(sampleNote);
  assert.equal(hasFrontmatter, true);
  assert.deepEqual(frontmatterLines, ["title: My Private Note", "tags: [personal, secrets]"]);
  assert.equal(body, "Here is the note body.");

  // Format with encryption
  const encryptedFormatted = CryptoManager.formatNote(frontmatterLines, "ENCRYPTED_BODY", true);
  assert.ok(encryptedFormatted.includes("encrypted: true"));
  assert.ok(encryptedFormatted.includes("title: My Private Note"));
  assert.ok(encryptedFormatted.includes("ENCRYPTED_BODY"));

  // Format with decryption (remove encrypted: true)
  const decryptedFormatted = CryptoManager.formatNote(["encrypted: true", "title: My Private Note"], "PLAIN_BODY", false);
  assert.ok(!decryptedFormatted.includes("encrypted: true"));
  assert.ok(decryptedFormatted.includes("title: My Private Note"));
  assert.ok(decryptedFormatted.includes("PLAIN_BODY"));
});
