#!/usr/bin/env node

/**
 * Automated Release Orchestration Script for Obsidian Plugin Monorepo.
 *
 * Usage:
 *   node scripts/prepare_release.mjs [patch|minor|major|<explicit-version>] [--no-push] [--dry-run]
 *
 * Examples:
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release 1.3.0
 *   npm run release patch -- --no-push
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const noPush = args.includes('--no-push');
const versionArg = args.find(a => !a.startsWith('--')) || 'patch';

function run(cmd, options = {}) {
  console.log(`\x1b[36m▶ ${cmd}\x1b[0m`);
  if (!isDryRun) {
    return execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...options });
  }
}

// 1. Read current version from client/package.json
const clientPkgPath = path.join(rootDir, 'client', 'package.json');
const clientPkg = JSON.parse(fs.readFileSync(clientPkgPath, 'utf8'));
const currentVersion = clientPkg.version || '1.0.0';

// 2. Compute target version
function bump(version, type) {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Cannot parse semantic version: ${version}`);
  }
  let [major, minor, patch] = parts;
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  return type.replace(/^v/, '');
}

const targetVersion = bump(currentVersion, versionArg);
console.log(`\n\x1b[32m🚀 Preparing Release: v${currentVersion} ➔ v${targetVersion}\x1b[0m\n`);

if (targetVersion === currentVersion) {
  console.error(`\x1b[31mError: Target version v${targetVersion} is identical to current version v${currentVersion}\x1b[0m`);
  process.exit(1);
}

// 3. Update files with new version
const filesToUpdate = [
  { path: 'package.json' },
  { path: 'client/package.json' },
  { path: 'client/manifest.json' },
  { path: 'extension/package.json' },
  { path: 'extension/manifest.json' },
];

for (const file of filesToUpdate) {
  const fullPath = path.join(rootDir, file.path);
  if (fs.existsSync(fullPath)) {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    data.version = targetVersion;
    if (!isDryRun) {
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
    console.log(`  ✓ Updated ${file.path} ➔ ${targetVersion}`);
  }
}

// 4. Update docs/Changelog.md
const changelogPath = path.join(rootDir, 'docs', 'Changelog.md');
if (fs.existsSync(changelogPath)) {
  let changelog = fs.readFileSync(changelogPath, 'utf8');
  const today = new Date().toISOString().split('T')[0];
  const versionHeader = `## [${targetVersion}] - ${today}`;

  if (!changelog.includes(`## [${targetVersion}]`)) {
    const unreleasedRegex = /##\s*\[Unreleased\]\s*\n([\s\S]*?)(?=\n##\s*\[|\Z)/i;
    const match = changelog.match(unreleasedRegex);
    const unreleasedNotes = match ? match[1].trim() : '';

    if (unreleasedNotes) {
      changelog = changelog.replace(
        unreleasedRegex,
        `## [Unreleased]\n\n${versionHeader}\n\n${unreleasedNotes}\n`
      );
      console.log(`  ✓ Transformed [Unreleased] into ${versionHeader} in docs/Changelog.md`);
    } else {
      changelog = changelog.replace(
        /##\s*\[Unreleased\]/i,
        `## [Unreleased]\n\n${versionHeader}\n\n### Added\n- Release v${targetVersion}\n`
      );
      console.log(`  ✓ Added ${versionHeader} template to docs/Changelog.md`);
    }

    if (!isDryRun) {
      fs.writeFileSync(changelogPath, changelog, 'utf8');
    }
  } else {
    console.log(`  ✓ Section for v${targetVersion} already exists in docs/Changelog.md`);
  }
}

// 5. Build all packages
console.log('\n📦 Building client and web extension bundles...');
run('npm run build');

// 6. Run automated test suite
console.log('\n🧪 Running test suite...');
run('npm test');

// 7. Git commit, tag, and push
const tag = `v${targetVersion}`;
console.log(`\n🏷️ Committing and creating Git tag ${tag}...`);

run('git add package.json client/package.json client/manifest.json extension/package.json extension/manifest.json docs/Changelog.md client/styles.css extension/popup.js extension/background.js');

try {
  run(`git commit -m "chore(release): bump version to ${targetVersion}"`);
} catch (e) {
  console.log('Note: Working tree already clean or commit already made.');
}

run(`git tag -a ${tag} -m "Release ${tag}"`);

if (noPush || isDryRun) {
  console.log(`\n\x1b[33m⏸️ Release prepared locally. To publish, push master and the tag:\x1b[0m`);
  console.log(`  git push origin master`);
  console.log(`  git push origin ${tag}`);
} else {
  console.log(`\n🚀 Pushing commit and tag to origin to trigger GitHub Actions release...`);
  run('git push origin master');
  run(`git push origin ${tag}`);
  console.log(`\n\x1b[32m✨ Release ${tag} initiated successfully!\x1b[0m`);
  console.log(`GitHub Actions workflow is now building and publishing the release with docs/Changelog.md notes.`);
}
