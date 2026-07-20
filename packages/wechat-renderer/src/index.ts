export type BlockType = "heading" | "paragraph" | "quote" | "image" | "list" | "divider" | "callout";

export interface ArticleBlock {
  id: string;
  type: BlockType;
  text?: string;
  level?: 1 | 2 | 3;
  src?: string;
  alt?: string;
  caption?: string;
  items?: string[];
  tone?: "note" | "warning" | "success";
}

export interface ArticleDocument {
  title: string;
  author?: string;
  digest?: string;
  cover?: string;
  sourceUrl?: string;
  contentHtml?: string;
  blocks?: ArticleBlock[];
}

export interface CompatibilityIssue {
  severity: "info" | "warning" | "error";
  message: string;
  blockId?: string;
}

const theme = {
  text: "#2f3437",
  muted: "#7b8188",
  accent: "#0f766e",
  accentSoft: "#e7f5f2",
  border: "#d9e3df",
  paper: "#ffffff",
  warning: "#8a5a10",
  warningSoft: "#fff4d8"
};

function escapeHtml(value = ""): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineText(value = ""): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function blockToWechatHtml(block: ArticleBlock): string {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? 22 : block.level === 2 ? 19 : 17;
      return `<h${block.level ?? 2} style="margin: 1.45em 0 0.75em; padding: 0 0 0.35em; border-bottom: 1px solid ${theme.border}; color: ${theme.text}; font-size: ${size}px; line-height: 1.45; font-weight: 700;">${inlineText(block.text)}</h${block.level ?? 2}>`;
    }
    case "quote":
      return `<blockquote style="margin: 1.15em 0; padding: 0.75em 1em; border-left: 4px solid ${theme.accent}; background: ${theme.accentSoft}; color: ${theme.text}; font-size: 15px; line-height: 1.8;">${inlineText(block.text)}</blockquote>`;
    case "image": {
      const src = escapeHtml(block.src);
      const alt = escapeHtml(block.alt || block.caption || "");
      const caption = block.caption
        ? `<p style="margin: 0.45em 0 1.2em; color: ${theme.muted}; font-size: 13px; line-height: 1.6; text-align: center;">${inlineText(block.caption)}</p>`
        : "";
      return `<section style="margin: 1.3em 0;"><img src="${src}" alt="${alt}" style="display: block; width: 100%; max-width: 100%; height: auto; margin: 0 auto; border-radius: 4px;" />${caption}</section>`;
    }
    case "list": {
      const items = (block.items ?? []).map((item) => `<li style="margin: 0.45em 0;">${inlineText(item)}</li>`).join("");
      return `<ul style="margin: 1em 0; padding-left: 1.35em; color: ${theme.text}; font-size: 16px; line-height: 1.85;">${items}</ul>`;
    }
    case "divider":
      return `<section style="margin: 1.8em auto; width: 48px; height: 1px; background: ${theme.border};"></section>`;
    case "callout": {
      const isWarning = block.tone === "warning";
      return `<section style="margin: 1.2em 0; padding: 0.9em 1em; border: 1px solid ${isWarning ? "#efdba6" : theme.border}; background: ${isWarning ? theme.warningSoft : "#f7faf9"}; color: ${isWarning ? theme.warning : theme.text}; font-size: 15px; line-height: 1.8;">${inlineText(block.text)}</section>`;
    }
    case "paragraph":
    default:
      return `<p style="margin: 0.85em 0; color: ${theme.text}; font-size: 16px; line-height: 1.9; letter-spacing: 0;">${inlineText(block.text)}</p>`;
  }
}

