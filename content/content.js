(() => {
if (window.__notionPdfPreviewInstalled) {
  return;
}
window.__notionPdfPreviewInstalled = true;

const OVERLAY_ID = "notion-pdf-preview-overlay";
const PANEL_ID = "notion-pdf-preview-panel";
const PDF_PREVIEW_ID = "notion-pdf-preview-pages";

const A4_WIDTH_PX = 793.7;
const A4_HEIGHT_PX = 1122.52;
const DEFAULT_MARGIN_PX = 40;
const PAGE_BODY_WIDTH_PX = A4_WIDTH_PX - DEFAULT_MARGIN_PX * 2;
const PAGE_BODY_HEIGHT_PX = A4_HEIGHT_PX - DEFAULT_MARGIN_PX * 2;
const MIN_SCALE_PERCENT = 11;
const MAX_SCALE_PERCENT = 199;
let previewState = null;
let previewUpdateQueued = false;

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

function getPrimaryTextElement(block) {
  return block.querySelector("h1, h2, h3, [contenteditable='true'], [data-content-editable-leaf], span") || block;
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

  return Array.from(contentRoot.querySelectorAll("h1, h2, h3, p, li, table, pre, blockquote, figure, img, hr"))
    .filter((block) => getVisibleRect(block));
}

function classifyBlock(block) {
  const tagName = block.tagName.toLowerCase();
  const text = getElementText(block);
  const blockInfo = `${tagName} ${block.className || ""} ${block.getAttribute("role") || ""} ${block.getAttribute("aria-label") || ""}`.toLowerCase();
  const primaryTextElement = getPrimaryTextElement(block);
  const primaryStyle = window.getComputedStyle(primaryTextElement);
  const fontSize = Number.parseFloat(primaryStyle.fontSize) || 14;
  const fontWeight = Number.parseInt(primaryStyle.fontWeight, 10) || 400;

  if (tagName === "hr" || block.querySelector("hr")) {
    return "divider";
  }

  if (tagName === "img" || tagName === "figure" || block.querySelector("img, figure")) {
    return "media";
  }

  if (
    tagName === "table" ||
    block.querySelector("table, [role='table'], [role='grid'], [role='row'], [role='cell'], [role='columnheader']") ||
    blockInfo.includes("table") ||
    blockInfo.includes("grid")
  ) {
    return "table";
  }

  if (tagName === "pre" || block.querySelector("pre, code") || blockInfo.includes("code") || primaryStyle.fontFamily.toLowerCase().includes("mono")) {
    return "code";
  }

  if (tagName === "blockquote" || block.querySelector("blockquote") || blockInfo.includes("quote")) {
    return "quote";
  }

  if (blockInfo.includes("callout")) {
    return "callout";
  }

  const heading = block.querySelector("h1, h2, h3");
  if (tagName === "h1" || heading?.tagName.toLowerCase() === "h1" || blockInfo.includes("header-block") || fontSize >= 28) {
    return "heading1";
  }

  if (tagName === "h2" || heading?.tagName.toLowerCase() === "h2" || blockInfo.includes("sub_header") || fontSize >= 22) {
    return "heading2";
  }

  if (tagName === "h3" || heading?.tagName.toLowerCase() === "h3" || blockInfo.includes("sub_sub_header") || (fontSize >= 17 && fontWeight >= 600)) {
    return "heading3";
  }

  if (tagName === "li" || block.closest("ul, ol") || blockInfo.includes("bulleted") || blockInfo.includes("numbered") || /^(\d+\.|[*-])\s+/.test(text)) {
    return "list";
  }

  if (!text) {
    return "blank";
  }

  return "paragraph";
}

function estimateWrappedLines(text, fontSize, layoutWidth, reservedWidth = 0) {
  if (!text) {
    return 1;
  }

  const averageCharWidth = fontSize * 0.5;
  const availableWidth = Math.max(120, layoutWidth - reservedWidth);
  const charsPerLine = Math.max(12, Math.floor(availableWidth / averageCharWidth));
  return text.split("\n").reduce((lineCount, rawLine) => {
    const line = rawLine.trim();
    return lineCount + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
}

function estimateTableHeight(block, layoutWidth) {
  const rows = Array.from(block.querySelectorAll("tr"));
  if (rows.length) {
    return 18 + rows.reduce((height, row) => {
      const cellText = getElementText(row);
      const lines = estimateWrappedLines(cellText, 13, layoutWidth, 48);
      return height + Math.max(31, lines * 17 + 10);
    }, 0);
  }

  const text = getElementText(block);
  const rowCount = Math.max(2, text.split(/\n|\|/).filter(Boolean).length / 3);
  return 18 + Math.ceil(rowCount) * 36;
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

function estimateBlockHeight(block, layoutWidth, type = classifyBlock(block)) {
  const rawText = block.innerText || block.textContent || "";
  const text = rawText.trim();

  switch (type) {
    case "heading1":
      return estimateWrappedLines(text, 30, layoutWidth) * 35 + 12;
    case "heading2":
      return estimateWrappedLines(text, 24, layoutWidth) * 28 + 10;
    case "heading3":
      return estimateWrappedLines(text, 19, layoutWidth) * 23 + 8;
    case "list":
      return estimateWrappedLines(text, 14, layoutWidth, 28) * 19 + 2;
    case "quote":
      return estimateWrappedLines(text, 15, layoutWidth, 28) * 21 + 12;
    case "callout":
      return estimateWrappedLines(text, 14, layoutWidth, 54) * 20 + 18;
    case "code":
      return estimateWrappedLines(rawText, 13, layoutWidth, 32) * 18 + 22;
    case "table":
      return estimateTableHeight(block, layoutWidth);
    case "media":
      return estimateMediaHeight(block, layoutWidth);
    case "divider":
      return 22;
    case "blank":
      return 18;
    default:
      return estimateWrappedLines(text, 14, layoutWidth) * 19 + 5;
  }
}

function estimateDocumentLayout(contentRoot, scalePercent) {
  const scaleFactor = scalePercent / 100;
  const layoutWidth = PAGE_BODY_WIDTH_PX / scaleFactor;
  const blocks = getContentBlocks(contentRoot);
  const measuredBlocks = blocks.map((element) => {
    const type = classifyBlock(element);
    return {
      element,
      type,
      text: getElementText(element),
      height: estimateBlockHeight(element, layoutWidth, type)
    };
  });
  const totalHeight = measuredBlocks.reduce((sum, block) => sum + block.height, 0);

  return {
    blocks: measuredBlocks,
    estimatedPages: Math.max(1, Math.ceil(Math.max(1, totalHeight) / (PAGE_BODY_HEIGHT_PX / scaleFactor))),
    layoutWidth,
    pageHeight: PAGE_BODY_HEIGHT_PX / scaleFactor
  };
}

function findPageBreaks(blocks, pageHeight, estimatedPages) {
  const breaks = [];
  let accumulatedHeight = 0;
  let blockIndex = 0;

  for (let pageNumber = 1; pageNumber < estimatedPages; pageNumber += 1) {
    const pageEnd = pageHeight * pageNumber;

    while (blockIndex < blocks.length && accumulatedHeight + blocks[blockIndex].height < pageEnd) {
      accumulatedHeight += blocks[blockIndex].height;
      blockIndex += 1;
    }

    const block = blocks[Math.min(blockIndex, blocks.length - 1)];
    if (!block) {
      continue;
    }

    const previousHeight = accumulatedHeight;
    const offsetRatio = block.height > 0 ? Math.min(1, Math.max(0, (pageEnd - previousHeight) / block.height)) : 0;
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
      sendResponse(showPreview(message.scalePercent));
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
