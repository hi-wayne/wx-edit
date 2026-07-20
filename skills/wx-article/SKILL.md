---
name: wx-article
description: Assist with WeChat Official Account article writing, editing, layout, preview, image planning, compatibility checks, and exporting WeChat-friendly HTML. Use when the user asks Codex to write, polish, typeset, review, preview, or prepare a 微信公众号/公众号 article, especially with the local wx-codex-editor browser preview.
---

# Wx Article

Use this skill to turn a user's draft, topic, outline, or browser selection request into a WeChat Official Account article that can be previewed locally and exported as WeChat-compatible HTML.

## Workflow

1. Locate the repository root and the editor state directory `.wx-editor`.
2. Read `.wx-editor/article.json` when the user is working with the local browser editor.
3. Read `.wx-editor/request.json` when the user says the browser submitted an AI request.
4. Read `.wx-editor/image-request.json` when the user says the browser submitted a Codex image generation request.
5. If the request includes `selectionTarget: "title"`, treat `selectedText` as a title selection and edit the `title` field only unless the instruction asks otherwise.
6. If the request includes `selectedText` and `selectedHtml` with `selectionTarget: "body"`, treat it as a precise selection inside the freeform article body.
7. Modify `contentHtml` first for body edits. Use legacy `blocks` only when the article has no `contentHtml`.
8. Run the editor export or renderer check after meaningful changes.
9. Tell the user to refresh the local preview or rely on the editor's automatic refresh.

## Article Model

Use `ArticleDocument`:

```json
{
  "title": "文章标题",
  "author": "作者",
  "digest": "可选发布摘要，不显示在正文里",
  "cover": "封面图片路径或 URL",
  "sourceUrl": "阅读原文链接",
  "contentHtml": "<p>自由富文本正文</p>",
  "blocks": []
}
```

`contentHtml` is the primary format for the local editor. It should feel like a normal WeChat article editor: free paragraphs, headings, quotes, lists, images, separators, text color, highlights, and alignment. The left toolbar provides formatting and insert actions; the right Codex panel handles selected text operations. Do not force the user into fixed module slots.

Legacy block types:

- `heading`: `text`, `level`
- `paragraph`: `text`
- `quote`: `text`
- `image`: `src`, `alt`, `caption`
- `list`: `items`
- `divider`
- `callout`: `text`, `tone`

## Editing Rules

- Keep content and styling separate. Do not embed arbitrary HTML in article text.
- Treat `digest` as optional publishing metadata. Do not insert it into `contentHtml` unless the user explicitly asks for an article lead paragraph.
- Prefer short paragraphs for mobile reading.
- Preserve the user's voice unless the user explicitly asks for a stronger rewrite.
- When the user asks for style changes, use ordinary article structures such as headings, quotes, bold text, lists, separators, or figures. Avoid turning writing into rigid slots.
- When the user asks for a picture, either insert a `<figure>` with a local path/URL provided by the user or create a clear image generation/search brief.
- When the local editor sends an AI image request, use the user's image prompt plus selected text/context. If the active Codex session has the built-in `imagegen` skill, create the image asset and insert a `<figure>` near the selection. If `imagegen` is not available, tell the user to update/restart Codex and use the editor's Wikimedia image search or the optional OpenAI API key path for now.
- In the local editor, `WX_IMAGE_PROVIDER=openai-api` plus `OPENAI_API_KEY` enables real GPT Image generation into `.wx-editor/assets`. Without that API key path, the editor searches Wikimedia Commons for real image assets and falls back to a local SVG placeholder when no suitable image is found. The built-in Codex conversation image tool can be used by the active Codex agent, but it is not a stable local HTTP API exposed through `codex exec`.
- When the user asks for one-click typesetting, improve the existing `contentHtml` hierarchy without changing meaning: add headings, split long paragraphs, add lists, emphasize key sentences, and insert separators sparingly.
- When the user asks for a summary/摘要 for publishing, update `digest` only. When the user asks for an opening/导语, write it into `contentHtml`.
- Keep claims factual. Ask for source material when the article makes specific commercial, legal, medical, or financial claims that need verification.