function stripDangerousHtml(html = ""): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function normalizeEditorHtmlForWechat(html = ""): string {
  return stripDangerousHtml(html)
    .replace(/<[^>]*data-ai-insert-anchor="true"[^>]*><\/[^>]+>/gi, "")
    .replace(/<[^>]*data-ai-insert-anchor="true"[^>]*>/gi, "")
    .replace(/<p(.*?)>/gi, `<p style="margin: 0.85em 0; color: ${theme.text}; font-size: 16px; line-height: 1.9; letter-spacing: 0;">`)
    .replace(/<h2(.*?)>/gi, `<h2 style="margin: 1.45em 0 0.75em; padding: 0 0 0.35em; border-bottom: 1px solid ${theme.border}; color: ${theme.text}; font-size: 19px; line-height: 1.45; font-weight: 700;">`)
    .replace(/<h3(.*?)>/gi, `<h3 style="margin: 1.25em 0 0.65em; color: ${theme.text}; font-size: 17px; line-height: 1.5; font-weight: 700;">`)
    .replace(/<blockquote(.*?)>/gi, `<blockquote style="margin: 1.15em 0; padding: 0.75em 1em; border-left: 4px solid ${theme.accent}; background: ${theme.accentSoft}; color: ${theme.text}; font-size: 15px; line-height: 1.8;">`)
    .replace(/<ul(.*?)>/gi, `<ul style="margin: 1em 0; padding-left: 1.35em; color: ${theme.text}; font-size: 16px; line-height: 1.85;">`)
    .replace(/<ol(.*?)>/gi, `<ol style="margin: 1em 0; padding-left: 1.35em; color: ${theme.text}; font-size: 16px; line-height: 1.85;">`)
    .replace(/<li(.*?)>/gi, `<li style="margin: 0.45em 0;">`)
    .replace(/<hr(.*?)>/gi, `<section style="margin: 1.8em auto; width: 48px; height: 1px; background: ${theme.border};"></section>`)
    .replace(/<figure(.*?)>/gi, `<section style="margin: 1.3em 0;">`)
    .replace(/<\/figure>/gi, `</section>`)
    .replace(/<figcaption(.*?)>/gi, `<p style="margin: 0.45em 0 1.2em; color: ${theme.muted}; font-size: 13px; line-height: 1.6; text-align: center;">`)
    .replace(/<\/figcaption>/gi, `</p>`)
    .replace(/<a([^>]*)>/gi, (_match, attrs: string) => {
      const cleanAttrs = attrs.replace(/\sstyle="[^"]*"/gi, "").replace(/\starget="[^"]*"/gi, "");
      return `<a${cleanAttrs} style="color: ${theme.accent}; text-decoration: underline;">`;
    })
    .replace(/<font([^>]*)color="([^"]+)"([^>]*)>/gi, `<span style="color: $2;">`)
    .replace(/<\/font>/gi, `</span>`)
    .replace(/<span([^>]*)style="([^"]*)"([^>]*)>/gi, (_match, _before, style: string) => {
      const allowed = style
        .split(";")
        .map((item) => item.trim())
        .filter((item) => /^(color|background-color|font-size|text-align):/i.test(item))
        .join("; ");
      return `<span style="${allowed}">`;
    })
    .replace(/<div class="image-placeholder"[^>]*>(.*?)<\/div>/gi, `<section style="display: grid; place-items: center; height: 180px; border: 1px dashed #b6c5bf; color: ${theme.muted}; background: #f7faf9;">$1</section>`)
    .replace(/<img([^>]*?)>/gi, (_match, attrs: string) => {
      const cleanAttrs = attrs.replace(/\sstyle="[^"]*"/gi, "").replace(/\s\/$/, "");
      return `<img${cleanAttrs} style="display: block; width: 100%; max-width: 100%; height: auto; margin: 0 auto; border-radius: 4px;" />`;
    });
}

export function renderWechatHtml(article: ArticleDocument): string {
  const body = article.contentHtml
    ? normalizeEditorHtmlForWechat(article.contentHtml)
    : (article.blocks ?? []).map(blockToWechatHtml).join("\n");
  return `<section data-tool="wx-codex-editor" style="box-sizing: border-box; max-width: 677px; margin: 0 auto; padding: 0 0.5em; background: ${theme.paper}; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;">
${body}
</section>`;
}

