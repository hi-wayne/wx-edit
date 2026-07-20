#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
TARGET_DIR="$CODEX_HOME/skills/wx-article"

mkdir -p "$CODEX_HOME/skills"
rm -rf "$TARGET_DIR"
cp -R "$REPO_ROOT/skills/wx-article" "$TARGET_DIR"

echo "Installed wx-article skill to $TARGET_DIR"
echo "Restart Codex if it does not appear immediately."