## WeChat Compatibility

Read `references/wechat-compat.md` before changing renderer behavior, adding new block types, or advising about direct publishing.

Core constraints:

- Export HTML with inline CSS.
- Avoid JavaScript, external CSS, forms, complex positioning, and desktop-first layouts.
- Keep the final render optimized for phone widths.
- Treat the local preview as close approximation. The official WeChat preview remains the final authority.

## Local Editor Commands

From the repository root:

```bash
pnpm install
codex login
pnpm dev
```

The editor runs at `http://localhost:3000` by default.
The editor's AI buttons call the local `/api/ai/apply` endpoint, which defaults to local `codex exec` using the user's saved ChatGPT/Codex login. Users do not need an OpenAI API token for the default path. If Codex login is unavailable, the editor writes `.wx-editor/request.json` as a fallback for Codex to process manually. Set `WX_AI_PROVIDER=openai-api` only when intentionally using an OpenAI API key.
For GPT Image generation from the browser button, set `WX_IMAGE_PROVIDER=openai-api` and `OPENAI_API_KEY`. Without that, image requests use Wikimedia Commons search first, then local generated SVG assets as fallback. They can also be handled manually by the active Codex conversation using its built-in image generation tool.

Important files:

- `.wx-editor/article.json`: source article state
- `.wx-editor/request.json`: latest browser AI request
- `.wx-editor/image-request.json`: latest browser request for Codex imagegen skill
- `.wx-editor/article.wechat.html`: exported WeChat HTML
- `.wx-editor/article.md`: exported Markdown

## Handling Codex Imagegen Requests

When `.wx-editor/image-request.json` exists and the user asks Codex to process the latest image request:

1. Use the `imagegen` skill and its built-in image generation mode when available.
2. Read the request fields: `prompt`, `selectedText`, `selectedHtml`, `articleTitle`, and `contentHtml`.
3. Generate a real bitmap image suitable for a WeChat Official Account article. Avoid text, watermarks, QR codes, and UI screenshots unless explicitly requested.
4. Save the selected generated image into `.wx-editor/assets/` with a descriptive filename.
5. Insert a `<figure><img src="/assets/<filename>" alt="..."><figcaption>...</figcaption></figure>` into `.wx-editor/article.json` near the selected content. If no selection exists, insert it near the most relevant paragraph or the latest useful article position.
6. Mark the image request status as `done` and include the saved asset path.
7. If the local editor is running, call its article update/export API or tell the user to refresh.

If the active Codex session does not expose `imagegen`, do not ask a normal Codex subscriber for an API token. Explain that `imagegen` is provided by the Codex app/runtime, ask them to update or restart Codex, and suggest the editor's `自动配图` Wikimedia search as the immediate fallback.

## Handling Browser AI Requests

When `.wx-editor/request.json` exists:

1. Read the request.
2. If `contentHtml` is present in the request or article, operate on the freeform HTML body.
3. If `selectionTarget` is `title`, update only `title` unless the instruction explicitly asks to change the body.
4. If `selectionTarget` is `body` and `selectedText` or `selectedHtml` is present, apply the instruction only to that exact selected passage or image area. Preserve unrelated article content.
5. If the instruction asks for an image, insert a nearby `<figure>` with an image placeholder, caption, and clear image direction when no asset is available yet.
6. If the instruction asks for style changes, use normal HTML structures such as `<h2>`, `<blockquote>`, `<strong>`, `<ul>`, `<hr>`, or `<figure>` instead of inventing rigid blocks.
7. Update `.wx-editor/article.json`.
8. Set the request status to `done` or explain if blocked.
9. Run `pnpm --filter @wx-codex/editor check` when code changed; for article-only changes, reload/export through the editor API if the server is running.
