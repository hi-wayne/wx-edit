# Codex Setup Guide

This repository is a local WeChat Official Account article editor.

When a user asks Codex to install or start this project, do the following without requiring the user to know Git or GitHub:

1. Download the repository if it is not already local.

   Prefer `git` when available:

   ```bash
   git clone https://github.com/hi-wayne/wx-edit.git
   cd wx-edit
   ```

   If `git` is not installed, download the public GitHub ZIP archive instead:

   ```bash
   mkdir -p wx-edit-download
   cd wx-edit-download
   curl -L https://github.com/hi-wayne/wx-edit/archive/refs/heads/main.zip -o wx-edit.zip
   unzip -q wx-edit.zip
   cd wx-edit-main
   ```

   If `curl` is missing but PowerShell is available, use:

   ```powershell
   mkdir wx-edit-download
   cd wx-edit-download
   Invoke-WebRequest -Uri https://github.com/hi-wayne/wx-edit/archive/refs/heads/main.zip -OutFile wx-edit.zip
   Expand-Archive wx-edit.zip -DestinationPath .
   cd wx-edit-main
   ```

2. Run the bootstrap script:

   ```bash
   bash scripts/bootstrap.sh
   ```

3. Tell the user to open:

   ```text
   http://localhost:3000/
   ```

Notes:

- The default AI path uses the user's local Codex login through `codex exec`; no OpenAI API key is required for text editing.
- If `codex login` has not been completed, ask the user to run it once in Codex or the terminal.
- The project installs its own `wx-article` Codex skill. It does not install Codex's built-in `imagegen` skill, because that comes from the user's Codex app/runtime.
- Do not ask normal Codex subscribers for an OpenAI API key when they choose `请求 Codex 生图`. Check whether the active Codex session has the `imagegen` skill. If it does, process `.wx-editor/image-request.json` with that skill, save the generated asset under `.wx-editor/assets/`, and insert it into the article.
- If `imagegen` is unavailable in the user's Codex build, explain that text AI and Wikimedia image search still work, and ask the user to update/restart Codex. Direct browser-side GPT Image generation is only available when the user intentionally configures `WX_IMAGE_PROVIDER=openai-api` and `OPENAI_API_KEY`.
- Runtime article state lives in `.wx-editor/` and should not be committed.
