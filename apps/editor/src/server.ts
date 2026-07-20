import path from "node:path";
import fs from "node:fs/promises";
import process from "node:process";
import { spawn } from "node:child_process";
import express, { type Response } from "express";
import { createServer as createViteServer } from "vite";
import {
  checkWechatCompatibility,
  createSampleArticle,
  renderPlainMarkdown,
  renderWechatHtml,
  type ArticleDocument
} from "@wx-codex/wechat-renderer";

const rootDir = process.cwd();
const repoRoot = path.resolve(rootDir, "../..");
const stateDir = path.join(repoRoot, ".wx-editor");
const articlePath = path.join(stateDir, "article.json");
const requestPath = path.join(stateDir, "request.json");
const imageRequestPath = path.join(stateDir, "image-request.json");
const exportHtmlPath = path.join(stateDir, "article.wechat.html");
const exportMdPath = path.join(stateDir, "article.md");
const assetsDir = path.join(stateDir, "assets");

interface AiApplyRequest {
  articleTitle?: string;
  digest?: string;
  contentHtml?: string;
  selectedText?: string;
  selectedHtml?: string;
  selectionTarget?: "title" | "body";
  operation?: "edit" | "insert" | "title-insert";
  titleInsertIndex?: number;
  instruction?: string;
  generatedImageUrl?: string;
  generatedImagePrompt?: string;
  allowImageGeneration?: boolean;
}

type StreamWriter = (message: string) => void;

async function ensureState() {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  try {
    await fs.access(articlePath);
  } catch {
    await fs.writeFile(articlePath, JSON.stringify(createSampleArticle(), null, 2));
  }
}

async function readArticle(): Promise<ArticleDocument> {
  await ensureState();
  return JSON.parse(await fs.readFile(articlePath, "utf8")) as ArticleDocument;
}

async function writeArticle(article: ArticleDocument) {
  await ensureState();
  await fs.writeFile(articlePath, JSON.stringify(article, null, 2));
  await fs.writeFile(exportHtmlPath, renderWechatHtml(article));
  await fs.writeFile(exportMdPath, renderPlainMarkdown(article));
}

function extractResponseText(payload: unknown): string {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .filter(Boolean)
    .join("\n");
}

function escapeHtml(value = ""): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXmlAttribute(value = ""): string {
  return escapeHtml(value).replaceAll("\n", " ");
}

function encodeSvgText(value = ""): string {
  return escapeHtml(value.replace(/\s+/g, " ").trim().slice(0, 80));
}

