(() => {
if (window.__notionPdfPreviewInstalled) {
  return;
}
window.__notionPdfPreviewInstalled = true;

const OVERLAY_ID = "notion-pdf-preview-overlay";
const PANEL_ID = "notion-pdf-preview-panel";
const PDF_PREVIEW_ID = "notion-pdf-preview-pages";

// Calibrated from Notion native PDF export: A4, scale 100%.
// PDF units: 1pt = 4/3 CSS px.
const PT_TO_CSS_PX = 4 / 3;

const A4_WIDTH_PT = 595.92;
const A4_HEIGHT_PT = 842.88;
const A4_WIDTH_PX = A4_WIDTH_PT * PT_TO_CSS_PX;
const A4_HEIGHT_PX = A4_HEIGHT_PT * PT_TO_CSS_PX;

// Notion native PDF export content box, A4 scale 100%.
// Approximately 1 inch margins.
const PAGE_BODY_WIDTH_PT = 452.25;
const PAGE_BODY_HEIGHT_PT = 698.88;
const PAGE_BODY_WIDTH_PX = PAGE_BODY_WIDTH_PT * PT_TO_CSS_PX;   // ≈ 603px
const PAGE_BODY_HEIGHT_PX = PAGE_BODY_HEIGHT_PT * PT_TO_CSS_PX; // ≈ 931.84px
const MIN_SCALE_PERCENT = 11;
const MAX_SCALE_PERCENT = 199;
let previewState = null;
let previewUpdateQueued = false;
function ptToPx(pt) {
  return pt * PT_TO_CSS_PX;
}

function blockHeightFromPt(lineCount, lineAdvancePt, extraPt = 0, afterGapPt = 0) {
  return ptToPx(lineAdvancePt * Math.max(1, lineCount) + extraPt + afterGapPt);
}
function clampScale(scalePercent) {
  const value = Number(scalePercent);
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, value));
}

function clearPreview() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(PDF_PREVIEW_ID)?.remove();
  document.removeEventListener("scroll", schedulePreviewUpdate, true);
  window.removeEventListener("resize", schedulePreviewUpdate);
  previewState = null;
  previewUpdateQueued = false;
}

function getVisibleRect(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return null;
  }

  return rect;
}

function getElementText(element) {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function getElementRawText(element) {
  return (element.innerText || element.textContent || "").trim();
}

function getVisibleTextForEstimate(element, fontSize = 14) {
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    if (node.matches("script, style, .katex-mathml")) {
      return "";
    }

    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return "";
    }

    if (node.matches(".katex")) {
      const rect = node.getBoundingClientRect();
      const tokenCount = Math.max(1, Math.ceil((rect.width || fontSize) / (fontSize * 0.5)));
      return ` ${"m".repeat(tokenCount)} `;
    }

    return Array.from(node.childNodes).map(walk).join("");
  }

  return walk(element).replace(/\s+/g, " ").trim();
}

function getPrimaryTextElement(block) {
  return block.querySelector("h1, h2, h3, h4, [contenteditable='true'], [data-content-editable-leaf], span") || block;
}

function getBlockFontMetrics(block) {
  const primaryTextElement = getPrimaryTextElement(block);
  const primaryStyle = window.getComputedStyle(primaryTextElement);
  return {
    fontSize: Number.parseFloat(primaryStyle.fontSize) || 14,
    fontWeight: Number.parseInt(primaryStyle.fontWeight, 10) || 400
  };
}

