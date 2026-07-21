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
7. If the request includes `contextMode: "article-context"`, use the whole article to understand tone, continuity, references, repeated ideas, and local fit, but still change only the selected region unless the instruction explicitly asks for broader changes.
8. If the request includes `contextMode: "selection-only"`, use the whole article only to locate and safely replace the selection; do not use surrounding content as writing material.
9. If the request includes `articleStylePrompt`, treat it as persistent article style guidance for tone, rhythm, wording, paragraph density, and restraint. It should influence the edit, but never override facts, scope, media permissions, or WeChat compatibility.
10. Modify `contentHtml` first for body edits. Use legacy `blocks` only when the article has no `contentHtml`.
11. Run the editor export or renderer check after meaningful changes.
12. Tell the user to refresh the local preview or rely on the editor's automatic refresh.

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
- For selected-region AI actions, respect `contextMode`. `article-context` means the full article is reference material for a better local edit, not permission to rewrite outside the selection. `selection-only` means surrounding content should not influence the rewrite except for safe replacement.
- Respect `articleStylePrompt` whenever present. Use it as article-wide style guidance, not as permission to change unrelated content.
- For normal AI editing actions such as polish, shorten, expand, typo check, title edits, and caption rewriting, do not insert new images, figures, covers, or placeholders. Image insertion is allowed only for explicit image-generation requests or custom/insert requests where `allowImageGeneration` is true.
- When the user asks for a picture, either insert a `<figure>` with a local path/URL provided by the user or create a clear image generation/search brief.
- When the local editor sends a Codex image request, use the user's image prompt plus selected text/context. If the active Codex session has the built-in `imagegen` skill, create the image asset and insert a `<figure>` near the selection. If `imagegen` is not available, tell the user to update/restart Codex. Do not suggest the removed automatic image-search flow.
- In the local editor, `WX_IMAGE_PROVIDER=openai-api` plus `OPENAI_API_KEY` is an optional server-side path for real GPT Image generation into `.wx-editor/assets`. The preferred no-token path is still Codex-assisted generation through the active Codex conversation. The built-in Codex conversation image tool can be used by the active Codex agent, but it is not a stable local HTTP API exposed through `codex exec`.
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
For image generation from the browser, use `请求 Codex 生图` and then process `.wx-editor/image-request.json` in the active Codex conversation with the built-in `imagegen` skill. Set `WX_IMAGE_PROVIDER=openai-api` and `OPENAI_API_KEY` only when intentionally enabling a separate server-side image API path.

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

If the active Codex session does not expose `imagegen`, do not ask a normal Codex subscriber for an API token. Explain that `imagegen` is provided by the Codex app/runtime, and ask them to update or restart Codex.

The browser tells the user to return to Codex and paste this style of request:

```text
请处理 wx-edit 的最新配图请求：读取 .wx-editor/image-request.json，使用 imagegen skill 生成一张适合微信公众号正文的真实图片，保存到 .wx-editor/assets，然后把图片作为 figure 插入 .wx-editor/article.json 对应位置。完成后告诉我回到 http://localhost:3000/ 刷新预览。
```

## Handling Browser AI Requests

When `.wx-editor/request.json` exists:

1. Read the request.
2. If `contentHtml` is present in the request or article, operate on the freeform HTML body.
3. If `selectionTarget` is `title`, update only `title` unless the instruction explicitly asks to change the body.
4. If `selectionTarget` is `body` and `selectedText` or `selectedHtml` is present, apply the instruction only to that exact selected passage or image area. Preserve unrelated article content.
5. If `contextMode` is `article-context`, use the article for tone, facts already present, rhythm, and transition quality, while keeping the edit bounded to the selected region.
6. If `contextMode` is `selection-only`, avoid borrowing wording, facts, or structure from outside the selected region.
7. If `articleStylePrompt` is present, apply it consistently to wording and tone while preserving the requested operation and selected scope.
8. If the instruction asks for an image, insert a nearby `<figure>` with an image placeholder, caption, and clear image direction when no asset is available yet.
9. If the instruction asks for style changes, use normal HTML structures such as `<h2>`, `<blockquote>`, `<strong>`, `<ul>`, `<hr>`, or `<figure>` instead of inventing rigid blocks.
10. Update `.wx-editor/article.json`.
11. Set the request status to `done` or explain if blocked.
12. Run `pnpm --filter @wx-codex/editor check` when code changed; for article-only changes, reload/export through the editor API if the server is running.