function placeholderImageSvg(title: string, subtitle: string): string {
  const safeTitle = encodeSvgText(title || "公众号配图");
  const safeSubtitle = encodeSvgText(subtitle || "AI 生成图片占位，发布前可替换为正式图片");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${escapeXmlAttribute(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e7f5f2"/>
      <stop offset="0.52" stop-color="#f7faf9"/>
      <stop offset="1" stop-color="#eef4ff"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="58" y="58" width="1164" height="604" rx="32" fill="none" stroke="#8fb6aa" stroke-width="3" stroke-dasharray="16 16"/>
  <circle cx="246" cy="218" r="72" fill="#0f766e" opacity="0.18"/>
  <path d="M170 522c118-152 188-214 262-148 48 43 83 63 132 18 79-72 164-20 302 130H170z" fill="#0f766e" opacity="0.22"/>
  <path d="M598 522c86-104 145-148 197-100 40 36 72 48 112 14 63-54 129-14 222 86H598z" fill="#315f8f" opacity="0.16"/>
  <text x="640" y="308" text-anchor="middle" fill="#263034" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-size="54" font-weight="700">${safeTitle}</text>
  <text x="640" y="382" text-anchor="middle" fill="#526066" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-size="28">${safeSubtitle}</text>
  <text x="640" y="610" text-anchor="middle" fill="#7b8188" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-size="22">本地预览占位图 · 发布前替换为正式素材</text>
</svg>`;
}

function imageRequestText(input: AiApplyRequest): string {
  return [input.instruction, input.selectedText, input.articleTitle]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function imagePrompt(input: AiApplyRequest): string {
  const context = [
    input.generatedImagePrompt,
    input.instruction,
    input.selectedText ? `选中内容：${input.selectedText}` : "",
    input.articleTitle ? `文章标题：${input.articleTitle}` : ""
  ].filter(Boolean).join("\n");
  return [
    "为微信公众号文章生成一张配图。",
    "画面要适合手机端阅读，干净、克制、无水印、无文字。",
    "不要生成二维码、品牌 Logo 或公众号界面截图。",
    "内容要求：",
    context
  ].join("\n");
}

function wantsImage(input: AiApplyRequest): boolean {
  return /(配图|加图|插图|图片|封面|image|illustration)/i.test(imageRequestText(input));
}

function stripMetadataHtml(value = ""): string {
  return stripHtml(value.replace(/&nbsp;/g, " "));
}

function imageExtensionFromMime(mime = ""): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function compactImageQuery(input: AiApplyRequest): string {
  const raw = [
    input.selectedText,
    input.articleTitle,
    input.instruction
  ].filter(Boolean).join(" ");
  return raw
    .replace(/(生成|插入|一张|适合|微信公众号|正文|配图|图片|不要|文字|水印|二维码|Logo|界面|figure|figcaption|当前选区|全文|根据|优先|用户|提示词|本地素材目录|保存到)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "公众号配图";
}

function generatedArticleImageSvg(title: string, subtitle: string): string {
  const safeTitle = encodeSvgText(title || "公众号配图");
  const safeSubtitle = encodeSvgText(subtitle || "AI 生成本地配图");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${escapeXmlAttribute(title)}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#dff3ef"/>
      <stop offset="0.48" stop-color="#f8fbfa"/>
      <stop offset="1" stop-color="#e8eef8"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#sky)"/>
  <circle cx="1060" cy="126" r="94" fill="#f5c76b" opacity="0.55" filter="url(#soft)"/>
  <path d="M0 520C172 420 264 430 386 492C526 563 658 548 804 438C956 324 1118 360 1280 478V720H0Z" fill="#0f766e" opacity="0.24"/>
  <path d="M0 592C206 508 360 538 520 592C718 658 908 620 1280 530V720H0Z" fill="#315f8f" opacity="0.16"/>
  <rect x="78" y="76" width="1124" height="568" rx="34" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9"/>
  <rect x="134" y="460" width="382" height="10" rx="5" fill="#0f766e" opacity="0.32"/>
  <rect x="134" y="492" width="620" height="10" rx="5" fill="#315f8f" opacity="0.18"/>
  <text x="134" y="264" fill="#263034" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-size="58" font-weight="760">${safeTitle}</text>
  <text x="134" y="340" fill="#526066" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-size="30">${safeSubtitle}</text>
  <text x="134" y="406" fill="#7b8188" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-size="22">本地生成配图 · 可在发布前替换为摄影图或微信素材</text>
</svg>`;
}

async function createGeneratedImageAsset(input: AiApplyRequest): Promise<{ url: string; prompt: string } | null> {
  if (input.operation === "title-insert") return null;
  if (input.allowImageGeneration === false) return null;
  if (!wantsImage(input)) return null;
  await ensureState();
  const topic = (input.selectedText || input.articleTitle || "公众号配图").replace(/\s+/g, " ").trim().slice(0, 28);
  const prompt = imageRequestText(input).slice(0, 120) || topic;
  if (process.env.WX_IMAGE_PROVIDER === "openai-api" && process.env.OPENAI_API_KEY) {
    return await createOpenAiImageAsset(input, prompt);
  }
  if (process.env.WX_IMAGE_PROVIDER !== "placeholder") {
    const commonsImage = await createWikimediaImageAsset(input).catch((error) => {
      console.warn("Wikimedia image lookup failed:", error);
      return null;
    });
    if (commonsImage) return commonsImage;
  }
  const fileName = `ai-image-${Date.now()}.svg`;
  await fs.writeFile(path.join(assetsDir, fileName), generatedArticleImageSvg(topic, prompt));
  return { url: `/assets/${fileName}`, prompt };
}

async function createWikimediaImageAsset(input: AiApplyRequest): Promise<{ url: string; prompt: string } | null> {
  const query = compactImageQuery(input);
  const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
  apiUrl.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1280",
    origin: "*"
  }).toString();
  const searchResponse = await fetch(apiUrl, {
    headers: { "User-Agent": "wx-codex-editor/0.1 (local WeChat article editor)" }
  });
  if (!searchResponse.ok) return null;
  const searchResult = await searchResponse.json() as {
    query?: {
      pages?: Record<string, {
        title?: string;
        imageinfo?: Array<{
          thumburl?: string;
          url?: string;
          mime?: string;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }>;
    };
  };
  const candidates = Object.values(searchResult.query?.pages ?? {})
    .map((page) => ({ page, info: page.imageinfo?.[0] }))
    .filter((item) => item.info?.thumburl && /^image\/(jpeg|png|webp)$/i.test(item.info.mime ?? ""));
  const selected = candidates[0];
  if (!selected?.info?.thumburl) return null;

  const imageResponse = await fetch(selected.info.thumburl, {
    headers: { "User-Agent": "wx-codex-editor/0.1 (local WeChat article editor)" }
  });
  if (!imageResponse.ok) return null;
  const mime = imageResponse.headers.get("content-type") || selected.info.mime || "image/jpeg";
  const fileName = `commons-image-${Date.now()}.${imageExtensionFromMime(mime)}`;
  const data = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(path.join(assetsDir, fileName), data);

  const meta = selected.info.extmetadata ?? {};
  const objectName = stripMetadataHtml(meta.ObjectName?.value || selected.page.title?.replace(/^File:/, "") || query);
  const license = stripMetadataHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value || "Wikimedia Commons");
  const author = stripMetadataHtml(meta.Artist?.value || "");
  const attribution = [objectName, author ? `作者：${author}` : "", license ? `来源：Wikimedia Commons，${license}` : "来源：Wikimedia Commons"]
    .filter(Boolean)
    .join(" · ");
  return { url: `/assets/${fileName}`, prompt: attribution };
}