function findNotionContentRoot() {
  const selectors = [
    ".notion-page-content",
    "[data-testid='page-content']",
    "main [data-block-id]"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && getVisibleRect(element)) {
      return selector === "main [data-block-id]" ? element.closest(".notion-page-content") || element.parentElement : element;
    }
  }

  const blocks = Array.from(document.querySelectorAll("[data-block-id]"));
  if (!blocks.length) {
    return null;
  }

  const roots = new Map();
  for (const block of blocks) {
    const root = block.closest(".notion-page-content") || block.parentElement;
    if (!root) {
      continue;
    }
    roots.set(root, (roots.get(root) || 0) + 1);
  }

  return Array.from(roots.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function isNestedBlock(block, allBlocks) {
  const parentBlock = block.parentElement?.closest("[data-block-id]");
  return parentBlock ? allBlocks.includes(parentBlock) : false;
}

function getContentBlocks(contentRoot) {
  const notionBlocks = Array.from(contentRoot.querySelectorAll("[data-block-id]"));
  const visibleBlocks = notionBlocks
    .filter((block) => getVisibleRect(block))
    .filter((block) => !isNestedBlock(block, notionBlocks));

  if (visibleBlocks.length) {
    return visibleBlocks;
  }

  return Array.from(contentRoot.querySelectorAll("h1, h2, h3, h4, p, li, table, pre, blockquote, figure, img, hr"))
    .filter((block) => getVisibleRect(block));
}

function findPageTitleBlock(contentRoot) {
  const contentRect = contentRoot.getBoundingClientRect();
  const selectors = [
    "[data-testid='page-title']",
    ".notion-page-title",
    "[placeholder='Untitled']",
    "[aria-label='Untitled']",
    "[contenteditable='true']",
    "[data-content-editable-leaf]",
    "h1"
  ];
  const candidates = Array.from(document.querySelectorAll(selectors.join(",")))
    .filter((element) => !contentRoot.contains(element))
    .map((element) => {
      const rect = getVisibleRect(element);
      const text = getElementText(element);
      const style = rect ? window.getComputedStyle(element) : null;
      const fontSize = style ? Number.parseFloat(style.fontSize) || 0 : 0;
      return { element, fontSize, rect, text };
    })
    .filter((candidate) => candidate.rect && candidate.text && candidate.fontSize >= 28 && candidate.rect.bottom <= contentRect.top + 120);

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((a, b) => {
    const distanceA = Math.abs(contentRect.top - a.rect.bottom);
    const distanceB = Math.abs(contentRect.top - b.rect.bottom);
    return b.fontSize - a.fontSize || distanceA - distanceB;
  })[0].element;
}

function isTableLikeBlock(block, tagName, blockInfo) {
  const role = (block.getAttribute("role") || "").toLowerCase();

  if (tagName === "table" || block.querySelector("table")) {
    return true;
  }

  if (role === "table" || role === "grid" || blockInfo.includes("notion-table") || blockInfo.includes("collection_view")) {
    return true;
  }

  const tableContainer = block.querySelector("[role='table'], [role='grid']");
  if (tableContainer) {
    return tableContainer.querySelectorAll("[role='row']").length >= 2;
  }

  return block.querySelectorAll(":scope > [role='row']").length >= 2;
}

function classifyBlock(block, headingFontLevels = null) {
  const tagName = block.tagName.toLowerCase();
  const text = getElementText(block);
  const blockInfo = `${tagName} ${block.className || ""} ${block.getAttribute("role") || ""} ${block.getAttribute("aria-label") || ""}`.toLowerCase();
  const { fontSize, fontWeight } = getBlockFontMetrics(block);
  const primaryTextElement = getPrimaryTextElement(block);
  const primaryStyle = window.getComputedStyle(primaryTextElement);

  if (tagName === "hr" || block.querySelector("hr")) {
    return "divider";
  }

  if (tagName === "img" || tagName === "figure" || block.querySelector("img, figure")) {
    return "media";
  }

  if (isTableLikeBlock(block, tagName, blockInfo)) {
    return "table";
  }

  if (isStandaloneEquationBlock(block, blockInfo)) {
    return "equation";
  }

  if (
    tagName === "pre" ||
    block.querySelector("pre, code") ||
    blockInfo.includes("code") ||
    primaryStyle.fontFamily.toLowerCase().includes("mono")
  ) {
    return "code";
  }

  if (tagName === "blockquote" || block.querySelector("blockquote") || blockInfo.includes("quote")) {
    return "quote";
  }

  if (blockInfo.includes("callout")) {
    return "callout";
  }

  const heading = block.querySelector("h1, h2, h3, h4");
  const headingTagName = heading?.tagName.toLowerCase();

  if (tagName === "h4" || headingTagName === "h4" || tagName === "h4" || headingTagName === "h4" || blockInfo.includes("sub_sub_header")) {
    return "h4";
  }

  if (tagName === "h3" || headingTagName === "h3" || blockInfo.includes("sub_header")) {
    return "h3";
  }

  if (tagName === "h2" || headingTagName === "h2" || blockInfo.includes("header-block")) {
    return "h2";
  }

  if (headingFontLevels?.h2 && Math.abs(fontSize - headingFontLevels.h2) < 0.75) {
    return "h2";
  }

  if (headingFontLevels?.h3 && Math.abs(fontSize - headingFontLevels.h3) < 0.75) {
    return "h3";
  }

  if (headingFontLevels?.h4 && Math.abs(fontSize - headingFontLevels.h4) < 0.75) {
    return "h4";
  }

  if (fontSize >= 22) {
    return "h2";
  }

  if (fontSize >= 17 && fontWeight >= 600) {
    return "h3";
  }

  if (fontSize >= 15 && fontWeight >= 600) {
    return "h4";
  }

  if (tagName === "li" || block.closest("ul, ol") || blockInfo.includes("bulleted") || blockInfo.includes("numbered") || /^(\d+\.|[*-])\s+/.test(text)) {
    return "list";
  }

  if (!text) {
    return "blank";
  }

  return "paragraph";
}

function getHeadingFontLevels(blocks) {
  const fontSizes = blocks
    .map((block) => {
      const text = getElementText(block);
      const { fontSize, fontWeight } = getBlockFontMetrics(block);
      return { fontSize: Math.round(fontSize * 2) / 2, fontWeight, text };
    })
    .filter(({ fontSize, fontWeight, text }) => text && fontSize >= 14.5 && fontWeight >= 600)
    .map(({ fontSize }) => fontSize);
  const uniqueFontSizes = Array.from(new Set(fontSizes)).sort((a, b) => b - a);

  return {
    h2: uniqueFontSizes[0] || null,
    h3: uniqueFontSizes[1] || null,
    h4: uniqueFontSizes[2] || null
  };
}

function getCharacterWidth(character, fontSize) {
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]/.test(character)) {
    return fontSize * 0.95;
  }

  if (/\s/.test(character)) {
    return fontSize * 0.28;
  }

  if (/[.,:;'"`!|()[\]{}]/.test(character)) {
    return fontSize * 0.32;
  }

  if (/[A-Z]/.test(character)) {
    return fontSize * 0.62;
  }

  if (/[0-9]/.test(character)) {
    return fontSize * 0.55;
  }

  return fontSize * 0.5;
}

