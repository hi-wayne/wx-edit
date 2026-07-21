import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Bot,
  Clipboard,
  Download,
  Eraser,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  Redo2,
  X,
  Heading2,
  Highlighter,
  Image,
  List,
  ListOrdered,
  MessageSquareText,
  Pilcrow,
  Quote,
  RefreshCw,
  SeparatorHorizontal,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  WandSparkles
} from "lucide-react";
import type { ArticleDocument } from "@wx-codex/wechat-renderer";
import "./styles.css";

interface ApiState {
  article: ArticleDocument;
  html: string;
  paths: Record<string, string>;
}

interface EditorSelection {
  selectedText: string;
  selectedHtml: string;
  kind: "text" | "image" | "mixed";
  label: string;
  target: "title" | "body";
  imageSrc?: string;
}

interface StreamEvent {
  event: string;
  data: unknown;
}

interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CaretSnapshot {
  path: number[];
  offset: number;
}

interface BodySelectionSnapshot {
  start: CaretSnapshot;
  end: CaretSnapshot;
}

type InsertTarget = "title" | "body";

interface StoredCaretState {
  target: InsertTarget;
  titleOffset: number;
  bodySnapshot: CaretSnapshot | null;
}

const caretStorageKey = "wx-codex-editor:last-caret";

declare global {
  interface Window {
    Highlight?: typeof Highlight;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  }

  interface CSS {
    highlights?: HighlightRegistry;
  }
}

const colorSwatches = ["#2f3437", "#0f766e", "#b42318", "#7a4d00", "#315f8f"];

const selectionEditRules = [
  "你是一个稳健的微信公众号编辑 agent。先在内部判断选区在文章里的作用，再执行任务；不要输出解释、方案或备选稿，只返回可直接回填的结果。",
  "只处理当前选区，不改写选区外正文、标题或摘要；除非任务明确要求插入当前图片说明或按图补文。",
  "保留原有事实、称谓、数字、时间、地点和核心观点，不自行添加未经用户提供的新事实。",
  "尽量保留原来的 HTML 结构、段落层级和行文节奏，只在必要时微调标签。",
  "不要插入图片、figure、封面、摘要、广告语或额外小标题。",
  "输出要适合微信公众号手机端阅读：自然、清楚、有节奏，但不要营销腔。"
].join("");

function selectionContextRules(useArticleContext: boolean): string {
  return useArticleContext
    ? [
      "上下文模式：参考全文上下文。",
      "你会同时收到文章标题、摘要、完整正文 HTML、当前选中文本和选区 HTML。",
      "请用全文判断语气、前后衔接、信息重复、指代关系和读者阅读节奏。",
      "全文只能作为参考材料，最终只能修改当前选区或当前选中图片对应区域；不要顺手重写选区外内容。"
    ].join("")
    : [
      "上下文模式：只参考当前选区。",
      "完整正文只用于定位选区和保持 HTML 回填稳定，不要把选区外内容作为改写依据。",
      "最终只能修改当前选区或当前选中图片对应区域；不要扩展到全文。"
    ].join("");
}

function withSelectionContext(instruction: string, useArticleContext: boolean): string {
  return `${selectionContextRules(useArticleContext)}${instruction}`;
}

const quickActions = [
  {
    label: "润色",
    instruction: `${selectionEditRules}任务：在保留原意和信息量的前提下，把选中内容改得更顺、更准确、更有公众号文章的阅读感。减少口水话和重复表达，保留作者原本语气，不要过度煽情。`
  },
  {
    label: "缩短",
    instruction: `${selectionEditRules}任务：压缩选中内容到原文约 50%-70% 长度，保留核心信息、关键判断和必要细节。删除重复、铺垫、弱连接句，让表达更干净。`
  },
  {
    label: "扩写",
    instruction: `${selectionEditRules}任务：围绕选中内容适度扩写到原文约 1.5-2 倍，补足读者理解所需的背景、解释、转折或感受。不要凭空编造具体数据、行程、人物或事件。`
  },
  {
    label: "查错",
    instruction: `${selectionEditRules}任务：只修正错别字、病句、标点、语序和明显不自然表达。不要改变原意，不要扩写，不要改成另一种文风。`
  }
];

const imageActions = [
  {
    label: "生成说明",
    instruction: "只处理当前选中的图片：根据图片、图片 alt 和上下文，生成一句适合微信公众号正文的 figcaption 图片说明。只修改当前图片的 figcaption，不改正文其他内容。"
  },
  {
    label: "按图写段",
    instruction: "参考当前选中的图片和上下文，在图片后面补一小段适合微信公众号阅读的正文。不要改动图片本身，不要新增其他图片。"
  },
  {
    label: "换图建议",
    instruction: "只参考当前选中的图片和文章上下文，给出一个更合适的配图方向，并在当前图片的 figcaption 中写成具体换图建议。不要改正文其他内容。"
  }
];

const layoutTemplates = [
  {
    name: "开头导语",
    html: "<p><strong>先说结论：</strong>这里写一句能把读者拉进来的判断。</p><p>再用一两句话解释为什么这个话题值得继续看。</p>"
  },
  {
    name: "重点提示",
    html: "<blockquote>这里放一个关键观点、金句、提醒或总结。</blockquote>"
  },
  {
    name: "步骤清单",
    html: "<ol><li>第一步，写清楚要做什么。</li><li>第二步，补充原因或方法。</li><li>第三步，给出可执行结论。</li></ol>"
  }
];

function htmlToText(html = ""): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value = ""): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function placeholderFigure(title = "配图占位", subtitle = "发布前替换为正式图片"): string {
  return `<figure><img src="/api/placeholder-image?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(subtitle)}" alt="${escapeHtml(title)}"><figcaption>${escapeHtml(subtitle)}</figcaption></figure><p><br></p>`;
}

function parseSseBlock(block: string): StreamEvent | null {
  const eventLines = block.split(/\r?\n/);
  const event = eventLines.find((line) => line.startsWith("event:"))?.replace(/^event:\s*/, "").trim() || "message";
  const data = eventLines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}

function appendTraceItem(setter: React.Dispatch<React.SetStateAction<string[]>>, message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return;
  setter((items) => {
    if (items.at(-1) === clean) return items;
    return [...items, clean].slice(-12);
  });
}

