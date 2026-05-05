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
  return Boolean(
    block.querySelector(
      ".katex, .katex-display, math, [class*='equation'], [aria-label*='equation'], [aria-label*='Equation']"
    )
  );
}

function isStandaloneEquationBlock(block, blockInfo) {
  if (!hasMathElement(block)) {
    return false;
  }

  // Notion block equation은 보통 katex-display 또는 equation 관련 class를 가짐.
  // inline equation은 paragraph/list 내부의 .katex 정도로만 잡힐 수 있음.
  return (
    blockInfo.includes("equation") ||
    Boolean(block.querySelector(".katex-display")) ||
    Boolean(block.querySelector("[class*='notion-equation']"))
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

function getMathContentRect(block) {
  const mathElements = Array.from(
    block.querySelectorAll(".katex-display, .katex, math")
  );

  return getUnionRect(mathElements);
}

function estimateEquationHeight(block) {
  const blockRect = getVisibleRect(block);
  const mathRect = getMathContentRect(block);

  // PDF calibration:
  // Notion equation block advance ≈ visible math height + 16pt.
  const calibratedFromMath = mathRect
    ? mathRect.height + ptToPx(16)
    : 0;

  // DOM block rect may already include Notion's internal padding.
  // Add a tiny gap to avoid underestimation.
  const calibratedFromBlock = blockRect
    ? blockRect.height + ptToPx(4)
    : 0;

  const fallback = ptToPx(36);

  return Math.max(calibratedFromMath, calibratedFromBlock, fallback);
}

function estimateMathAwareDomHeight(block, baseHeight, extraPt = 3) {
  if (!hasMathElement(block)) {
    return baseHeight;
  }

  const blockRect = getVisibleRect(block);
  const mathRect = getMathContentRect(block);

  const domHeight = Math.max(
    blockRect?.height || 0,
    mathRect ? mathRect.height + ptToPx(extraPt) : 0
  );

  return Math.max(baseHeight, domHeight);
}

function estimateBlockHeight(block, layoutWidth, type = classifyBlock(block)) {
  const rawText = getElementRawText(block);
  const text = rawText.trim();

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
      return estimateMathAwareDomHeight(block, baseHeight, 3);
    }

    case "quote": {
      const lines = estimateWrappedLines(text, ptToPx(12), layoutWidth, ptToPx(14.25));
      const baseHeight = blockHeightFromPt(lines, 18, -0.62, 12.6);
      return estimateMathAwareDomHeight(block, baseHeight, 3);
    }
    
    case "equation":
      return estimateEquationHeight(block);

    case "callout": {
      const lines = estimateWrappedLines(text, ptToPx(12), layoutWidth, ptToPx(40));
      const baseHeight = blockHeightFromPt(lines, 18, -0.62, 18);
      return estimateMathAwareDomHeight(block, baseHeight, 3);
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
      return estimateMathAwareDomHeight(block, baseHeight, 3);
    }
  }
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
      text: getElementText(element),
      height: estimateBlockHeight(element, layoutWidth, type)
    };
  });
  if (pageTitleElement) {
    measuredBlocks.unshift({
      element: pageTitleElement,
      type: "pageTitle",
      text: getElementText(pageTitleElement),
      height: estimateBlockHeight(pageTitleElement, layoutWidth, "pageTitle")
    });
  }
  const totalHeight = measuredBlocks.reduce((sum, block) => sum + block.height, 0);

  return {
    blocks: measuredBlocks,
    estimatedPages: Math.max(1, Math.ceil(Math.max(1, totalHeight) / (PAGE_BODY_HEIGHT_PX / scaleFactor))),
    layoutWidth,
    pageHeight: PAGE_BODY_HEIGHT_PX / scaleFactor
  };
}

function isHeadingType(type) {
  return type === "h2" || type === "h3" || type === "h4";
}