function estimateWrappedLines(text, fontSize, layoutWidth, reservedWidth = 0) {
  if (!text) {
    return 1;
  }

  const availableWidth = Math.max(120, layoutWidth - reservedWidth);
  return text.split("\n").reduce((lineCount, rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return lineCount + 1;
    }

    let currentWidth = 0;
    let wrappedLines = 1;

    for (const character of line.replace(/\s+/g, " ")) {
      const characterWidth = getCharacterWidth(character, fontSize);
      if (currentWidth > 0 && currentWidth + characterWidth > availableWidth) {
        wrappedLines += 1;
        currentWidth = characterWidth;
      } else {
        currentWidth += characterWidth;
      }
    }

    return lineCount + wrappedLines;
  }, 0);
}

function estimateTableHeight(block, layoutWidth) {
  // Calibrated Notion PDF table:
  // font 10.5pt, row height 21.75pt, border about 0.75pt.
  const rows = Array.from(block.querySelectorAll("tr, [role='row']"));

  if (rows.length) {
    return ptToPx(21.75 * rows.length + 0.75);
  }

  const rawLines = getElementRawText(block)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rowCount = Math.max(1, rawLines.length);
  return ptToPx(21.75 * rowCount + 0.75);
}

function estimateMediaHeight(block, layoutWidth) {
  const image = block.matches("img") ? block : block.querySelector("img");
  const naturalWidth = image?.naturalWidth || 0;
  const naturalHeight = image?.naturalHeight || 0;

  if (naturalWidth > 0 && naturalHeight > 0) {
    return Math.min(520, Math.max(120, layoutWidth * (naturalHeight / naturalWidth))) + 18;
  }

  const rect = getVisibleRect(block);
  return Math.min(520, Math.max(140, rect?.height || 220)) + 18;
}
function hasMathElement(block) {
  return Boolean(block.querySelector(".katex, .katex-display"));
}