async function createOpenAiImageAsset(input: AiApplyRequest, fallbackPrompt: string): Promise<{ url: string; prompt: string }> {
  const prompt = imagePrompt(input);
  const body: Record<string, string> = {
    model: process.env.WX_IMAGE_MODEL ?? "gpt-image-2",
    prompt
  };
  if (process.env.WX_IMAGE_SIZE) body.size = process.env.WX_IMAGE_SIZE;
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI image request failed: ${response.status} ${detail}`);
  }
  const result = await response.json() as { data?: Array<{ b64_json?: string }> };
  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error("OpenAI image response did not include image data.");
  const fileName = `ai-image-${Date.now()}.png`;
  await fs.writeFile(path.join(assetsDir, fileName), Buffer.from(imageBase64, "base64"));
  return { url: `/assets/${fileName}`, prompt: fallbackPrompt || prompt };
}

function ensureGeneratedImageInHtml(contentHtml: string, image: { url: string; prompt: string } | null): string {
  if (!image || contentHtml.includes(image.url)) return contentHtml;
  const figure = `<figure data-ai-result="true"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.prompt)}"><figcaption>${escapeHtml(image.prompt)}</figcaption></figure>`;
  if (/src=["']\/api\/placeholder-image[^"']*["']/i.test(contentHtml)) {
    return contentHtml
      .replace(/src=["']\/api\/placeholder-image[^"']*["']/i, `src="${escapeHtml(image.url)}"`)
      .replace(/<figure(?![^>]*data-ai-result=)/i, `<figure data-ai-result="true"`);
  }
  return `${contentHtml}\n${figure}`;
}