export function renderPlainMarkdown(article: ArticleDocument): string {
  if (article.contentHtml) {
    const plain = stripDangerousHtml(article.contentHtml)
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n\n## $1\n\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n\n### $1\n\n")
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "\n\n> $1\n\n")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return [`# ${article.title}`, "", plain].join("\n") + "\n";
  }
  const lines = [`# ${article.title}`, ""];
  for (const block of article.blocks ?? []) {
    if (block.type === "heading") lines.push(`${"#".repeat(block.level ?? 2)} ${block.text ?? ""}`, "");
    if (block.type === "paragraph") lines.push(block.text ?? "", "");
    if (block.type === "quote") lines.push(`> ${block.text ?? ""}`, "");
    if (block.type === "image") lines.push(`![${block.alt ?? block.caption ?? ""}](${block.src ?? ""})`, block.caption ?? "", "");
    if (block.type === "list") lines.push(...(block.items ?? []).map((item) => `- ${item}`), "");
    if (block.type === "divider") lines.push("---", "");
    if (block.type === "callout") lines.push(`> ${block.text ?? ""}`, "");
  }
  return lines.join("\n").trim() + "\n";
}

export function checkWechatCompatibility(article: ArticleDocument): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  const html = renderWechatHtml(article);
  if (html.length > 20000) {
    issues.push({ severity: "warning", message: "HTML 超过 20000 字符，创建公众号草稿时可能失败。" });
  }
  if (!article.title || article.title.length > 64) {
    issues.push({ severity: "warning", message: "标题为空或超过 64 字，建议调整后再发布。" });
  }
  if (!article.contentHtml && (article.blocks?.length ?? 0) === 0) {
    issues.push({ severity: "warning", message: "正文为空，建议补充内容后再导出。" });
  }
  if (article.contentHtml && /<script|<style|on\w+=|javascript:/i.test(article.contentHtml)) {
    issues.push({ severity: "error", message: "正文里包含脚本或危险属性，导出时会移除。" });
  }
  if (article.contentHtml && /<img\b(?![^>]*src=)/i.test(article.contentHtml)) {
    issues.push({ severity: "warning", message: "正文里有缺少图片地址的图片标签。" });
  }
  if (article.contentHtml && /src=["']\/api\/placeholder-image/i.test(article.contentHtml)) {
    issues.push({ severity: "info", message: "正文里包含本地配图占位图，发布前请替换成正式图片或微信素材地址。" });
  }
  for (const block of article.blocks ?? []) {
    if (block.type === "image" && !block.src) {
      issues.push({ severity: "error", message: "图片块缺少 src。", blockId: block.id });
    }
    if (block.type === "image" && block.src?.startsWith("http://")) {
      issues.push({ severity: "warning", message: "图片使用 http 链接，建议换成 https 或上传到微信素材。", blockId: block.id });
    }
    if (block.type === "paragraph" && (block.text?.length ?? 0) > 500) {
      issues.push({ severity: "info", message: "单段文字较长，建议拆成多个段落提升手机阅读体验。", blockId: block.id });
    }
  }
  return issues;
}

export function createSampleArticle(): ArticleDocument {
  return {
    title: "一篇公众号文章由哪些部分组成",
    author: "wx-codex-editor",
    digest: "",
    contentHtml: `<p>这里就是自由写作区。你可以像在普通公众号编辑器里一样写正文，不需要先选择“正文段落”或“提示卡片”。</p>
<h2>选中文本后再交给 AI</h2>
<p>当你选中一句话或一段内容时，界面会出现 AI 工具条。你可以让 Codex 润色、缩短、扩写、查错，或者根据这段内容补一张配图。</p>
<blockquote>格式只是写作过程里的工具，不应该变成作者必须填写的结构。</blockquote>
<p>后续导出时，系统会把这些自由排版转换成更适合粘贴到微信公众号后台的内联 HTML。</p>`,
    blocks: []
  };
}