function isStandaloneEquationBlock(block, blockInfo) {
  if (!hasMathElement(block)) {
    return false;
  }

  // block equation만 true.
  // inline equation은 paragraph로 남아야 함.
  return (
    blockInfo.includes("equation") ||
    Boolean(block.querySelector(".katex-display")) ||
    block.matches("[class*='notion-equation']")
  );
}

function getUnionRect(elements) {
  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect && rect.width > 0 && rect.height > 0);

  if (!rects.length) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}
function getVisualMathRects(block) {
  return Array.from(block.querySelectorAll(".katex-display, .katex"))
    .filter((element) => {
      // KaTeX 내부의 접근성용 MathML은 시각적 높이 계산에서 제외
      if (element.closest(".katex-mathml")) {
        return false;
      }

      const rect = element.getBoundingClientRect();

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      // 비정상적으로 큰 rect는 wrapper 오탐일 가능성이 큼
      if (rect.height > 300) {
        return false;
      }

      const style = window.getComputedStyle(element);

      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return true;
    })
    .map((element) => element.getBoundingClientRect());
}

function getUnionRectFromRects(rects) {
  if (!rects.length) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function estimateEquationHeight(block) {
  const mathRects = getVisualMathRects(block);
  const mathUnionRect = getUnionRectFromRects(mathRects);

  // Block equation만 이 공식을 사용.
  // PDF 보정값: visible math height + 약 16pt.
  if (mathUnionRect) {
    return mathUnionRect.height + ptToPx(16);
  }

  return ptToPx(36);
}

function estimateInlineMathAwareHeight(block, baseHeight) {
  const mathRects = getVisualMathRects(block);

  if (!mathRects.length) {
    return baseHeight;
  }

  const maxMathHeight = Math.max(...mathRects.map((rect) => rect.height));

  // 일반 본문 line-height: 18pt
  const normalLineHeightPx = ptToPx(18);

  // inline 수식이 일반 줄높이보다 클 때만 조금 보정
  const extra = Math.max(0, maxMathHeight - normalLineHeightPx);

  // 핵심:
  // inline 수식 때문에 문단 전체가 600px 되는 일은 없음.
  // 그래서 보정값을 강하게 cap 한다.
  const cappedExtra = Math.min(extra + ptToPx(2), ptToPx(16));

  return baseHeight + cappedExtra;
}

function estimateBlockHeight(block, layoutWidth, type = classifyBlock(block)) {
  const rawText = getElementRawText(block);
  const text = getVisibleTextForEstimate(block, ptToPx(12));

  switch (type) {
    case "pageTitle": {
      // Notion page title, not markdown #.
      // Measured formula: 43.5n + 20.5 pt.
      const lines = estimateWrappedLines(text, ptToPx(30), layoutWidth);
      return blockHeightFromPt(lines, 43.5, 0, 20.5);
    }

    case "h2": {
      // Important:
      // In Notion DOM, markdown # is rendered as h2.
      // Measured markdown # formula:
      // visible = 27n + 5.58 pt, after gap = 14 pt.
      const lines = estimateWrappedLines(text, ptToPx(22.5), layoutWidth);
      return blockHeightFromPt(lines, 27, 5.58, 14);
    }

    case "h3": {
      // Important:
      // In Notion DOM, markdown ## is rendered as h3.
      // Measured markdown ## formula:
      // visible = 21.75n + 4.31 pt, after gap = 12.5 pt.
      const lines = estimateWrappedLines(text, ptToPx(18), layoutWidth);
      return blockHeightFromPt(lines, 21.75, 4.31, 12.5);
    }

    case "h4": {
      // Important:
      // In Notion DOM, markdown ### is rendered as h4.
      // Measured markdown ### formula:
      // visible = 18n + 3.72 pt, after gap = 8 pt.
      const lines = estimateWrappedLines(text, ptToPx(15), layoutWidth);
      return blockHeightFromPt(lines, 18, 3.72, 8);
    }

    case "list": {
      const lines = estimateWrappedLines(text, ptToPx(12), layoutWidth, ptToPx(21.6));
      const baseHeight = blockHeightFromPt(lines, 18, -0.62, 7.8);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }

    case "quote": {
      const lines = estimateWrappedLines(text, ptToPx(12), layoutWidth, ptToPx(14.25));
      const baseHeight = blockHeightFromPt(lines, 18, -0.62, 12.6);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }
    
    case "equation":
      return estimateEquationHeight(block);

    case "callout": {
      const lines = estimateWrappedLines(text, ptToPx(12), layoutWidth, ptToPx(40));
      const baseHeight = blockHeightFromPt(lines, 18, -0.62, 18);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }

    case "code": {
      // Measured code block formula: 18n + 24 pt.
      // n is visual line slots, including blank lines and wrapped long code lines.
      const rawLines = rawText.replace(/\r\n/g, "\n").split("\n");

      const lineSlots = Math.max(
        1,
        rawLines.reduce((sum, line) => {
          return sum + estimateWrappedLines(line || " ", ptToPx(12), layoutWidth, ptToPx(24));
        }, 0)
      );

      return blockHeightFromPt(lineSlots, 18, 0, 24);
    }

    case "table":
      return estimateTableHeight(block, layoutWidth);

    case "media":
      return estimateMediaHeight(block, layoutWidth);

    case "divider":
      return ptToPx(18);

    case "blank":
      return ptToPx(18);

    default: {
      const lines = estimateWrappedLines(text, ptToPx(12), layoutWidth);
      const baseHeight = blockHeightFromPt(lines, 18, -0.62, 6.6);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }
  }
}

function paginateBlocks(blocks, pageHeight) {
  const pages = [[]];
  const breaks = [];
  let usedHeight = 0;

  function currentPage() {
    return pages[pages.length - 1];
  }

  function startNewPage(pageBreak) {
    breaks.push({
      ...pageBreak,
      pageNumber: pages.length
    });
    pages.push([]);
    usedHeight = 0;
  }

  function getBottomOverflowTolerance(type) {
    switch (type) {
      case "h2":
      case "h3":
      case "h4":
        return 24;
      case "paragraph":
      case "list":
      case "quote":
        return 60;
      default:
        return 0;
    }
  }

  for (const block of blocks) {
    if (block.height <= pageHeight) {
      const overflow = usedHeight + block.height - pageHeight;
      const canKeepNearBottom =
        usedHeight > 0 &&
        usedHeight <= pageHeight &&
        overflow > 0 &&
        overflow <= getBottomOverflowTolerance(block.type);

      if (usedHeight > 0 && usedHeight + block.height > pageHeight && !canKeepNearBottom) {
        startNewPage({
          element: block.element,
          offsetRatio: 0
        });
      }

      currentPage().push({
        ...block,
        continued: false,
        segmentHeight: block.height,
        splitAfter: false
      });
      usedHeight += block.height;
      continue;
    }

    let consumedHeight = 0;
    let remainingHeight = block.height;
    let segmentIndex = 0;

    while (remainingHeight > 0) {
      let availableHeight = pageHeight - usedHeight;

      if (availableHeight <= 0) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, consumedHeight / block.height)
        });
        availableHeight = pageHeight;
      }

      const segmentHeight = Math.min(remainingHeight, availableHeight);
      consumedHeight += segmentHeight;
      remainingHeight -= segmentHeight;

      currentPage().push({
        ...block,
        continued: segmentIndex > 0,
        segmentHeight,
        splitAfter: remainingHeight > 0
      });

      usedHeight += segmentHeight;
      segmentIndex += 1;

      if (remainingHeight > 0) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, consumedHeight / block.height)
        });
      }
    }
  }

  return {
    breaks,
    pages: pages.filter((page) => page.length > 0)
  };
}

