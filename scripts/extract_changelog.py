#!/usr/bin/env python3
"""
Extract release notes for a given version from docs/Changelog.md.
Usage: python scripts/extract_changelog.py <version> [output_file]
Example: python scripts/extract_changelog.py 1.2.0 RELEASE_NOTES.md
"""
import sys
import os
import re

def extract_changelog(version: str, changelog_path: str = "docs/Changelog.md") -> str:
    clean_version = version.lstrip("v").strip()
    
    if not os.path.exists(changelog_path):
        return f"Release notes for {version}\n"
    
    with open(changelog_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Match ## [1.2.0] or ## [v1.2.0] or ## 1.2.0 until next version header or EOF
    pattern = rf"##\s*\[?v?{re.escape(clean_version)}\]?[^\n]*\n(.*?)(?=\n##\s*\[|\n##\s+v?\d|\Z)"
    match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
    
    if match:
        notes = match.group(1).strip()
        if notes:
            return notes
            
    # Fallback to Unreleased section if version not explicitly found
    unreleased_pattern = r"##\s*\[Unreleased\][^\n]*\n(.*?)(?=\n##\s*\[|\n##\s+v?\d|\Z)"
    unreleased_match = re.search(unreleased_pattern, content, re.DOTALL | re.IGNORECASE)
    if unreleased_match:
        notes = unreleased_match.group(1).strip()
        if notes:
            return f"### Changes\n\n{notes}"
            
    return f"Release {version}\n"

def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_changelog.py <version> [output_file]")
        sys.exit(1)
        
    version = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "RELEASE_NOTES.md"
    changelog_path = "docs/Changelog.md"
    
    notes = extract_changelog(version, changelog_path)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(notes + "\n")
    print(f"Extracted {len(notes.splitlines())} lines of release notes for version {version} into {output_file}")

if __name__ == "__main__":
    main()