function describeSelection(selectedText: string, selectedHtml: string, target: EditorSelection["target"] = "body"): EditorSelection {
  const holder = document.createElement("div");
  holder.innerHTML = selectedHtml;
  const image = holder.querySelector("img");
  const hasElement = holder.children.length > 0;
  const text = selectedText.trim();
  if (image && !text) {
    return {
      selectedText: image.getAttribute("alt") || image.getAttribute("src") || "图片",
      selectedHtml,
      kind: "image",
      label: "图片",
      target,
      imageSrc: image.getAttribute("src") || undefined
    };
  }
  if (image || hasElement) {
    return {
      selectedText: text || htmlToText(selectedHtml) || "选中的内容",
      selectedHtml,
      kind: image ? "mixed" : "text",
      label: image ? "图文内容" : "富文本",
      target,
      imageSrc: image?.getAttribute("src") || undefined
    };
  }
  return {
    selectedText: text,
    selectedHtml,
    kind: "text",
    label: target === "title" ? "标题文字" : "文字",
    target
  };
}

function legacyBlocksToHtml(article: ArticleDocument): string {
  if (article.contentHtml) return article.contentHtml;
  return (article.blocks ?? [])
    .map((block) => {
      if (block.type === "heading") return `<h2>${block.text ?? ""}</h2>`;
      if (block.type === "quote") return `<blockquote>${block.text ?? ""}</blockquote>`;
      if (block.type === "image") return `<figure><img src="${block.src ?? ""}" alt="${block.alt ?? ""}"><figcaption>${block.caption ?? ""}</figcaption></figure>`;
      if (block.type === "list") return `<ul>${(block.items ?? []).map((item) => `<li>${item}</li>`).join("")}</ul>`;
      if (block.type === "divider") return `<hr>`;
      if (block.type === "callout") return `<blockquote>${block.text ?? ""}</blockquote>`;
      return `<p>${block.text ?? ""}</p>`;
    })
    .join("\n");
}