function estimateDocumentLayout(contentRoot, scalePercent) {
  const scaleFactor = scalePercent / 100;
  const layoutWidth = PAGE_BODY_WIDTH_PX / scaleFactor;
  const pageTitleElement = findPageTitleBlock(contentRoot);
  const blocks = getContentBlocks(contentRoot).filter((element) => element !== pageTitleElement);
  const headingFontLevels = getHeadingFontLevels(blocks);
  const measuredBlocks = blocks.map((element) => {
    const type = classifyBlock(element, headingFontLevels);
    return {
      element,
      type,
      text: getVisibleTextForEstimate(element),
      height: estimateBlockHeight(element, layoutWidth, type)
    };
  });
  if (pageTitleElement) {
    measuredBlocks.unshift({
      element: pageTitleElement,
      type: "pageTitle",
      text: getVisibleTextForEstimate(pageTitleElement),
      height: estimateBlockHeight(pageTitleElement, layoutWidth, "pageTitle")
    });
  }
  const pageHeight = PAGE_BODY_HEIGHT_PX / scaleFactor;
  const pagination = paginateBlocks(measuredBlocks, pageHeight);

  return {
    blocks: measuredBlocks,
    estimatedPages: Math.max(1, pagination.pages.length),
    layoutWidth,
    pageBreaks: pagination.breaks,
    pageHeight,
    pages: pagination.pages
  };
}