function getVisibleHeightForBreak(block) {
  // Page-break 판단에서는 afterGap까지 heading에 포함시키면 너무 보수적임.
  // Notion native PDF는 heading만 페이지 하단에 남기고 다음 본문을 다음 페이지로 넘기는 경우가 있음.
  const lineCount = Math.max(
    1,
    estimateWrappedLines(
      block.text,
      block.type === "h2" ? ptToPx(22.5) :
      block.type === "h3" ? ptToPx(18) :
      block.type === "h4" ? ptToPx(15) :
      ptToPx(12),
      previewState?.layout?.layoutWidth || PAGE_BODY_WIDTH_PX
    )
  );

  switch (block.type) {
    case "h2":
      // Notion # / HTML h2
      // visible = 27n + 5.58 pt
      return blockHeightFromPt(lineCount, 27, 5.58, 0);

    case "h3":
      // Notion ## / HTML h3
      // visible = 21.75n + 4.31 pt
      return blockHeightFromPt(lineCount, 21.75, 4.31, 0);

    case "h4":
      // Notion ### / HTML h4
      // visible = 18n + 3.72 pt
      return blockHeightFromPt(lineCount, 18, 3.72, 0);

    default:
      return block.height;
  }
}

function findPageBreaks(blocks, pageHeight, estimatedPages) {
  const breaks = [];
  let accumulatedHeight = 0;
  let blockIndex = 0;

  // Notion native PDF는 페이지 끝 근처 heading을 약간 더 관대하게 이전 페이지에 남김.
  // 60% PDF에서 `5. 중간 점검 지점`이 실제로 1페이지 끝에 들어가는 것에 맞춘 보정값.
  const headingKeepTolerancePx = 64;

  for (let pageNumber = 1; pageNumber < estimatedPages; pageNumber += 1) {
    const pageEnd = pageHeight * pageNumber;

    while (
      blockIndex < blocks.length &&
      accumulatedHeight + blocks[blockIndex].height < pageEnd
    ) {
      accumulatedHeight += blocks[blockIndex].height;
      blockIndex += 1;
    }

    let block = blocks[Math.min(blockIndex, blocks.length - 1)];
    if (!block) {
      continue;
    }

    const previousHeight = accumulatedHeight;
    const remainingOnPage = pageEnd - previousHeight;

    // 핵심 보정:
    // pageEnd가 heading 근처에 걸리면, heading의 afterGap까지 요구하지 말고
    // heading visible text만 이전 페이지에 들어갈 수 있는지 본다.
    if (isHeadingType(block.type)) {
      const visibleHeadingHeight = getVisibleHeightForBreak(block);

      if (remainingOnPage + headingKeepTolerancePx >= visibleHeadingHeight) {
        breaks.push({
          element: block.element,
          offsetRatio: 1,
          pageNumber
        });

        continue;
      }
    }

    const offsetRatio =
      block.height > 0
        ? Math.min(1, Math.max(0, remainingOnPage / block.height))
        : 0;

    breaks.push({
      element: block.element,
      offsetRatio,
      pageNumber
    });
  }

  return breaks;
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

function paginatePreviewBlocks(blocks, pageHeight) {
  const pages = [[]];
  let usedHeight = 0;

  for (const block of blocks) {
    let remainingHeight = block.height;
    let segmentIndex = 0;

    while (remainingHeight > 0) {
      let page = pages[pages.length - 1];
      let availableHeight = pageHeight - usedHeight;

      if (availableHeight <= 0) {
        page = [];
        pages.push(page);
        usedHeight = 0;
        availableHeight = pageHeight;
      }

      const segmentHeight = Math.min(remainingHeight, availableHeight);
      page.push({
        ...block,
        continued: segmentIndex > 0,
        segmentHeight,
        splitAfter: remainingHeight > segmentHeight
      });

      usedHeight += segmentHeight;
      remainingHeight -= segmentHeight;
      segmentIndex += 1;

      if (remainingHeight > 0) {
        pages.push([]);
        usedHeight = 0;
      }
    }
  }

  return pages;
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
  const pages = paginatePreviewBlocks(layout.blocks, layout.pageHeight);
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
  const pageBreaks = findPageBreaks(layout.blocks, layout.pageHeight, layout.estimatedPages);

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
