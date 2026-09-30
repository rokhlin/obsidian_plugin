# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Protected & Encrypted Notes Subsystem**:
  - Zero-knowledge client-side encryption using native Web Crypto API (`AES-256-GCM` + `PBKDF2-HMAC-SHA256` with 100,000 iterations).
  - Frontmatter metadata flag (`encrypted: true`) preserving note titles and tags while encrypting note body.
  - Dedicated custom in-memory editor view (`EncryptedNoteView`) ensuring decrypted text is never written to disk or temporary cache files by Obsidian's auto-save.
  - Inactivity auto-lock timer (5 minutes) and app minimization lock handler (`visibilitychange`) clearing volatile memory buffers.
  - Touch-friendly `PasswordModal` with show/hide toggle and password confirmation.
  - Mobile action bar integration in `MobileActionModal` and commands (`🔒 Encrypt Current Note`, `🔓 Unlock Protected Note`).
  - Action to permanently remove password encryption (`🔓 Remove Password`) restoring regular Markdown files.
  - Automated unit test suite verifying cryptographic integrity and tamper detection.