function createPageLine(pageBreak) {
  const line = document.createElement("div");
  line.className = "notion-pdf-preview-line";
  line.dataset.label = `Page ${pageBreak.pageNumber} end`;
  line.dataset.pageNumber = String(pageBreak.pageNumber);
  return line;
}

function getLineFrame(contentRoot) {
  const rect = contentRoot.getBoundingClientRect();
  const left = Math.max(16, rect.left);
  const width = Math.max(280, Math.min(rect.width || 720, document.documentElement.clientWidth - left - 16));
  return { left, rootTop: rect.top, width };
}

function updatePreviewPositions() {
  previewUpdateQueued = false;

  if (!previewState) {
    return;
  }

  const { contentRoot, pageBreaks, overlay } = previewState;
  const frame = getLineFrame(contentRoot);
  const lines = Array.from(overlay.querySelectorAll(".notion-pdf-preview-line"));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pageBreak = pageBreaks[index];
    const rect = pageBreak.element.getBoundingClientRect();
    const top = rect.top + rect.height * pageBreak.offsetRatio;
    line.style.top = `${top}px`;
    line.style.setProperty("--notion-pdf-preview-left", `${frame.left}px`);
    line.style.setProperty("--notion-pdf-preview-width", `${frame.width}px`);
  }
}

function schedulePreviewUpdate() {
  if (!previewState || previewUpdateQueued) {
    return;
  }

  previewUpdateQueued = true;
  requestAnimationFrame(updatePreviewPositions);
}