function App() {
  const [state, setState] = useState<ApiState | null>(null);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [insertPrompt, setInsertPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [codexImageGuide, setCodexImageGuide] = useState<{ prompt: string; path: string } | null>(null);
  const [codexCopyState, setCodexCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [useArticleContextForSelection, setUseArticleContextForSelection] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showCustomBox, setShowCustomBox] = useState(false);
  const [showInsertBox, setShowInsertBox] = useState(false);
  const [showImageBox, setShowImageBox] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiTrace, setAiTrace] = useState<string[]>([]);
  const [traceCollapsed, setTraceCollapsed] = useState(false);
  const [selectionRects, setSelectionRects] = useState<SelectionRect[]>([]);
  const paperRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageReplace = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const traceCollapseTimer = useRef<number | null>(null);
  const highlightedRange = useRef<Range | null>(null);
  const lastSelectionSnapshot = useRef<BodySelectionSnapshot | null>(null);
  const lastCaretRange = useRef<Range | null>(null);
  const lastCaretSnapshot = useRef<CaretSnapshot | null>(null);
  const lastInsertTarget = useRef<InsertTarget>("body");
  const lastTitleCaret = useRef(0);
  const selectionTimer = useRef<number | null>(null);
  const suppressSelectionUntil = useRef(0);
  const suppressLoadUntil = useRef(0);

  function saveCaretState() {
    const payload: StoredCaretState = {
      target: lastInsertTarget.current,
      titleOffset: lastTitleCaret.current,
      bodySnapshot: lastCaretSnapshot.current
    };
    window.localStorage.setItem(caretStorageKey, JSON.stringify(payload));
  }

  function restoreCaretState(): StoredCaretState | null {
    const raw = window.localStorage.getItem(caretStorageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredCaretState>;
      if (parsed.target !== "title" && parsed.target !== "body") return null;
      lastInsertTarget.current = parsed.target;
      if (typeof parsed.titleOffset === "number") {
        lastTitleCaret.current = Math.max(0, parsed.titleOffset);
      }
      if (parsed.bodySnapshot && Array.isArray(parsed.bodySnapshot.path) && typeof parsed.bodySnapshot.offset === "number") {
        lastCaretSnapshot.current = {
          path: parsed.bodySnapshot.path.filter((item) => Number.isInteger(item) && item >= 0),
          offset: Math.max(0, parsed.bodySnapshot.offset)
        };
      }
      return {
        target: lastInsertTarget.current,
        titleOffset: lastTitleCaret.current,
        bodySnapshot: lastCaretSnapshot.current
      };
    } catch {
      return null;
    }
  }

  async function load() {
    const res = await fetch("/api/article");
    const next = (await res.json()) as ApiState;
    setState(next);
    if (!isEditing && Date.now() >= suppressLoadUntil.current && editorRef.current) {
      editorRef.current.innerHTML = legacyBlocksToHtml(next.article);
    }
  }

  useEffect(() => {
    restoreCaretState();
    load();
    const timer = window.setInterval(() => {
      if (!isEditing) void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isEditing]);

  useEffect(() => {
    if (state && editorRef.current && !editorRef.current.innerHTML.trim()) {
      editorRef.current.innerHTML = legacyBlocksToHtml(state.article);
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (traceCollapseTimer.current) window.clearTimeout(traceCollapseTimer.current);
      if (selectionTimer.current) window.clearTimeout(selectionTimer.current);
    };
  }, []);

  async function persist(article: ArticleDocument) {
    await fetch("/api/article", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article })
    });
    const res = await fetch("/api/article");
    setState(await res.json());
  }

  function scheduleSave(article: ArticleDocument) {
    setState((prev) => (prev ? { ...prev, article } : prev));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(article), 450);
  }

  function updateArticle(patch: Partial<ArticleDocument>) {
    if (!state) return;
    scheduleSave({ ...state.article, ...patch });
  }

  function rememberTitleCaret(target: HTMLInputElement) {
    lastInsertTarget.current = "title";
    lastTitleCaret.current = target.selectionEnd ?? target.value.length;
    saveCaretState();
  }

  function normalizeEditorStructure() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll("figure").forEach((figure) => {
      const movable: Node[] = [];
      figure.childNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) return;
        if (node instanceof HTMLElement && node.tagName.toLowerCase() === "figcaption") return;
        if (node.textContent?.trim() || node instanceof HTMLElement) movable.push(node);
      });
      movable.reverse().forEach((node) => {
        const wrapper = node instanceof HTMLElement && ["p", "div", "section", "blockquote", "ul", "ol", "h2", "h3"].includes(node.tagName.toLowerCase())
          ? node
          : document.createElement("p");
        if (wrapper !== node) wrapper.appendChild(node);
        figure.after(wrapper);
      });
    });
  }

  function saveEditorHtml() {
    if (!state || !editorRef.current) return;
    normalizeEditorStructure();
    const contentHtml = editorRef.current.innerHTML;
    scheduleSave({ ...state.article, contentHtml, blocks: [] });
  }

  function paintPersistentSelection(range: Range) {
    highlightedRange.current = range.cloneRange();
    saveBodySelectionSnapshot(range);
    const paper = paperRef.current;
    if (paper) {
      const paperBox = paper.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
      const rects = (clientRects.length > 0 ? clientRects : [range.getBoundingClientRect()])
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          top: rect.top - paperBox.top,
          left: rect.left - paperBox.left,
          width: rect.width,
          height: rect.height
        }));
      setSelectionRects(rects);
    }
    if (CSS.highlights && window.Highlight) {
      CSS.highlights.set("wx-editor-selection", new window.Highlight(highlightedRange.current));
    }
  }

  function saveBodySelectionSnapshot(range: Range) {
    const editor = editorRef.current;
    const startPath = editor ? getNodePath(editor, range.startContainer) : null;
    const endPath = editor ? getNodePath(editor, range.endContainer) : null;
    if (startPath && endPath) {
      lastSelectionSnapshot.current = {
        start: { path: startPath, offset: range.startOffset },
        end: { path: endPath, offset: range.endOffset }
      };
    }
  }

  function caretRangeFromPoint(x: number, y: number): Range | null {
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) return null;
      if (position.offsetNode === editorRef.current && position.offset === 0) return null;
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    const range = window.caretRangeFromPoint?.(x, y) ?? null;
    if (range?.startContainer === editorRef.current && range.startOffset === 0) return null;
    return range;
  }

  function getNodePath(root: Node, node: Node): number[] | null {
    const path: number[] = [];
    let current: Node | null = node;
    while (current && current !== root) {
      const parent: Node | null = current.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return current === root ? path : null;
  }

  function nodeFromPath(root: Node, path: number[]): Node | null {
    let current: Node | null = root;
    for (const index of path) {
      current = current?.childNodes[index] ?? null;
      if (!current) return null;
    }
    return current;
  }

  function rangeFromCaretSnapshot(): Range | null {
    const editor = editorRef.current;
    const snapshot = lastCaretSnapshot.current;
    if (!editor || !snapshot) return null;
    const node = nodeFromPath(editor, snapshot.path);
    if (!node) return null;
    const maxOffset = node.nodeType === Node.TEXT_NODE
      ? (node.textContent ?? "").length
      : node.childNodes.length;
    const range = document.createRange();
    range.setStart(node, Math.min(snapshot.offset, maxOffset));
    range.collapse(true);
    return range;
  }

  function rangeFromBodySelectionSnapshot(): Range | null {
    const editor = editorRef.current;
    const snapshot = lastSelectionSnapshot.current;
    if (!editor || !snapshot) return null;
    const startNode = nodeFromPath(editor, snapshot.start.path);
    const endNode = nodeFromPath(editor, snapshot.end.path);
    if (!startNode || !endNode) return null;
    const startMax = startNode.nodeType === Node.TEXT_NODE
      ? (startNode.textContent ?? "").length
      : startNode.childNodes.length;
    const endMax = endNode.nodeType === Node.TEXT_NODE
      ? (endNode.textContent ?? "").length
      : endNode.childNodes.length;
    const range = document.createRange();
    try {
      range.setStart(startNode, Math.min(snapshot.start.offset, startMax));
      range.setEnd(endNode, Math.min(snapshot.end.offset, endMax));
      if (range.collapsed) return null;
      return range;
    } catch {
      return null;
    }
  }

  function updateCaretAnchor(range: Range) {
    const editor = editorRef.current;
    if (!editor?.contains(range.commonAncestorContainer)) return;
    lastInsertTarget.current = "body";
    lastCaretRange.current = range.cloneRange();
    const path = getNodePath(editor, range.startContainer);
    if (path) {
      lastCaretSnapshot.current = { path, offset: range.startOffset };
      saveCaretState();
    }
  }

  function rememberCaretFromSelection() {
    const activeSelection = window.getSelection();
    if (!activeSelection || activeSelection.rangeCount === 0 || !activeSelection.isCollapsed) return;
    updateCaretAnchor(activeSelection.getRangeAt(0));
  }

  function rememberCaretFromPointer(event: React.MouseEvent<HTMLDivElement>) {
    window.setTimeout(() => {
      const activeSelection = window.getSelection();
      if (activeSelection && activeSelection.rangeCount > 0) {
        const activeRange = activeSelection.getRangeAt(0);
        if (editorRef.current?.contains(activeRange.commonAncestorContainer)) {
          if (!activeSelection.isCollapsed) return;
          updateCaretAnchor(activeRange);
          return;
        }
      }
      const range = caretRangeFromPoint(event.clientX, event.clientY);
      if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
        updateCaretAnchor(range);
        return;
      }
      rememberCaretFromSelection();
    }, 0);
  }

  function clearStoredSelection(removeNativeSelection = true) {
    suppressSelectionUntil.current = Date.now() + 500;
    if (selectionTimer.current) {
      window.clearTimeout(selectionTimer.current);
      selectionTimer.current = null;
    }
    setSelection(null);
    setSelectionRects([]);
    setShowCustomBox(false);
    setShowInsertBox(false);
    setShowImageBox(false);
    highlightedRange.current = null;
    lastSelectionSnapshot.current = null;
    if (removeNativeSelection) window.getSelection()?.removeAllRanges();
    if (CSS.highlights) CSS.highlights.delete("wx-editor-selection");
  }

  function clearSelection() {
    clearStoredSelection(true);
  }

  function handleEditorInput() {
    clearStoredSelection(false);
    saveEditorHtml();
    window.setTimeout(rememberCaretFromSelection, 0);
  }

  function handleTitleChange(event: React.ChangeEvent<HTMLInputElement>) {
    rememberTitleCaret(event.currentTarget);
    clearStoredSelection(false);
    updateArticle({ title: event.target.value });
  }

  function captureSelection() {
    if (Date.now() < suppressSelectionUntil.current) return;
    const activeSelection = window.getSelection();
    if (!activeSelection || activeSelection.rangeCount === 0) {
      return;
    }
    const range = activeSelection.getRangeAt(0);
    if (activeSelection.isCollapsed) {
      updateCaretAnchor(range);
      return;
    }
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return;
    const fragment = range.cloneContents();
    const holder = document.createElement("div");
    holder.appendChild(fragment);
    paintPersistentSelection(range);
    const endRange = range.cloneRange();
    endRange.collapse(false);
    updateCaretAnchor(endRange);
    setSelection(describeSelection(activeSelection.toString(), holder.innerHTML));
  }

  function captureTitleSelection(event: React.SyntheticEvent<HTMLInputElement>) {
    const target = event.currentTarget;
    rememberTitleCaret(target);
    const selectedText = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
    if (!selectedText.trim()) return;
    setSelection(describeSelection(selectedText, escapeHtml(selectedText), "title"));
  }

  function captureClickedObject(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const selectedElement = target.closest("figure, img");
    if (!selectedElement || !editorRef.current?.contains(selectedElement)) return;
    const html = selectedElement instanceof HTMLImageElement ? selectedElement.outerHTML : selectedElement.outerHTML;
    const range = document.createRange();
    range.selectNode(selectedElement);
    paintPersistentSelection(range);
    setSelection(describeSelection(selectedElement.textContent ?? "", html));
  }

  function selectedFigureElement(): HTMLElement | null {
    const editor = editorRef.current;
    const range = rangeFromBodySelectionSnapshot() ?? highlightedRange.current;
    if (!editor || !range) return null;
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer as Element
      : range.commonAncestorContainer.parentElement;
    const fromContainer = container?.closest("figure") as HTMLElement | null;
    if (fromContainer && editor.contains(fromContainer)) return fromContainer;
    const selectedNode = range.startContainer.childNodes[range.startOffset];
    if (selectedNode instanceof HTMLElement) {
      const figure = selectedNode.matches("figure") ? selectedNode : selectedNode.closest("figure");
      if (figure && editor.contains(figure)) return figure as HTMLElement;
    }
    const fragment = range.cloneContents();
    if (fragment.querySelector?.("figure, img")) {
      const image = editor.querySelector("figure img");
      return image?.closest("figure") as HTMLElement | null;
    }
    return null;
  }

  function updateSelectedFigure(mutator: (figure: HTMLElement) => void) {
    const figure = selectedFigureElement();
    if (!figure) return;
    mutator(figure);
    const range = document.createRange();
    range.selectNode(figure);
    paintPersistentSelection(range);
    setSelection(describeSelection(figure.textContent ?? "", figure.outerHTML));
    saveEditorHtml();
  }

  function setSelectedImageWidth(width: number) {
    updateSelectedFigure((figure) => {
      figure.style.width = width >= 100 ? "" : `${width}%`;
      figure.style.marginLeft = "auto";
      figure.style.marginRight = "auto";
      const image = figure.querySelector("img");
      if (image) {
        image.style.width = "100%";
        image.style.maxWidth = "100%";
      }
    });
  }

  function alignSelectedImage(alignment: "left" | "center" | "right") {
    updateSelectedFigure((figure) => {
      figure.style.marginLeft = alignment === "right" ? "auto" : "0";
      figure.style.marginRight = alignment === "left" ? "auto" : "0";
      if (alignment === "center") {
        figure.style.marginLeft = "auto";
        figure.style.marginRight = "auto";
      }
    });
  }

  function resetSelectedImageFormat() {
    updateSelectedFigure((figure) => {
      figure.style.width = "";
      figure.style.marginLeft = "";
      figure.style.marginRight = "";
      figure.style.textAlign = "";
      const image = figure.querySelector("img");
      if (image) {
        image.removeAttribute("style");
      }
    });
  }

  function updateSelectedImageCaption() {
    const current = selectedFigureElement()?.querySelector("figcaption")?.textContent ?? "";
    const caption = window.prompt("请输入图片说明", current);
    if (caption === null) return;
    updateSelectedFigure((figure) => {
      let figcaption = figure.querySelector("figcaption");
      if (!figcaption) {
        figcaption = document.createElement("figcaption");
        figure.appendChild(figcaption);
      }
      figcaption.textContent = caption.trim();
    });
  }

  function replaceSelectedImage() {
    if (!selectedFigureElement()) return;
    pendingImageReplace.current = true;
    imageInputRef.current?.click();
  }

  function deleteSelectedFigure() {
    const figure = selectedFigureElement();
    if (!figure) return;
    const next = figure.nextSibling;
    const parent = figure.parentNode;
    figure.remove();
    if (parent && !next) {
      parent.appendChild(document.createElement("p")).appendChild(document.createElement("br"));
    }
    clearSelection();
    saveEditorHtml();
  }

  function isImageInstruction(instruction: string): boolean {
    return /(配图|加图|插图|图片|封面|image|illustration)/i.test(instruction);
  }

  function focusAiResult(next: ApiState, shouldFallbackToFigure: boolean): ArticleDocument {
    const editor = editorRef.current;
    if (!editor) return next.article;
    const marked = editor.querySelector("[data-ai-result]") as HTMLElement | null;
    const fallbackFigure = shouldFallbackToFigure ? editor.querySelector("figure:last-of-type") as HTMLElement | null : null;
    const resultElement = marked ?? fallbackFigure;
    if (!resultElement) return next.article;

    const range = document.createRange();
    range.selectNode(resultElement);
    paintPersistentSelection(range);
    setSelection(describeSelection(resultElement.textContent ?? "", resultElement.outerHTML));

    editor.querySelectorAll("[data-ai-result]").forEach((element) => {
      element.removeAttribute("data-ai-result");
    });
    editor.querySelectorAll("[data-ai-insert-anchor]").forEach((element) => {
      element.remove();
    });
    return { ...next.article, contentHtml: editor.innerHTML, blocks: [] };
  }

  function removeInsertAnchors() {
    editorRef.current?.querySelectorAll("[data-ai-insert-anchor]").forEach((element) => {
      element.remove();
    });
  }

  useEffect(() => {
    const syncSelection = () => {
      if (Date.now() < suppressSelectionUntil.current) return;
      if (selectionTimer.current) window.clearTimeout(selectionTimer.current);
      selectionTimer.current = window.setTimeout(captureSelection, 80);
    };
    document.addEventListener("selectionchange", syncSelection);
    return () => {
      if (selectionTimer.current) window.clearTimeout(selectionTimer.current);
      document.removeEventListener("selectionchange", syncSelection);
    };
  }, []);

  function restoreBodyCommandRange(preferSelection = true) {
    const editor = editorRef.current;
    if (!editor) return false;
    const range = preferSelection && highlightedRange.current
      ? rangeFromBodySelectionSnapshot() ?? highlightedRange.current.cloneRange()
      : rangeFromCaretSnapshot() ?? lastCaretRange.current?.cloneRange();
    if (!range || !editor.contains(range.commonAncestorContainer)) return false;
    editor.focus();
    const activeSelection = window.getSelection();
    activeSelection?.removeAllRanges();
    activeSelection?.addRange(range);
    return true;
  }

  function runFormat(command: string, value?: string, preferSelection = true) {
    if (command === "removeFormat" && selectedFigureElement()) {
      resetSelectedImageFormat();
      return;
    }
    const restoredRange = preferSelection ? rangeFromBodySelectionSnapshot() : null;
    if (!restoreBodyCommandRange(preferSelection)) editorRef.current?.focus();
    document.execCommand(command, false, value);
    saveEditorHtml();
    const activeSelection = window.getSelection();
    if (activeSelection && activeSelection.rangeCount > 0 && !activeSelection.isCollapsed && editorRef.current?.contains(activeSelection.getRangeAt(0).commonAncestorContainer)) {
      const range = activeSelection.getRangeAt(0);
      paintPersistentSelection(range);
      const fragment = range.cloneContents();
      const holder = document.createElement("div");
      holder.appendChild(fragment);
      setSelection(describeSelection(activeSelection.toString(), holder.innerHTML));
      return;
    }
    if (preferSelection && restoredRange && editorRef.current?.contains(restoredRange.commonAncestorContainer)) {
      const selectionAfterCommand = window.getSelection();
      selectionAfterCommand?.removeAllRanges();
      selectionAfterCommand?.addRange(restoredRange);
      paintPersistentSelection(restoredRange);
      const fragment = restoredRange.cloneContents();
      const holder = document.createElement("div");
      holder.appendChild(fragment);
      setSelection(describeSelection(restoredRange.toString(), holder.innerHTML));
      return;
    }
    captureSelection();
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const isMod = event.metaKey || event.ctrlKey;
    if (!isMod || event.altKey) return;
    const key = event.key.toLowerCase();
    const command = key === "b"
      ? "bold"
      : key === "i"
        ? "italic"
        : key === "u"
          ? "underline"
          : key === "z" && event.shiftKey
            ? "redo"
            : key === "z"
              ? "undo"
              : key === "y"
                ? "redo"
                : "";
    if (!command) return;
    event.preventDefault();
    captureSelection();
    runFormat(command, undefined, command !== "undo" && command !== "redo");
  }

  function insertHtml(html: string) {
    runFormat("insertHTML", html, false);
  }

  function placeInsertAnchor() {
    const editor = editorRef.current;
    if (!editor) return false;
    restoreCaretState();
    removeInsertAnchors();
    const anchor = document.createElement("span");
    anchor.setAttribute("data-ai-insert-anchor", "true");
    anchor.textContent = "";
    const restoredBeforeInsert = rangeFromCaretSnapshot();
    const range = restoredBeforeInsert?.cloneRange() ?? lastCaretRange.current?.cloneRange() ?? document.createRange();
    if (!lastCaretRange.current || !editor.contains(range.commonAncestorContainer)) {
      const restoredRange = rangeFromCaretSnapshot();
      if (restoredRange && editor.contains(restoredRange.commonAncestorContainer)) {
        range.setStart(restoredRange.startContainer, restoredRange.startOffset);
        range.collapse(true);
      } else {
        range.selectNodeContents(editor);
        range.collapse(false);
      }
    }
    if (range.startContainer === editor && range.startOffset === 0 && editor.childNodes.length > 0) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.insertNode(anchor);
    range.setStartAfter(anchor);
    range.collapse(true);
    lastCaretRange.current = range.cloneRange();
    saveEditorHtml();
    return true;
  }

  function insertImageSlot() {
    insertHtml(placeholderFigure());
  }

  function chooseLocalImage() {
    pendingImageReplace.current = false;
    restoreBodyCommandRange(false);
    rememberCaretFromSelection();
    saveCaretState();
    imageInputRef.current?.click();
  }

  function insertLink() {
    const url = window.prompt("请输入链接地址");
    if (!url?.trim()) return;
    runFormat("createLink", url.trim());
  }

  function insertLocalImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (!src) return;
      if (pendingImageReplace.current) {
        pendingImageReplace.current = false;
        updateSelectedFigure((figure) => {
          const image = figure.querySelector("img");
          if (image) {
            image.src = src;
            image.alt = file.name;
          }
        });
        if (imageInputRef.current) imageInputRef.current.value = "";
        return;
      }
      insertHtml(`<figure><img src="${src}" alt="${escapeHtml(file.name)}"><figcaption>${escapeHtml(file.name)}</figcaption></figure><p><br></p>`);
      if (imageInputRef.current) imageInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }

  async function submitAiRequest(instruction: string, options: { useInsertAnchor?: boolean; allowImageGeneration?: boolean; operation?: "edit" | "insert" | "title-insert"; titleInsertIndex?: number; contextMode?: "article-context" | "selection-only" } = {}) {
    if (!state || !instruction.trim()) return;
    if (options.useInsertAnchor && !placeInsertAnchor()) return;
    setIsAiRunning(true);
    setNotice("");
    setTraceCollapsed(false);
    if (traceCollapseTimer.current) window.clearTimeout(traceCollapseTimer.current);
    setAiTrace([
      `本次操作：${instruction.replace(/^只处理当前选区：/, "").slice(0, 80)}`,
      options.operation === "insert"
        ? "已读取自由编辑区最后停留的光标位置"
        : options.operation === "title-insert"
          ? "已读取标题最后停留的光标位置"
        : selection ? `已读取当前选区：${selection.label}` : "未检测到选区，将按全文处理",
      "正在调用本机 Codex..."
    ]);
    const contentHtml = editorRef.current?.innerHTML ?? state.article.contentHtml ?? "";
    const payload = {
      articleTitle: state.article.title,
      digest: state.article.digest,
      contentHtml,
      selectedText: selection?.selectedText ?? "",
      selectedHtml: selection?.selectedHtml ?? "",
      selectionTarget: selection?.target ?? "body",
      operation: options.operation ?? "edit",
      titleInsertIndex: options.titleInsertIndex,
      instruction: instruction.trim(),
      contextMode: options.contextMode ?? (selection ? (useArticleContextForSelection ? "article-context" : "selection-only") : "article-context"),
      allowImageGeneration: options.allowImageGeneration
    };
    try {
      const direct = await fetch("/api/ai/apply-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!direct.ok || !direct.body) {
        throw new Error(direct.statusText || "AI stream unavailable.");
      }
      const reader = direct.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (!completed) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const blocks = buffer.split(/\n\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (!parsed) continue;
          if (parsed.event === "trace") {
            const message = typeof parsed.data === "object" && parsed.data && "message" in parsed.data
              ? String((parsed.data as { message?: unknown }).message ?? "")
              : String(parsed.data);
            appendTraceItem(setAiTrace, message);
          }
          if (parsed.event === "done") {
            const next = parsed.data as ApiState;
            setState(next);
            if (editorRef.current) {
              editorRef.current.innerHTML = next.article.contentHtml ?? "";
              const cleanArticle = focusAiResult(next, isImageInstruction(instruction));
              if (cleanArticle.contentHtml !== next.article.contentHtml) {
                setState((prev) => (prev ? { ...prev, article: cleanArticle } : prev));
                void persist(cleanArticle);
              }
            }
            setCustomPrompt("");
            setInsertPrompt("");
            setImagePrompt("");
            setShowCustomBox(false);
            setShowInsertBox(false);
            setShowImageBox(false);
            appendTraceItem(setAiTrace, "完成，已回填到文章。");
            completed = true;
          }
          if (parsed.event === "error") {
            const errorMessage = typeof parsed.data === "object" && parsed.data && "error" in parsed.data
              ? String((parsed.data as { error?: unknown }).error ?? "")
              : String(parsed.data);
            throw new Error(errorMessage || "AI 处理失败。");
          }
        }
        if (done) completed = true;
      }
      traceCollapseTimer.current = window.setTimeout(() => setTraceCollapsed(true), 1800);
    } catch (error) {
      await fetch("/api/ai-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const message = error instanceof Error ? error.message : "Unknown AI error";
      const errorMessage = message.includes("OPENAI_API_KEY") || message.includes("login") || message.includes("auth")
        ? "Codex 直连不可用。请先运行 codex login 登录；请求已保存为 fallback。"
        : `AI 处理失败：${message}`;
      removeInsertAnchors();
      appendTraceItem(setAiTrace, errorMessage);
    } finally {
      setIsAiRunning(false);
    }
  }

  function buildCustomInstruction(userPrompt: string): string {
    const scopeRule = selection
      ? "默认只处理当前选区；除非用户明确要求全文、标题或摘要，否则不要改选区外内容。"
      : "当前没有选区；请按用户要求处理全文或在合适位置补充内容，但不要无关重写。";
    const contextRule = selection ? selectionContextRules(useArticleContextForSelection) : "当前没有选区；请读取全文并按用户要求选择合理作用范围。";
    const mediaRule = isImageInstruction(userPrompt)
      ? "用户要求涉及图片时，可以插入 figure；图片说明要具体、克制，图片不要有文字、水印、二维码或公众号界面。"
      : "用户没有明确要求图片时，不要插入 figure、img、封面或配图。";
    return [
      "自定义编辑请求。",
      contextRule,
      scopeRule,
      "优先满足用户的直接要求；如果要求不完整，按微信公众号正文编辑的常规做最小必要修改。",
      "保留事实、数字、时间、地点和作者基本语气，不编造材料。",
      "尽量保留现有 HTML 结构，只在必要时调整段落、强调或列表。",
      mediaRule,
      `用户要求：${userPrompt.trim()}`
    ].join("");
  }

  async function requestCodexImagegen() {
    if (!state) return;
    const contentHtml = editorRef.current?.innerHTML ?? state.article.contentHtml ?? "";
    const res = await fetch("/api/imagegen-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: imagePrompt.trim(),
        selectedText: selection?.selectedText ?? "",
        selectedHtml: selection?.selectedHtml ?? "",
        selectionTarget: selection?.target ?? "body",
        contentHtml
      })
    });
    const result = await res.json() as { codexPrompt?: string; imageRequestPath?: string };
    const codexPrompt = result.codexPrompt || "请处理 wx-edit 的最新配图请求，使用 imagegen skill 生成图片，保存到 .wx-editor/assets，并插入文章。";
    const imageRequestPath = result.imageRequestPath ?? ".wx-editor/image-request.json";
    setShowImageBox(false);
    setImagePrompt("");
    setCodexImageGuide({ prompt: codexPrompt, path: imageRequestPath });
    setCodexCopyState("idle");
    setNotice("已生成 Codex 生图请求。请按下方步骤回到 Codex 对话处理。");
    appendTraceItem(setAiTrace, "Codex 生图请求已准备好，等待你回到 Codex 对话处理。");
  }

  async function copyCodexImagePrompt(prompt: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = prompt;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCodexCopyState("copied");
      setNotice("已复制。回到 Codex 对话窗口粘贴发送即可。");
    } catch {
      setCodexCopyState("failed");
      setNotice("复制失败。请手动选中卡片里的指令复制到 Codex。");
    }
  }

  function submitInsertRequest() {
    const text = insertPrompt.trim();
    if (!text) return;
    restoreCaretState();
    const insertTarget = lastInsertTarget.current;
    const wantsInsertedImage = isImageInstruction(text);
    const mediaRule = wantsInsertedImage
      ? "用户明确要求图片/配图，可以生成或插入 figure；图片不要有文字、水印、二维码或公众号界面。"
      : "用户没有明确要求图片，必须只插入文字内容，不要插入 figure、img、封面或配图。";
    if (insertTarget === "title") {
      void submitAiRequest(
        [
          "AI 标题插入请求。只生成要插入到标题光标位置的纯文本，不改写现有标题其他部分、正文或摘要。",
          "文本要适合微信公众号标题，短、清楚、有信息量，不要 HTML、Markdown、引号、编号或解释。",
          "标题不能插图；如果用户要求图片，请改为生成一句适合标题的文字提示，不要生成 figure 或 img。",
          `用户要求：${text}`
        ].join(""),
        { allowImageGeneration: false, operation: "title-insert", titleInsertIndex: lastTitleCaret.current }
      );
      return;
    }
    void submitAiRequest(
      [
        "AI 插入请求。只生成要插入到光标位置的新内容，不改写现有正文、标题或摘要。",
        "内容要适合微信公众号手机端阅读，段落短一些，表达自然，不要营销腔。",
        "如果用户要求字数，请尽量贴近字数；如果用户要求列表、标题、图片或其他结构，请按要求生成对应 HTML。",
        "不编造具体事实、数据、人物或时间；需要补充时用通用表述。",
        mediaRule,
        "插入的新区域必须带 data-ai-result=\"true\"。",
        `用户要求：${text}`
      ].join(""),
      { useInsertAnchor: true, allowImageGeneration: wantsInsertedImage, operation: "insert" }
    );
  }

  async function copyHtml() {
    if (!state) return;
    saveEditorHtml();
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    const res = await fetch("/api/article");
    const latest = (await res.json()) as ApiState;
    await navigator.clipboard.writeText(latest.html);
    await fetch("/api/export", { method: "POST" });
    setNotice("已复制微信兼容 HTML，并导出到 .wx-editor。");
  }

  if (!state) {
    return <main className="loading">正在启动公众号 AI 编辑器...</main>;
  }

  const selectionHandle = selectionRects.length > 0
    ? selectionRects[0]
    : null;

  return (
    <main className="workspace">
      <header className="appbar">
        <div className="brand">
          <WandSparkles size={22} />
          <div>
            <h1>公众号AI心流写作台</h1>
            <p>像普通编辑器一样自由写作，选中哪里就让 Codex 改哪里</p>
          </div>
        </div>
        <div className="topActions">
          <button onClick={load} title="刷新">
            <RefreshCw size={17} />
          </button>
          <button onClick={copyHtml}>
            <Clipboard size={17} />
            <span>复制到公众号</span>
          </button>
          <button onClick={() => fetch("/api/export", { method: "POST" }).then(() => setNotice("已导出 HTML 和 Markdown。"))}>
            <Download size={17} />
            <span>导出</span>
          </button>
        </div>
      </header>

      <section className="studio">
        <aside
          className="toolRail"
          onPointerDown={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest("button")) {
              suppressLoadUntil.current = Date.now() + 800;
              event.preventDefault();
            }
          }}
          onMouseDown={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest("button")) {
              suppressLoadUntil.current = Date.now() + 800;
              event.preventDefault();
            }
          }}
        >
          <div className="railHelp">选中文字后点样式；插入类放到最后光标处</div>
          <div className="railSection">
            <span>段落格式</span>
            <button title="正文" onClick={() => runFormat("formatBlock", "p")}><Pilcrow size={17} /></button>
            <button title="小标题" onClick={() => runFormat("formatBlock", "h2")}><Heading2 size={17} /></button>
            <button title="三级标题" onClick={() => runFormat("formatBlock", "h3")}><Heading3 size={17} /></button>
            <button title="引用" onClick={() => runFormat("formatBlock", "blockquote")}><Quote size={17} /></button>
            <button title="无序列表" onClick={() => runFormat("insertUnorderedList")}><List size={17} /></button>
            <button title="有序列表" onClick={() => runFormat("insertOrderedList")}><ListOrdered size={17} /></button>
          </div>
          <div className="railSection">
            <span>文字样式</span>
            <button title="加粗" onClick={() => runFormat("bold")}><Bold size={17} /></button>
            <button title="斜体" onClick={() => runFormat("italic")}><Italic size={17} /></button>
            <button title="下划线" onClick={() => runFormat("underline")}><Underline size={17} /></button>
            <button title="删除线" onClick={() => runFormat("strikeThrough")}><Strikethrough size={17} /></button>
            <button title="标注" onClick={() => runFormat("backColor", "#e7f5f2")}><Highlighter size={17} /></button>
            <button title="大字号" onClick={() => runFormat("fontSize", "4")}><Type size={17} /></button>
            <button title="清除格式" onClick={() => runFormat("removeFormat")}><Eraser size={17} /></button>
            <div className="railSwatches">
              {colorSwatches.map((color) => (
                <button key={color} title={color} style={{ background: color }} onClick={() => runFormat("foreColor", color)} />
              ))}
            </div>
          </div>
          <div className="railSection">
            <span>排版结构</span>
            <button title="撤销" onClick={() => runFormat("undo", undefined, false)}><Undo2 size={17} /></button>
            <button title="重做" onClick={() => runFormat("redo", undefined, false)}><Redo2 size={17} /></button>
            <button title="左对齐" onClick={() => runFormat("justifyLeft")}><AlignLeft size={17} /></button>
            <button title="居中" onClick={() => runFormat("justifyCenter")}><AlignCenter size={17} /></button>
            <button title="右对齐" onClick={() => runFormat("justifyRight")}><AlignRight size={17} /></button>
            <button title="减少缩进" onClick={() => runFormat("outdent")}><IndentDecrease size={17} /></button>
            <button title="增加缩进" onClick={() => runFormat("indent")}><IndentIncrease size={17} /></button>
            <button title="分隔线" onClick={() => runFormat("insertHorizontalRule")}><SeparatorHorizontal size={17} /></button>
            <button title="链接" onClick={insertLink}><Link size={17} /></button>
          </div>
          <div className="railSection insertSection">
            <span>插入到光标</span>
            <button title="本地图片" onClick={chooseLocalImage}>本地图片</button>
            {layoutTemplates.map((template) => (
              <button key={template.name} title={template.name} onClick={() => insertHtml(template.html)}>{template.name}</button>
            ))}
            <button title="图片占位" onClick={insertImageSlot}>图片占位</button>
            <input
              ref={imageInputRef}
              className="hiddenFile"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) insertLocalImage(file);
              }}
            />
          </div>
          {selection?.imageSrc && (
            <div className="railSection imageToolSection">
              <span>图片工具</span>
              <button onClick={() => setSelectedImageWidth(100)}>宽度 100%</button>
              <button onClick={() => setSelectedImageWidth(75)}>宽度 75%</button>
              <button onClick={() => setSelectedImageWidth(50)}>宽度 50%</button>
              <button onClick={() => alignSelectedImage("left")}>左对齐</button>
              <button onClick={() => alignSelectedImage("center")}>居中</button>
              <button onClick={() => alignSelectedImage("right")}>右对齐</button>
              <button onClick={resetSelectedImageFormat}>恢复默认</button>
              <button onClick={updateSelectedImageCaption}>修改说明</button>
              <button onClick={replaceSelectedImage}>替换图片</button>
              <button className="dangerButton" onClick={deleteSelectedFigure}>删除图片</button>
            </div>
          )}
        </aside>

        <section className="writingStage">
          <div className="paperToolbar">
            <span>自由编辑区</span>
            <small>左侧工具区只改变选中内容或光标位置</small>
          </div>
          <article className="paper" ref={paperRef}>
            {selectionRects.length > 0 && (
              <div className="persistentSelectionLayer">
                {selectionRects.map((rect, index) => (
                  <span
                    key={`${rect.top}-${rect.left}-${index}`}
                    style={{
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height
                    }}
                  />
                ))}
                {selectionHandle && (
                  <button
                    type="button"
                    className="persistentSelectionClear"
                    aria-label="取消选中"
                    title="取消选中"
                    style={{
                      top: Math.max(10, selectionHandle.top - 18),
                      left: Math.max(10, selectionHandle.left + selectionHandle.width - 8)
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      clearSelection();
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
            <input
              className="titleInput"
              value={state.article.title}
              placeholder="请输入公众号文章标题"
              onChange={handleTitleChange}
              onFocus={(event) => rememberTitleCaret(event.currentTarget)}
              onClick={(event) => rememberTitleCaret(event.currentTarget)}
              onSelect={captureTitleSelection}
              onMouseUp={captureTitleSelection}
              onKeyUp={captureTitleSelection}
            />
            <div className="articleMeta">
              <span>{state.article.author || "作者"}</span>
              <span>今天</span>
            </div>
            <div
              ref={editorRef}
              className="richEditor"
              contentEditable
              suppressContentEditableWarning
              onFocus={() => {
                setIsEditing(true);
                window.setTimeout(rememberCaretFromSelection, 0);
              }}
              onBlur={() => {
                setIsEditing(false);
                saveEditorHtml();
              }}
              onInput={handleEditorInput}
              onClick={(event) => {
                captureClickedObject(event);
                rememberCaretFromPointer(event);
              }}
              onMouseUp={(event) => {
                captureSelection();
                rememberCaretFromPointer(event);
              }}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={captureSelection}
              onPaste={() => window.setTimeout(handleEditorInput, 0)}
            />
          </article>
        </section>

        <aside className="aiDock">
          <section className="toolPanel aiPanel">
            <div className="panelHead">
              <Bot size={17} />
              <span>AI 辅助</span>
            </div>
            {selection ? (
              <div className={`focusBox selectedFocus ${selection.kind}`}>
                <div className="selectionMeta">
                  <strong>当前选中</strong>
                  <div className="selectionActions">
                    <span>{selection.label}</span>
                    <button
                      type="button"
                      title="取消选中"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        clearSelection();
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="selectionScope">{selection.target === "title" ? "作用区域：文章标题" : "作用区域：正文内容"}</div>
                <label className="contextToggle">
                  <input
                    type="checkbox"
                    checked={useArticleContextForSelection}
                    onChange={(event) => setUseArticleContextForSelection(event.target.checked)}
                  />
                  <span>
                    <strong>参考全文上下文</strong>
                    <small>{useArticleContextForSelection ? "结合标题和全文判断语气、衔接和重复，但只回填选区。" : "只按当前选区处理，全文仅用于定位回填。"}</small>
                  </span>
                </label>
                {selection.imageSrc && <img src={selection.imageSrc} alt="当前选中的图片" />}
                <p>{selection.selectedText || htmlToText(selection.selectedHtml) || "已选中一段富文本内容。"}</p>
              </div>
            ) : (
              <div className="focusBox emptySelection">
                <p>配图和 AI 插入随时可用；选中文字后可润色、缩短、扩写、查错。</p>
                <p>选中图片后可生成说明或按图补文。</p>
              </div>
            )}
            <div className="quickGrid">
              {(selection?.imageSrc ? imageActions : quickActions).map((action) => (
                <button
                  key={action.label}
                  disabled={isAiRunning || !selection}
                  onClick={() => {
                    void submitAiRequest(withSelectionContext(action.instruction, useArticleContextForSelection));
                  }}
                >
                  {action.label}
                </button>
              ))}
              <button
                disabled={isAiRunning}
                onClick={() => {
                  setShowCustomBox(false);
                  setShowInsertBox(false);
                  setShowImageBox((value) => !value);
                }}
              >
                配图
              </button>
              <button
                disabled={isAiRunning}
                onClick={() => {
                  setShowCustomBox(false);
                  setShowImageBox(false);
                  setShowInsertBox((value) => !value);
                }}
              >
                AI 插入
              </button>
              <button
                disabled={!selection}
                onClick={() => {
                  setShowImageBox(false);
                  setShowInsertBox(false);
                  setShowCustomBox((value) => !value);
                }}
              >
                自定义
              </button>
            </div>
            {showInsertBox && (
              <div className="promptPopover dockPrompt">
                <strong>AI 插入</strong>
                <p className="anchorHelp">
                  {selection ? "AI 会读取全文和当前选区作为参考，但不会替换选区；内容会插入到最后停留的标题或正文光标位置。" : "AI 会读取标题和正文全文，并把新内容插入到标题或正文最后停留的光标位置。"}
                </p>
                <textarea
                  rows={5}
                  value={insertPrompt}
                  placeholder="描述要新增的内容，例如：结合全文在这里补一段承上启下的过渡；给标题补一个更有吸引力的短语；在光标处插入三条冲绳水族馆游玩建议。"
                  onChange={(event) => setInsertPrompt(event.target.value)}
                />
                <div className="promptActions">
                  <button onClick={() => setShowInsertBox(false)}>取消</button>
                  <button className="primarySmall" disabled={isAiRunning || !insertPrompt.trim()} onClick={submitInsertRequest}>
                    插入到光标位置
                  </button>
                </div>
              </div>
            )}
            {showImageBox && (
              <div className="promptPopover dockPrompt">
                <strong>配图提示词</strong>
                <p className="anchorHelp">
                  {selection ? "会优先参考当前选区生成配图，并插入到选区附近。" : "无需选中文本；会参考全文和正文最后停留的光标附近内容生成配图。"}
                </p>
                <textarea
                  rows={5}
                  value={imagePrompt}
                  placeholder="可选。写出图片方向，例如：冲绳美丽海水族馆，蓝色巨型水槽，真实旅行摄影感，适合公众号正文配图，不要文字、水印、二维码。留空则由 AI 根据文章自动判断。"
                  onChange={(event) => setImagePrompt(event.target.value)}
                />
                <div className="promptActions">
                  <button onClick={() => setShowImageBox(false)}>取消</button>
                  <button className="primarySmall" disabled={isAiRunning} onClick={() => void requestCodexImagegen()}>
                    请求 Codex 生图
                  </button>
                </div>
              </div>
            )}
            {showCustomBox && (
              <>
                <label>
                  自定义要求
                  <textarea
                    rows={6}
                    value={customPrompt}
                    placeholder="只处理当前选中内容。比如：把这段改得更克制；把这段压缩到 80 字以内；把选中的小标题改得更有吸引力；给这张图写一句更自然的说明。"
                    onChange={(event) => setCustomPrompt(event.target.value)}
                  />
                </label>
                <button className="primary" disabled={isAiRunning || !customPrompt.trim()} onClick={() => void submitAiRequest(buildCustomInstruction(customPrompt), { allowImageGeneration: isImageInstruction(customPrompt) })}>
                  <MessageSquareText size={17} />
                  <span>{isAiRunning ? "处理中" : "提交自定义要求给ai"}</span>
                </button>
              </>
            )}
            {aiTrace.length > 0 && (
              <div className={`traceBox ${traceCollapsed ? "collapsed" : ""}`}>
                <button className="traceHeader" onClick={() => setTraceCollapsed((value) => !value)}>
                  <strong>AI 处理过程</strong>
                  <span>{traceCollapsed ? "展开" : "收起"}</span>
                </button>
                {traceCollapsed ? (
                  <p>{aiTrace.at(-1)}</p>
                ) : (
                  aiTrace.map((item, index) => (
                    <p key={`${item}-${index}`}>{item}</p>
                  ))
                )}
              </div>
            )}
            {notice && <div className="notice">{notice}</div>}
            {codexImageGuide && (
              <div className="codexGuide">
                <div className="codexGuideHeader">
                  <strong>下一步：让 Codex 生成并插入图片</strong>
                  <button aria-label="关闭 Codex 生图步骤" onClick={() => setCodexImageGuide(null)}>
                    <X size={15} />
                  </button>
                </div>
                <ol>
                  <li>回到当前这个 Codex 项目的对话窗口。</li>
                  <li>把下面这句话发给 Codex。</li>
                  <li>等待 Codex 生成图片并写回文章后，回到浏览器预览刷新查看。</li>
                </ol>
                <div className="codexPromptBox">{codexImageGuide.prompt}</div>
                <div className="codexGuideFooter">
                  <span title={codexImageGuide.path}>请求已保存到本地</span>
                  <button onClick={() => void copyCodexImagePrompt(codexImageGuide.prompt)}>
                    <Clipboard size={14} />
                    <span>{codexCopyState === "copied" ? "已复制" : codexCopyState === "failed" ? "手动复制" : "复制指令"}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