function stripGeneratedMediaWhenDisallowed(contentHtml: string, input: AiApplyRequest): string {
  if (input.allowImageGeneration !== false) return contentHtml;
  return contentHtml
    .replace(/<figure[^>]*data-ai-result=["']true["'][\s\S]*?<\/figure>/gi, "")
    .replace(/<img[^>]*data-ai-result=["']true["'][^>]*>/gi, "");
}

function stripAllMediaFromFragment(fragmentHtml: string, input: AiApplyRequest): string {
  if (input.allowImageGeneration !== false) return fragmentHtml;
  return fragmentHtml
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");
}

function imageFigure(image: { url: string; prompt: string }): string {
  return `<figure data-ai-result="true"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.prompt)}"><figcaption>${escapeHtml(image.prompt)}</figcaption></figure>`;
}

function normalizeInsertedFragment(fragmentHtml: string, input: AiApplyRequest): string {
  const clean = stripAllMediaFromFragment(fragmentHtml, input).trim();
  if (!clean) return "";
  if (/<(p|h2|h3|blockquote|ul|ol|figure|hr)\b/i.test(clean)) {
    return clean.replace(/<(p|h2|h3|blockquote|ul|ol|figure)\b(?![^>]*data-ai-result=)/i, "<$1 data-ai-result=\"true\"");
  }
  const text = stripHtml(clean) || clean;
  return `<p data-ai-result="true">${escapeHtml(text)}</p>`;
}

function stripHtml(value = ""): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function insertTextAtIndex(value: string, insertText: string, index: number): string {
  const safeIndex = Math.max(0, Math.min(index, value.length));
  return `${value.slice(0, safeIndex)}${insertText}${value.slice(safeIndex)}`.replace(/\s+/g, " ").trim();
}

function insertHtmlAtAnchor(contentHtml: string, fragmentHtml: string): string {
  const cleanFragment = fragmentHtml.trim();
  const headingAnchorPattern = /<h([23])([^>]*)>([\s\S]*?)<span\b[^>]*data-ai-insert-anchor=["']true["'][^>]*>\s*<\/span>([\s\S]*?)<\/h\1>/i;
  if (headingAnchorPattern.test(contentHtml)) {
    return contentHtml.replace(headingAnchorPattern, (_match, level: string, attrs: string, before: string, after: string) => {
      const headingHtml = `${before}${after}`;
      const headingText = stripHtml(headingHtml.replace(/<br\s*\/?>/gi, ""));
      if (!headingText) return cleanFragment;
      return `<h${level}${attrs}>${headingHtml}</h${level}>\n${cleanFragment}`;
    });
  }
  const anchorPattern = /<span\b[^>]*data-ai-insert-anchor=["']true["'][^>]*>\s*<\/span>/i;
  if (anchorPattern.test(contentHtml)) {
    return contentHtml.replace(anchorPattern, cleanFragment);
  }
  const anyAnchorPattern = /<([a-z0-9-]+)\b[^>]*data-ai-insert-anchor=["']true["'][^>]*>[\s\S]*?<\/\1>/i;
  if (anyAnchorPattern.test(contentHtml)) {
    return contentHtml.replace(anyAnchorPattern, cleanFragment);
  }
  return `${contentHtml}\n${cleanFragment}`;
}

function buildAiInsertPrompt(input: AiApplyRequest, article: ArticleDocument): string {
  return [
    "You are an expert WeChat Official Account editor.",
    "Generate only the HTML fragment requested by the user for insertion into contentHtml.",
    "Do not return the full article. Do not rewrite existing article content.",
    "For normal inserted prose, always use <p> paragraphs. Do not use <section> or bare text for prose.",
    "Use WeChat-friendly HTML such as p, h2, h3, blockquote, ul, ol, strong, em, and figure.",
    "Mark the top-level inserted element or wrapper with data-ai-result=\"true\".",
    "If allowImageGeneration is false, do not create, insert, or suggest any image, figure, img, cover, or visual asset. Insert text only.",
    "If generatedImageUrl is provided for an image request, return a figure using that URL.",
    "Return only compact JSON with keys: insertHtml, note.",
    "",
    JSON.stringify({
      instruction: input.instruction,
      selectedText: input.selectedText ?? "",
      selectedHtml: input.selectedHtml ?? "",
      generatedImageUrl: input.generatedImageUrl ?? "",
      generatedImagePrompt: input.generatedImagePrompt ?? "",
      allowImageGeneration: input.allowImageGeneration ?? null,
      articleTitle: article.title,
      articleDigest: article.digest
    })
  ].join("\n");
}

function buildAiTitleInsertPrompt(input: AiApplyRequest, article: ArticleDocument): string {
  return [
    "You are an expert WeChat Official Account title editor.",
    "Generate only the plain text requested by the user for insertion into the article title.",
    "Do not return HTML, Markdown, quotes, numbering, explanation, image text, cover text, or a full article.",
    "The result must be short enough to fit naturally inside a WeChat Official Account title.",
    "Return only compact JSON with keys: insertText, note.",
    "",
    JSON.stringify({
      instruction: input.instruction,
      currentTitle: article.title,
      insertIndex: input.titleInsertIndex ?? article.title.length
    })
  ].join("\n");
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}

function buildAiPrompt(input: AiApplyRequest, article: ArticleDocument): string {
  return [
    "You are an expert WeChat Official Account editor.",
    "Edit the article according to the user's instruction.",
    "The main body is freeform HTML in contentHtml.",
    "Preserve meaning and surrounding HTML unless the user asks for broader changes.",
    "selectionTarget can be title or body.",
    "If selectionTarget is title, edit the title only unless the instruction explicitly asks for body changes.",
    "If selectionTarget is body, edit contentHtml only unless the instruction explicitly asks for title or digest changes.",
    "If selectedText/selectedHtml is provided, edit only that selected region or insert immediately near it. Do not rewrite unrelated parts of the article.",
    "If contentHtml contains an element with data-ai-insert-anchor=\"true\", insert the requested new content exactly at that anchor position, remove the anchor element, and do not rewrite unrelated content.",
    "For body edits, mark the final changed or inserted region with data-ai-result=\"true\" on the nearest edited element such as p, h2, blockquote, figure, ul, or ol. Use this marker only once when possible.",
    "If allowImageGeneration is false, do not create, insert, or suggest any image, figure, img, cover, or visual asset. Insert text only.",
    "If asked for a publishing summary, update digest only and do not insert it into contentHtml.",
    "If generatedImageUrl is provided for an image request, insert a <figure data-ai-result=\"true\"><img src=\"generatedImageUrl\" alt=\"...\"><figcaption>...</figcaption></figure> near the relevant passage.",
    "If asked for an image and generatedImageUrl is missing, insert a <figure data-ai-result=\"true\"> with an <img src=\"/api/placeholder-image?title=short-image-topic\" alt=\"...\"> and a figcaption containing the concrete image direction near the relevant passage.",
    "Return only compact JSON with keys: title, digest, contentHtml, note.",
    "",
    JSON.stringify({
      instruction: input.instruction,
      selectionTarget: input.selectionTarget ?? "body",
      selectedText: input.selectedText ?? "",
      selectedHtml: input.selectedHtml ?? "",
      generatedImageUrl: input.generatedImageUrl ?? "",
      generatedImagePrompt: input.generatedImagePrompt ?? "",
      allowImageGeneration: input.allowImageGeneration ?? null,
      article
    })
  ].join("\n");
}

async function runCodexEdit(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "--ask-for-approval",
      "never",
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--output-last-message",
      "-",
      "-"
    ], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex CLI timed out."));
    }, Number(process.env.WX_CODEX_TIMEOUT_MS ?? 120000));

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Codex CLI exited with ${code}`));
      }
    });
    child.stdin.end(prompt);
  });
}

function cleanCliText(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function summarizeCodexEvent(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  const message = typeof event.message === "string" ? event.message : "";
  const delta = typeof event.delta === "string" ? event.delta : "";
  const item = event.item && typeof event.item === "object" ? event.item as Record<string, unknown> : null;
  const itemType = item && typeof item.type === "string" ? item.type : "";

  if (message) return cleanCliText(message).slice(0, 220);
  if (delta) return `正在生成：${cleanCliText(delta).slice(0, 160)}`;
  if (type === "thread.started") return "本机 Codex 会话已建立。";
  if (type === "turn.started") return "Codex 正在处理当前请求。";
  if (type === "turn.completed") return "Codex 已完成生成。";
  if (type === "exec_command_begin") return "Codex 正在读取本地文章状态。";
  if (type === "exec_command_output") return "Codex 返回了一段处理输出。";
  if (type === "agent_reasoning" || type === "agent_reasoning_delta") return "Codex 正在分析选区和改写要求...";
  if (type === "agent_message" || type === "agent_message_delta") return "Codex 正在生成可回填内容...";
  if (type === "task_started") return "本机 Codex 已开始处理。";
  if (type === "task_complete") return "Codex 处理完成，正在回填文章。";
  if (itemType) return `Codex 状态：${itemType}`;
  if (type) return `Codex 状态：${type}`;
  return null;
}

function shouldShowCliDiagnostic(text: string): boolean {
  if (!text) return false;
  if (text.includes(" WARN ")) return false;
  if (text.includes("codex_core_skills::loader")) return false;
  if (text.includes("codex_core_plugins::manifest")) return false;
  if (text.includes("codex_rollout::list")) return false;
  if (text.includes("codex_models_manager::cache")) return false;
  if (text.includes("Failed to kill MCP process group")) return false;
  return true;
}

async function runCodexEditStream(prompt: string, onTrace: StreamWriter): Promise<string> {
  await ensureState();
  const outputPath = path.join(stateDir, `last-codex-output-${Date.now()}.txt`);
  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "--ask-for-approval",
      "never",
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--output-last-message",
      outputPath,
      "-"
    ], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdoutBuffer = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex CLI timed out."));
    }, Number(process.env.WX_CODEX_TIMEOUT_MS ?? 120000));

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = summarizeCodexEvent(JSON.parse(line));
          if (message) onTrace(message);
        } catch {
          const message = cleanCliText(line);
          if (message) onTrace(message.slice(0, 220));
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = cleanCliText(chunk.toString());
      stderr += `${text}\n`;
      if (shouldShowCliDiagnostic(text)) onTrace(text.slice(0, 220));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Codex CLI exited with ${code}`));
        return;
      }
      try {
        const output = (await fs.readFile(outputPath, "utf8")).trim();
        if (!output) throw new Error("Codex CLI produced no final message.");
        resolve(output);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to read Codex output."));
      } finally {
        await fs.rm(outputPath, { force: true }).catch(() => undefined);
      }
    });
    child.stdin.end(prompt);
  });
}

