# Codex Setup Guide

This repository is a local WeChat Official Account article editor.

When a user asks Codex to install or start this project, do the following without requiring the user to know Git or GitHub:

Assume the user may only know this repository URL and may not understand GitHub, git, Node.js, pnpm, APIs, or skills. Do not ask them to choose an installation method. Make the decisions yourself from the local machine state, run the setup, and report only the final URL or the concrete prerequisite they must install.

If the user says a sentence like this, treat it as a full install-and-start request:

```text
请从 https://github.com/hi-wayne/wx-edit 下载公众号AI心流写作台，自动完成安装和启动。不要问我 GitHub、git、Node.js、pnpm 或 skill 是什么；请你自己检查电脑环境，能用 git 就用 git，不能用 git 就下载 ZIP，缺 Node.js 就指导我安装 Node.js 20+，最后告诉我打开哪个本地网址使用。
```

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

2. Ensure Node.js 20+ is available.

   Check first:

   ```bash
   node -v
   ```

   If Node.js is missing or older than 20, install Node.js 20+ before running the project. Use the safest available method for the user's machine:

   - macOS with Homebrew: `brew install node@20` or `brew install node`
   - Windows with winget: `winget install OpenJS.NodeJS.LTS`
   - Otherwise, direct the user to install Node.js LTS from `https://nodejs.org/`

   After installing Node.js, continue with the bootstrap script.

3. Run the bootstrap script:

   ```bash
   bash scripts/bootstrap.sh
   ```

4. Tell the user to open:

   ```text
   http://localhost:3000/
   ```

Notes:

- The default AI path uses the user's local Codex login through `codex exec`; no OpenAI API key is required for text editing.
- A GitHub account is not required for this public repository. If `git` is missing, use the ZIP download path.
- The only required runtime prerequisite is Node.js 20+. `bootstrap.sh` handles pnpm through corepack when possible.
- If `codex login` has not been completed, ask the user to run it once in Codex or the terminal.
- The project installs its own `wx-article` Codex skill. It does not install Codex's built-in `imagegen` skill, because that comes from the user's Codex app/runtime.
- Do not ask normal Codex subscribers for an OpenAI API key when they choose `请求 Codex 生图`. Check whether the active Codex session has the `imagegen` skill. If it does, process `.wx-editor/image-request.json` with that skill, save the generated asset under `.wx-editor/assets/`, and insert it into the article.
- If `imagegen` is unavailable in the user's Codex build, explain that text AI still works, and ask the user to update/restart Codex. Direct server-side GPT Image generation is only available when the user intentionally configures `WX_IMAGE_PROVIDER=openai-api` and `OPENAI_API_KEY`.
- Runtime article state lives in `.wx-editor/` and should not be committed.
