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

function getCodeRawTextForEstimate(block) {
  const codeElement = block.querySelector("[contenteditable='true'], [data-content-editable-leaf]") || block;
  const rawText = (codeElement.textContent || codeElement.innerText || "").replace(/\u200b/g, "");
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");

  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  return lines.join("\n").trim();
}

function getVisibleTextForEstimate(element, fontSize = 14) {
  const pdfLinkText = getPdfLinkTextForEstimate(element);
  if (pdfLinkText) {
    return pdfLinkText;
  }

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

function getOwnVisibleTextForEstimate(element) {
  const ownerBlock = element.closest("[data-block-id]") || element;
  const parts = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    if (!parent) {
      continue;
    }

    const closestBlock = parent.closest("[data-block-id]");
    if (closestBlock && closestBlock !== ownerBlock) {
      continue;
    }

    if (parent.closest("script, style, .katex-mathml, table, [role='table'], [role='grid']")) {
      continue;
    }

    parts.push(node.textContent || "");
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getPdfLinkTextForEstimate(element) {
  const links = Array.from(element.querySelectorAll("a[href]"))
    .map((link) => link.href)
    .filter((href) => /^https?:\/\//i.test(href));

  if (links.length !== 1) {
    return "";
  }

  const visibleText = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  const [href] = links;

  if (!visibleText || visibleText === href || visibleText.startsWith("http")) {
    return href;
  }

  const blockInfo = `${element.tagName || ""} ${element.className || ""} ${element.getAttribute?.("role") || ""} ${element.getAttribute?.("aria-label") || ""}`.toLowerCase();
  const looksLikeLinkPreview =
    blockInfo.includes("bookmark") ||
    blockInfo.includes("link") ||
    blockInfo.includes("embed") ||
    visibleText.length <= 90;

  return looksLikeLinkPreview ? href : "";
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

function getSeparatorBlocks(contentRoot, existingBlocks = []) {
  return Array.from(contentRoot.querySelectorAll("[role='separator']"))
    .map((separator) => separator.parentElement || separator)
    .filter((separatorBlock, index, separatorBlocks) => separatorBlocks.indexOf(separatorBlock) === index)
    .filter((separatorBlock) => getVisibleRect(separatorBlock))
    .filter((separatorBlock) => !existingBlocks.some((block) => block.contains(separatorBlock)));
}

function sortBlocksByPagePosition(blocks) {
  return blocks.slice().sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    return rectA.top - rectB.top || rectA.left - rectB.left;
  });
}

function getContentBlocks(contentRoot) {
  const notionBlocks = Array.from(contentRoot.querySelectorAll("[data-block-id]"));
  const visibleBlocks = notionBlocks
    .filter((block) => getVisibleRect(block))
    .filter((block) => !isNestedBlock(block, notionBlocks));
  const separatorBlocks = getSeparatorBlocks(contentRoot, visibleBlocks);

  if (visibleBlocks.length || separatorBlocks.length) {
    return sortBlocksByPagePosition([...visibleBlocks, ...separatorBlocks]);
  }

  const fallbackBlocks = Array.from(contentRoot.querySelectorAll("h1, h2, h3, h4, p, li, table, pre, blockquote, figure, img, hr, [role='separator']"))
    .map((block) => block.getAttribute("role") === "separator" ? block.parentElement || block : block)
    .filter((block, index, blocks) => blocks.indexOf(block) === index)
    .filter((block) => getVisibleRect(block));

  return sortBlocksByPagePosition(fallbackBlocks);
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

function isListLikeBlock(block, tagName, blockInfo, text) {
  return (
    tagName === "li" ||
    block.closest("ul, ol") ||
    blockInfo.includes("bulleted") ||
    blockInfo.includes("numbered") ||
    blockInfo.includes("to_do") ||
    /^(\d+\.|[*-])\s+/.test(text)
  );
}

function hasExplicitMediaHint(blockInfo) {
  return (
    blockInfo.includes("image") ||
    blockInfo.includes("video") ||
    blockInfo.includes("embed") ||
    blockInfo.includes("audio") ||
    blockInfo.includes("pdf") ||
    blockInfo.includes("file")
  );
}

function getSubstantialMediaElement(block) {
  const candidates = Array.from(block.querySelectorAll("img, video, iframe, canvas, figure"));

  return candidates.find((element) => {
    const rect = getVisibleRect(element);
    return rect && rect.width >= 80 && rect.height >= 60;
  }) || null;
}

function isMediaLikeBlock(block, tagName, blockInfo) {
  if (tagName === "img" || tagName === "figure") {
    return true;
  }

  if (!hasExplicitMediaHint(blockInfo)) {
    return false;
  }

  return Boolean(getSubstantialMediaElement(block));
}

function classifyBlock(block, headingFontLevels = null) {
  const tagName = block.tagName.toLowerCase();
  const text = getElementText(block);
  const blockInfo = `${tagName} ${block.className || ""} ${block.getAttribute("role") || ""} ${block.getAttribute("aria-label") || ""}`.toLowerCase();
  const { fontSize, fontWeight } = getBlockFontMetrics(block);
  const primaryTextElement = getPrimaryTextElement(block);
  const primaryStyle = window.getComputedStyle(primaryTextElement);

  if (tagName === "hr" || block.querySelector("hr, [role='separator']") || blockInfo.includes("separator")) {
    return "divider";
  }

  if (isMediaLikeBlock(block, tagName, blockInfo)) {
    return "media";
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

  if (isListLikeBlock(block, tagName, blockInfo, text)) {
    return "list";
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

function getTableRows(block) {
  const rows = getTableRowElements(block);

  if (rows.length) {
    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("th, td, [role='columnheader'], [role='cell'], [role='gridcell']"));
      return cells.length ? cells.map(getElementText) : [getElementText(row)];
    });
  }

  const rawLines = getElementRawText(block)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return rawLines.length ? rawLines.map((line) => [line]) : [[getElementText(block)]];
}

function getTableRowElements(block) {
  return Array.from(block.querySelectorAll("tr, [role='row']"));
}

function getTableRowCount(block) {
  return getTableRows(block).length;
}

function tableRepeatsHeader(block) {
  const firstRow = block.querySelector("tr, [role='row']");

  if (!firstRow) {
    return false;
  }

  return Boolean(firstRow.querySelector("th, [role='columnheader']"));
}

function estimateTableRowHeights(block, layoutWidth) {
  const rows = getTableRows(block);
  const rowElements = getTableRowElements(block);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const cellWidth = Math.max(80, layoutWidth / columnCount - ptToPx(8));

  return rows.map((row, rowIndex) => {
    const rowElement = rowElements[rowIndex];
    const rowStyleHeight = rowElement ? Number.parseFloat(window.getComputedStyle(rowElement).height) || 0 : 0;
    const looksLikeSingleLineRow = row.every((cellText) => cellText.length <= 34);
    if (looksLikeSingleLineRow && rowStyleHeight > 0 && rowStyleHeight <= 36) {
      return ptToPx(21.75);
    }

    const lineCount = Math.max(
      1,
      ...row.map((cellText) => estimateWrappedLines(cellText, ptToPx(10.5), cellWidth))
    );

    return ptToPx(21.75 + 12 * (lineCount - 1));
  });
}

function getTextOutsideTable(block) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const parts = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    if (!parent || parent.closest("table, [role='table'], [role='grid'], tr, [role='row']")) {
      continue;
    }

    const text = node.textContent.trim();
    if (text) {
      parts.push(text);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function estimateTableHeight(block, layoutWidth) {
  // Calibrated Notion PDF table:
  // font 10.5pt, one-line row height 21.75pt, wrapped rows are compact.
  const rowHeights = estimateTableRowHeights(block, layoutWidth);
  const tableHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, ptToPx(0.75));
  const extraText = getTextOutsideTable(block);

  if (!extraText) {
    return tableHeight;
  }

  const extraLines = estimateWrappedLines(extraText, ptToPx(12), layoutWidth);
  return tableHeight + blockHeightFromPt(extraLines, 18, -0.62, 6.6);
}

function estimateMediaHeight(block, layoutWidth) {
  const image = block.matches("img") ? block : getSubstantialMediaElement(block) || block.querySelector("img");
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

function estimateListItemHeight(text, layoutWidth, depth = 0, compact = false) {
  const reservedWidth = ptToPx(21.6 + depth * 18);
  const lines = estimateWrappedLines(text || " ", ptToPx(12), layoutWidth, reservedWidth);
  return blockHeightFromPt(lines, 18, -0.62, compact ? 0 : 7.8);
}

function isLogicalChildBlock(block, nestedBlock) {
  if (nestedBlock === block) {
    return false;
  }

  if (nestedBlock.getAttribute("data-block-id") === block.getAttribute("data-block-id")) {
    return false;
  }

  let parent = nestedBlock.parentElement?.closest("[data-block-id]");

  while (parent && parent !== block) {
    if (parent.getAttribute("data-block-id") !== block.getAttribute("data-block-id")) {
      return false;
    }

    parent = parent.parentElement?.closest("[data-block-id]");
  }

  return parent === block;
}

function getNestedContentBlocks(block) {
  return sortBlocksByPagePosition(
    Array.from(block.querySelectorAll("[data-block-id]"))
      .filter((nestedBlock) => isLogicalChildBlock(block, nestedBlock))
      .filter((nestedBlock) => getVisibleRect(nestedBlock))
  );
}

function getEmbeddedTablesForList(block) {
  return Array.from(block.querySelectorAll("table, [role='table'], [role='grid']"))
    .filter((table) => getVisibleRect(table))
    .filter((table) => (table.closest("[data-block-id]") || block) === block)
    .filter((table, index, tables) => tables.findIndex((candidate) => candidate.contains(table)) === index);
}

function estimateListHeight(block, layoutWidth, compact = false) {
  const ownText = getOwnVisibleTextForEstimate(block) || getVisibleTextForEstimate(block, ptToPx(12));
  let height = estimateListItemHeight(ownText, layoutWidth, 0, compact);
  const nestedLayoutWidth = Math.max(120, layoutWidth - ptToPx(21.6));

  for (const table of getEmbeddedTablesForList(block)) {
    height += estimateTableHeight(table, nestedLayoutWidth);
  }

  for (const nestedBlock of getNestedContentBlocks(block)) {
    const nestedType = classifyBlock(nestedBlock);
    height += nestedType === "list"
      ? estimateListHeight(nestedBlock, nestedLayoutWidth, true)
      : estimateBlockHeight(nestedBlock, nestedLayoutWidth, nestedType);
  }

  return estimateInlineMathAwareHeight(block, height);
}

function estimateBlockHeight(block, layoutWidth, type = classifyBlock(block)) {
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
      return estimateListHeight(block, layoutWidth);
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
      const rawLines = getCodeRawTextForEstimate(block).split("\n");

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
      return ptToPx(24);

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
      case "h4":
        return 40;
      case "paragraph":
      case "list":
      case "quote":
        return 60;
      case "equation":
        return 40;
      default:
        return 0;
    }
  }

  function isTextFlowType(type) {
    return type === "paragraph" || type === "list" || type === "quote" || type === "callout";
  }

  function isAvoidInsideType(type) {
    return type === "equation" || type === "code" || type === "table" || type === "media";
  }

  function isHeadingType(type) {
    return type === "h2" || type === "h3" || type === "h4";
  }

  function canUseBottomOverflowTolerance(block, overflow) {
    if (overflow <= 0 || overflow > getBottomOverflowTolerance(block.type)) {
      return false;
    }

    const previousSegment = currentPage().at(-1);
    if (isHeadingType(block.type) && isAvoidInsideType(previousSegment?.type)) {
      return false;
    }

    return true;
  }

  function shouldAvoidTinyTailAfterAtomicBlock(block) {
    if (!isTextFlowType(block.type)) {
      return false;
    }

    if (block.height > ptToPx(24)) {
      return false;
    }

    const previousSegment = currentPage().at(-1);
    if (!previousSegment || !isAvoidInsideType(previousSegment.type)) {
      return false;
    }

    const remainingAfterBlock = pageHeight - usedHeight - block.height;
    return remainingAfterBlock >= 0 && remainingAfterBlock < ptToPx(18);
  }

  function shouldStartCodeOnCleanPage(block) {
    if (block.type !== "code" || usedHeight <= 0) {
      return false;
    }

    const availableHeight = pageHeight - usedHeight;
    const previousSegment = currentPage().at(-1);

    if (block.height <= availableHeight) {
      return availableHeight - block.height < 16;
    }

    return previousSegment?.type === "code" && availableHeight < ptToPx(108);
  }

  function canKeepCodeNearBottom(block) {
    if (block.type !== "code" || usedHeight <= 0) {
      return false;
    }

    const overflow = usedHeight + block.height - pageHeight;
    return overflow > 0 && overflow <= 16;
  }

  function pushTableSegment(block, segmentHeight, consumedRows, rowCount, segmentIndex) {
    const splitAfter = consumedRows < rowCount;
    currentPage().push({
      ...block,
      continued: segmentIndex > 0,
      segmentHeight,
      splitAfter
    });
    usedHeight += segmentHeight;
  }

  function paginateTableBlock(block) {
    const rowHeights = block.tableRowHeights || estimateTableRowHeights(block.element, block.layoutWidth || PAGE_BODY_WIDTH_PX);
    const rowCount = rowHeights.length;

    if (rowCount <= 1) {
      return false;
    }

    const borderHeight = ptToPx(0.75);
    const headerHeight = rowHeights[0];
    const repeatsHeader = block.tableRepeatsHeader ?? tableRepeatsHeader(block.element);
    let consumedRows = 0;
    let segmentIndex = 0;

    while (consumedRows < rowCount) {
      let availableHeight = pageHeight - usedHeight;

      if (availableHeight <= 0) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, consumedRows / rowCount)
        });
        availableHeight = pageHeight;
      }

      const isContinuation = segmentIndex > 0;
      const repeatedHeaderHeight = isContinuation && repeatsHeader ? headerHeight : 0;
      let segmentHeight = borderHeight + repeatedHeaderHeight;
      let originalRows = 0;

      while (
        consumedRows + originalRows < rowCount &&
        segmentHeight + rowHeights[consumedRows + originalRows] <= availableHeight
      ) {
        segmentHeight += rowHeights[consumedRows + originalRows];
        originalRows += 1;
      }

      if (originalRows === 0 && usedHeight > 0) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, consumedRows / rowCount)
        });
        continue;
      }

      if (originalRows === 0) {
        segmentHeight += rowHeights[consumedRows];
        originalRows = 1;
      }

      consumedRows += originalRows;
      pushTableSegment(block, segmentHeight, consumedRows, rowCount, segmentIndex);
      segmentIndex += 1;

      if (consumedRows < rowCount) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, consumedRows / rowCount)
        });
      }
    }

    return true;
  }

  function paginateHeightSplitBlock(block) {
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

  for (const block of blocks) {
    if (
      block.type === "table" &&
      (block.height > pageHeight || (usedHeight > 0 && usedHeight + block.height > pageHeight))
    ) {
      if (paginateTableBlock(block)) {
        continue;
      }
    }

    if (shouldStartCodeOnCleanPage(block)) {
      startNewPage({
        element: block.element,
        offsetRatio: 0
      });
    }

    if (canKeepCodeNearBottom(block)) {
      currentPage().push({
        ...block,
        continued: false,
        segmentHeight: block.height,
        splitAfter: false
      });
      usedHeight += block.height;
      continue;
    }

    if (block.type === "code" && usedHeight > 0 && usedHeight + block.height > pageHeight) {
      paginateHeightSplitBlock(block);
      continue;
    }

    if (block.height <= pageHeight) {
      const overflow = usedHeight + block.height - pageHeight;
      const canKeepNearBottom =
        usedHeight > 0 &&
        usedHeight <= pageHeight &&
        canUseBottomOverflowTolerance(block, overflow);
      const shouldStartCleanPage =
        usedHeight > 0 &&
        !canKeepNearBottom &&
        shouldAvoidTinyTailAfterAtomicBlock(block);

      if (
        usedHeight > 0 &&
        ((usedHeight + block.height > pageHeight && !canKeepNearBottom) || shouldStartCleanPage)
      ) {
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

    paginateHeightSplitBlock(block);
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
    const measuredBlock = {
      element,
      type,
      text: type === "code" ? getCodeRawTextForEstimate(element) : getVisibleTextForEstimate(element),
      layoutWidth,
      height: estimateBlockHeight(element, layoutWidth, type)
    };

    if (type === "table") {
      measuredBlock.tableRowHeights = estimateTableRowHeights(element, layoutWidth);
      measuredBlock.tableRepeatsHeader = tableRepeatsHeader(element);
    }

    return measuredBlock;
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

function formatPdfPreviewForCopy(pages) {
  return pages.map((pageBlocks, pageIndex) => {
    const blocks = pageBlocks.map((segment) => {
      const flags = [
        segment.continued ? "continued" : "",
        segment.splitAfter ? "splits" : ""
      ].filter(Boolean);
      const suffix = flags.length ? ` | ${flags.join(" | ")}` : "";
      return `${segment.type} | ${Math.round(segment.segmentHeight ?? segment.height)}px${suffix}\n${segment.text || "(empty block)"}`;
    });

    return [`Page ${pageIndex + 1}`, ...blocks].join("\n\n");
  }).join("\n\n");
}

function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
    return Promise.resolve();
  } finally {
    textarea.remove();
  }
}

function setTemporaryButtonText(button, text) {
  const originalText = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
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

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(formatPdfPreviewForCopy(pages));
      setTemporaryButtonText(copyButton, "Copied");
    } catch (error) {
      console.error("Failed to copy PDF preview", error);
      setTemporaryButtonText(copyButton, "Failed");
    }
  });

  const actions = document.createElement("div");
  actions.className = "notion-pdf-preview-pages-actions";
  actions.append(copyButton, closeButton);

  header.append(title, details, actions);

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