async function runOpenAiEdit(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.1",
      input: prompt
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail}`);
  }

  return extractResponseText(await response.json());
}

async function applyAiEdit(input: AiApplyRequest): Promise<ArticleDocument> {
  const current = await readArticle();
  const article: ArticleDocument = {
    ...current,
    title: input.articleTitle ?? current.title,
    digest: input.digest ?? current.digest,
    contentHtml: input.contentHtml ?? current.contentHtml ?? "",
    blocks: []
  };

  const generatedImage = await createGeneratedImageAsset(input);
  if (input.operation === "title-insert") {
    const prompt = buildAiTitleInsertPrompt(input, article);
    const raw = process.env.WX_AI_PROVIDER === "openai-api"
      ? await runOpenAiEdit(prompt)
      : await runCodexEdit(prompt);
    const parsed = parseJsonObject(raw) as { insertText?: string; note?: string };
    const insertText = stripHtml(typeof parsed.insertText === "string" ? parsed.insertText : "");
    const nextArticle: ArticleDocument = {
      ...article,
      title: insertTextAtIndex(article.title ?? "", insertText, input.titleInsertIndex ?? (article.title ?? "").length),
      blocks: []
    };
    await writeArticle(nextArticle);
    return nextArticle;
  }
  if (input.operation === "insert") {
    const prompt = buildAiInsertPrompt({
      ...input,
      generatedImageUrl: generatedImage?.url,
      generatedImagePrompt: generatedImage?.prompt
    }, article);
    const raw = process.env.WX_AI_PROVIDER === "openai-api"
      ? await runOpenAiEdit(prompt)
      : await runCodexEdit(prompt);
    const parsed = parseJsonObject(raw) as { insertHtml?: string; note?: string };
    const fragment = generatedImage && !String(parsed.insertHtml ?? "").includes(generatedImage.url)
      ? imageFigure(generatedImage)
      : normalizeInsertedFragment(typeof parsed.insertHtml === "string" ? parsed.insertHtml : "", input);
    const nextArticle: ArticleDocument = {
      ...article,
      contentHtml: insertHtmlAtAnchor(article.contentHtml ?? "", fragment),
      blocks: []
    };
    await writeArticle(nextArticle);
    return nextArticle;
  }

  const prompt = buildAiPrompt({
    ...input,
    generatedImageUrl: generatedImage?.url,
    generatedImagePrompt: generatedImage?.prompt
  }, article);
  const raw = process.env.WX_AI_PROVIDER === "openai-api"
    ? await runOpenAiEdit(prompt)
    : await runCodexEdit(prompt);
  const parsed = parseJsonObject(raw) as Partial<ArticleDocument> & { note?: string };
  const nextArticle: ArticleDocument = {
    ...article,
    title: typeof parsed.title === "string" ? parsed.title : article.title,
    digest: typeof parsed.digest === "string" ? parsed.digest : article.digest,
    contentHtml: stripGeneratedMediaWhenDisallowed(
      ensureGeneratedImageInHtml(
        typeof parsed.contentHtml === "string" ? parsed.contentHtml : article.contentHtml ?? "",
        generatedImage
      ),
      input
    ),
    blocks: []
  };
  await writeArticle(nextArticle);
  return nextArticle;
}

async function applyAiEditStream(input: AiApplyRequest, onTrace: StreamWriter): Promise<ArticleDocument> {
  const current = await readArticle();
  const article: ArticleDocument = {
    ...current,
    title: input.articleTitle ?? current.title,
    digest: input.digest ?? current.digest,
    contentHtml: input.contentHtml ?? current.contentHtml ?? "",
    blocks: []
  };

  const generatedImage = await createGeneratedImageAsset(input);
  if (generatedImage) {
    onTrace(`已生成本地配图素材：${generatedImage.url}`);
  }
  if (input.operation === "title-insert") {
    const prompt = buildAiTitleInsertPrompt(input, article);
    onTrace("已锁定标题光标位置，正在生成标题插入文本。");
    const raw = process.env.WX_AI_PROVIDER === "openai-api"
      ? await runOpenAiEdit(prompt)
      : await runCodexEditStream(prompt, onTrace);
    onTrace("已收到 Codex 标题文本，正在放回标题光标位置。");
    const parsed = parseJsonObject(raw) as { insertText?: string; note?: string };
    const insertText = stripHtml(typeof parsed.insertText === "string" ? parsed.insertText : "");
    const nextArticle: ArticleDocument = {
      ...article,
      title: insertTextAtIndex(article.title ?? "", insertText, input.titleInsertIndex ?? (article.title ?? "").length),
      blocks: []
    };
    await writeArticle(nextArticle);
    return nextArticle;
  }
  if (input.operation === "insert") {
    const prompt = buildAiInsertPrompt({
      ...input,
      generatedImageUrl: generatedImage?.url,
      generatedImagePrompt: generatedImage?.prompt
    }, article);
    onTrace("已锁定编辑器最后停留位置，正在生成插入片段。");
    const raw = process.env.WX_AI_PROVIDER === "openai-api"
      ? await runOpenAiEdit(prompt)
      : await runCodexEditStream(prompt, onTrace);
    onTrace("已收到 Codex 插入片段，正在放回光标位置。");
    const parsed = parseJsonObject(raw) as { insertHtml?: string; note?: string };
    const fragment = generatedImage && !String(parsed.insertHtml ?? "").includes(generatedImage.url)
      ? imageFigure(generatedImage)
      : normalizeInsertedFragment(typeof parsed.insertHtml === "string" ? parsed.insertHtml : "", input);
    const nextArticle: ArticleDocument = {
      ...article,
      contentHtml: insertHtmlAtAnchor(article.contentHtml ?? "", fragment),
      blocks: []
    };
    await writeArticle(nextArticle);
    return nextArticle;
  }

  const prompt = buildAiPrompt({
    ...input,
    generatedImageUrl: generatedImage?.url,
    generatedImagePrompt: generatedImage?.prompt
  }, article);
  onTrace("已整理文章、选区和用户要求。");
  const raw = process.env.WX_AI_PROVIDER === "openai-api"
    ? await runOpenAiEdit(prompt)
    : await runCodexEditStream(prompt, onTrace);
  onTrace("已收到 Codex 最终输出，正在解析并回填。");
  const parsed = parseJsonObject(raw) as Partial<ArticleDocument> & { note?: string };
  const nextArticle: ArticleDocument = {
    ...article,
    title: typeof parsed.title === "string" ? parsed.title : article.title,
    digest: typeof parsed.digest === "string" ? parsed.digest : article.digest,
    contentHtml: stripGeneratedMediaWhenDisallowed(
      ensureGeneratedImageInHtml(
        typeof parsed.contentHtml === "string" ? parsed.contentHtml : article.contentHtml ?? "",
        generatedImage
      ),
      input
    ),
    blocks: []
  };
  await writeArticle(nextArticle);
  return nextArticle;
}

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use("/assets", express.static(assetsDir));

app.get("/api/placeholder-image", (req, res) => {
  const title = typeof req.query.title === "string" ? req.query.title : "公众号配图";
  const subtitle = typeof req.query.subtitle === "string" ? req.query.subtitle : "AI 配图占位";
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(placeholderImageSvg(title, subtitle));
});

app.get("/api/article", async (_req, res) => {
  const article = await readArticle();
  res.json({
    article,
    html: renderWechatHtml(article),
    issues: checkWechatCompatibility(article),
    paths: { articlePath, requestPath, imageRequestPath, exportHtmlPath, exportMdPath }
  });
});

app.put("/api/article", async (req, res) => {
  await writeArticle(req.body.article as ArticleDocument);
  res.json({ ok: true });
});

app.post("/api/ai-request", async (req, res) => {
  await ensureState();
  const payload = {
    createdAt: new Date().toISOString(),
    status: "pending",
    ...req.body
  };
  await fs.writeFile(requestPath, JSON.stringify(payload, null, 2));
  res.json({ ok: true, requestPath });
});

app.post("/api/imagegen-request", async (req, res) => {
  await ensureState();
  const article = await readArticle();
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
  const payload = {
    createdAt: new Date().toISOString(),
    status: "pending",
    kind: "codex-imagegen",
    prompt,
    selectedText: typeof req.body.selectedText === "string" ? req.body.selectedText : "",
    selectedHtml: typeof req.body.selectedHtml === "string" ? req.body.selectedHtml : "",
    selectionTarget: req.body.selectionTarget === "title" ? "title" : "body",
    articleTitle: article.title,
    contentHtml: article.contentHtml ?? "",
    instruction: [
      "Use the Codex imagegen skill to generate a real bitmap image for this WeChat Official Account article.",
      "Save the final image into .wx-editor/assets with a descriptive filename.",
      "Insert it into .wx-editor/article.json contentHtml as a <figure><img src=\"/assets/...\"><figcaption>...</figcaption></figure> near the selected content or latest useful article position.",
      "Then export/update the article state if the local editor service is running.",
      prompt ? `Image prompt: ${prompt}` : "If prompt is empty, infer a suitable image direction from the article title, selected content, and article context."
    ].join("\n")
  };
  await fs.writeFile(imageRequestPath, JSON.stringify(payload, null, 2));
  res.json({
    ok: true,
    imageRequestPath,
    codexPrompt: "请处理 wx-edit 的最新配图请求：读取 .wx-editor/image-request.json，使用 imagegen skill 生成一张适合微信公众号正文的真实图片，保存到 .wx-editor/assets，然后把图片作为 figure 插入 .wx-editor/article.json 对应位置。完成后告诉我回到 http://localhost:3000/ 刷新预览。"
  });
});

app.post("/api/ai/apply", async (req, res) => {
  try {
    const article = await applyAiEdit(req.body as AiApplyRequest);
    res.json({
      ok: true,
      article,
      html: renderWechatHtml(article),
      issues: checkWechatCompatibility(article),
      paths: { articlePath, requestPath, imageRequestPath, exportHtmlPath, exportMdPath }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI error";
    const code = message.includes("not found") || message.includes("Logged out") || message.includes("OPENAI_API_KEY") ? 501 : 500;
    res.status(code).json({ ok: false, error: message });
  }
});

app.post("/api/ai/apply-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const article = await applyAiEditStream(req.body as AiApplyRequest, (message) => {
      writeSse(res, "trace", { message });
    });
    writeSse(res, "done", {
      ok: true,
      article,
      html: renderWechatHtml(article),
      issues: checkWechatCompatibility(article),
      paths: { articlePath, requestPath, imageRequestPath, exportHtmlPath, exportMdPath }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI error";
    await ensureState();
    await fs.writeFile(requestPath, JSON.stringify({
      createdAt: new Date().toISOString(),
      status: "pending",
      ...(req.body as object),
      error: message
    }, null, 2)).catch(() => undefined);
    writeSse(res, "error", { error: message });
  } finally {
    res.end();
  }
});

app.post("/api/export", async (_req, res) => {
  const article = await readArticle();
  await writeArticle(article);
  res.json({ ok: true, exportHtmlPath, exportMdPath });
});

const vite = await createViteServer({
  root: rootDir,
  server: { middlewareMode: true },
  appType: "spa"
});

app.use(vite.middlewares);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Wx Codex Editor running at http://localhost:${port}`);
  console.log(`Article state: ${articlePath}`);
});
