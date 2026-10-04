# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-10-04

### Fixed
- **File Move / Rename Synchronization Duplication (BUG-003)**:
  - Registered Obsidian `vault.on("rename")` listener in `main.ts` to ensure moved or renamed notes are tracked and their former paths recorded as client tombstones (`deletedOnClient`).
  - Added recursive child file tombstone tracking for folder renames (`recordLocalFolderRename`) and folder deletions (`recordLocalFolderDeletion`).
  - Implemented persistent sync state (`.sync-state.json`) reconciling offline file moves and deletions across Obsidian restarts while sanitizing active vault files to prevent accidental deletions.
  - Resolved server-side resurrection glitch where moved notes were previously placed in `toDownload` and duplicated back to their original locations.
  - Enhanced backend `sync_server_filesystem_to_db` to prune ghost records from SQLite manifest when notes are moved or deleted directly on the server filesystem.

## [1.2.1] - 2026-10-04

## [1.2.0] - 2026-10-04

### Added
- **Cross-Platform Support (Windows Desktop & Browser Extension)**:
  - **Windows Desktop Client**: Configurable `enableCloudSync` toggle allowing direct local vault filesystem operation (bypassing network calls for OneDrive/Syncthing setups). Dynamic `file-menu` context menu and desktop button text labels in `EncryptedNoteView` (`Save & Encrypt`, `Lock Now`, `Remove Password`).
  - **Standalone Browser Extension (Manifest V3)**: Companion extension for Chromium/Firefox supporting quick note capture, AI metadata generation, text improvement, and custom AI prompt streaming.
  - **Extension Protected Notes Parity**:
Zero-knowledge AES-256-GCM encryption/decryption directly inside the browser popup with in-memory volatile isolation, auto-lock countdown, and Android parity controls (Save, Lock, Remove Password).
  - **Cross-Platform Crypto Interoperability**: Automated test suite (`test_cross_platform_crypto.mjs`) passing with 100% interoperability between Android, Windows Electron, and Chrome Web Extension.

- **Protected & Encrypted Notes Subsystem**:
  - Zero-knowledge client-side encryption using native Web Crypto API (`AES-256-GCM` + `PBKDF2-HMAC-SHA256` with 100,000 iterations).
  - Frontmatter metadata flag (`encrypted: true`) preserving note titles and tags while encrypting note body.
  - Dedicated custom in-memory editor view (`EncryptedNoteView`) ensuring decrypted text is never written to disk or temporary cache files by Obsidian's auto-save.
  - Inactivity auto-lock timer (5 minutes) and app minimization lock handler (`visibilitychange`) clearing volatile memory buffers.
  - Touch-friendly `PasswordModal` with show/hide toggle and password confirmation.
  - Mobile action bar integration in `MobileActionModal` and commands (`🔒 Encrypt Current Note`, `🔓 Unlock Protected Note`).
  - Action to permanently remove password encryption (`🔓 Remove Password`) restoring regular Markdown files.
  - Automated unit test suite verifying cryptographic integrity and tamper detection.
