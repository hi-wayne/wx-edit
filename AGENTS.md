# Codex Setup Guide

This repository is a local WeChat Official Account article editor.

When a user asks Codex to install or start this project, do the following without requiring the user to know Git or GitHub:

1. Clone the repository if it is not already local:

   ```bash
   git clone https://github.com/hi-wayne/wx-edit.git
   cd wx-edit
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
- Image generation with OpenAI's image model requires `OPENAI_API_KEY`; without it, the editor searches Wikimedia Commons for real images and falls back to local placeholders.
- Runtime article state lives in `.wx-editor/` and should not be committed.
