#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> 公众号AI心流写作台 bootstrap"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 20+ first: https://nodejs.org/"
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required. Current version: $(node -v)"
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
