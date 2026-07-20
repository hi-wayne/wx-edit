#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> 公众号AI心流写作台 bootstrap"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required before this local editor can run."
  echo "Ask Codex to install Node.js 20+ for this computer, or install Node.js LTS from:"
  echo "    https://nodejs.org/"
  echo "Then run this again:"
  echo "    bash scripts/bootstrap.sh"
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required. Current version: $(node -v)"
  echo "Ask Codex to upgrade Node.js to 20+, then run this again:"
  echo "    bash scripts/bootstrap.sh"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    echo "==> Enabling pnpm with corepack"
    corepack enable
    corepack prepare pnpm@10.33.0 --activate
  else
    echo "pnpm is required and corepack was not found. Please install pnpm first."
    exit 1
  fi
fi

echo "==> Installing dependencies"
pnpm install

echo "==> Installing wx-article Codex skill"
pnpm install:skill

if command -v codex >/dev/null 2>&1; then
  if ! codex doctor >/dev/null 2>&1; then
    echo "==> Codex is installed, but login may be missing."
    echo "Run this once if AI buttons cannot call Codex:"
    echo "    codex login"
  fi

  CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
  if [ -d "$CODEX_HOME/skills/.system/imagegen" ] || [ -d "$CODEX_HOME/skills/imagegen" ]; then
    echo "==> Codex imagegen skill found."
  else
    echo "==> Codex imagegen skill was not found."
    echo "The editor still works. Text AI does not need it."
    echo "For Codex-assisted AI image generation, update/restart Codex and use a build that includes the imagegen skill."
  fi
else
  echo "==> Codex CLI was not found in PATH."
  echo "Install/open Codex and log in before using AI buttons."
fi

echo "==> Starting local editor"
echo "Open this URL in your browser:"
echo "    http://localhost:3000/"
echo ""
echo "Press Ctrl+C here to stop the local service."

pnpm dev