function truncateText(text, maxLength = 260) {
  if (!text) {
    return "(empty block)";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function createPdfPreviewBlock(segment, pageScale) {
  const block = document.createElement("article");
  block.className = "notion-pdf-preview-page-block";
  block.dataset.type = segment.type;
  block.style.minHeight = `${Math.max(12, segment.segmentHeight * pageScale)}px`;

  const meta = document.createElement("div");
  meta.className = "notion-pdf-preview-page-block-meta";
  meta.textContent = `${segment.type} | ${Math.round(segment.height)}px${segment.continued ? " | continued" : ""}${segment.splitAfter ? " | splits" : ""}`;

  const text = document.createElement("p");
  text.textContent = truncateText(segment.text);

  block.append(meta, text);
  return block;
}

function closePdfPreview() {
  document.getElementById(PDF_PREVIEW_ID)?.remove();
}

function openPdfPreview() {
  if (!previewState) {
    return;
  }

  closePdfPreview();

  const { layout, scalePercent } = previewState;
  const pages = layout.pages;
  const pageScale = 720 / layout.pageHeight;

  const modal = document.createElement("section");
  modal.id = PDF_PREVIEW_ID;
  modal.className = "notion-pdf-preview-pages";

  const header = document.createElement("header");
  header.className = "notion-pdf-preview-pages-header";

  const title = document.createElement("strong");
  title.textContent = `Predicted PDF preview (${pages.length} pages)`;

  const details = document.createElement("span");
  details.textContent = `A4 | ${scalePercent}% scale | virtual body ${Math.round(layout.layoutWidth)} x ${Math.round(layout.pageHeight)}px`;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closePdfPreview);

  header.append(title, details, closeButton);

  const pageList = document.createElement("div");
  pageList.className = "notion-pdf-preview-page-list";

  pages.forEach((pageBlocks, pageIndex) => {
    const page = document.createElement("section");
    page.className = "notion-pdf-preview-page";
    page.style.setProperty("--notion-pdf-preview-page-height", `${layout.pageHeight * pageScale}px`);

    const pageLabel = document.createElement("div");
    pageLabel.className = "notion-pdf-preview-page-label";
    pageLabel.textContent = `Page ${pageIndex + 1}`;

    const body = document.createElement("div");
    body.className = "notion-pdf-preview-page-body";

    for (const segment of pageBlocks) {
      body.append(createPdfPreviewBlock(segment, pageScale));
    }

    page.append(pageLabel, body);
    pageList.append(page);
  });

  modal.append(header, pageList);
  document.body.append(modal);
}

function createPanel({ estimatedPages, scalePercent }) {
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "notion-pdf-preview-panel";

  const title = document.createElement("strong");
  title.textContent = `Estimated pages: ${estimatedPages}`;

  const details = document.createElement("span");
  details.textContent = `A4 portrait | ${scalePercent}% scale | block-based estimate`;

  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.textContent = "Open PDF preview";
  previewButton.addEventListener("click", openPdfPreview);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear preview";
  clearButton.addEventListener("click", clearPreview);

  panel.append(title, details, previewButton, clearButton);
  return panel;
}

function showPreview(scalePercentInput) {
  const scalePercent = clampScale(scalePercentInput);
  const contentRoot = findNotionContentRoot();
  if (!contentRoot) {
    throw new Error("Could not find Notion page content.");
  }

  const layout = estimateDocumentLayout(contentRoot, scalePercent);
  const pageBreaks = layout.pageBreaks;

  clearPreview();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "notion-pdf-preview-overlay";

  for (const pageBreak of pageBreaks) {
    overlay.append(createPageLine(pageBreak));
  }

  document.body.append(overlay, createPanel({ estimatedPages: layout.estimatedPages, scalePercent }));
  previewState = {
    contentRoot,
    layout,
    pageBreaks,
    scalePercent,
    overlay
  };
  updatePreviewPositions();
  document.addEventListener("scroll", schedulePreviewUpdate, true);
  window.addEventListener("resize", schedulePreviewUpdate);

  return { estimatedPages: layout.estimatedPages };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message?.type === "NOTION_PDF_PREVIEW_SHOW") {
      const scalePercent =
        message.scalePercent ??
        message.settings?.scale ??
        message.settings?.scalePercent;

      sendResponse(showPreview(scalePercent));
      return true;
    }

    if (message?.type === "NOTION_PDF_PREVIEW_CLEAR") {
      clearPreview();
      sendResponse({ ok: true });
      return true;
    }
  } catch (error) {
    sendResponse({ error: error.message || "Preview failed." });
    return true;
  }

  return false;
});
})();
