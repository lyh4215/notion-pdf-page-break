const OVERLAY_ID = "notion-pdf-preview-overlay";
const PANEL_ID = "notion-pdf-preview-panel";

const A4_HEIGHT_PX = 1122.52;
const DEFAULT_MARGIN_PX = 52;
const PAGE_BODY_HEIGHT_PX = A4_HEIGHT_PX - DEFAULT_MARGIN_PX * 2;
const MIN_SCALE_PERCENT = 11;
const MAX_SCALE_PERCENT = 199;

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

function findNotionContentRoot() {
  const selectors = [
    ".notion-page-content",
    "[data-testid='page-content']",
    "main [data-block-id]"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && getVisibleRect(element)) {
      return selector === "main [data-block-id]" ? element.closest("main") || element.parentElement : element;
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

function getContentMetrics(contentRoot) {
  const blockRects = Array.from(contentRoot.querySelectorAll("[data-block-id], h1, h2, h3, p, ul, ol, table, figure, img"))
    .map(getVisibleRect)
    .filter(Boolean);

  const fallbackRect = contentRoot.getBoundingClientRect();
  if (!blockRects.length) {
    return {
      top: fallbackRect.top + window.scrollY,
      bottom: fallbackRect.bottom + window.scrollY,
      left: fallbackRect.left + window.scrollX,
      width: fallbackRect.width
    };
  }

  const top = Math.min(...blockRects.map((rect) => rect.top)) + window.scrollY;
  const bottom = Math.max(...blockRects.map((rect) => rect.bottom)) + window.scrollY;
  const left = Math.max(16, fallbackRect.left + window.scrollX);
  const width = Math.max(280, Math.min(fallbackRect.width || 720, document.documentElement.clientWidth - left - 16));

  return { top, bottom, left, width };
}

function createPageLine(pageNumber, top, left, width) {
  const line = document.createElement("div");
  line.className = "notion-pdf-preview-line";
  line.dataset.label = `Page ${pageNumber} end`;
  line.style.top = `${top}px`;
  line.style.setProperty("--notion-pdf-preview-left", `${left}px`);
  line.style.setProperty("--notion-pdf-preview-width", `${width}px`);
  return line;
}

function createPanel({ estimatedPages, scalePercent, effectivePageHeight }) {
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "notion-pdf-preview-panel";

  const title = document.createElement("strong");
  title.textContent = `Estimated pages: ${estimatedPages}`;

  const details = document.createElement("span");
  details.textContent = `A4 portrait | ${scalePercent}% scale | ${Math.round(effectivePageHeight)}px per page`;

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear preview";
  clearButton.addEventListener("click", clearPreview);

  panel.append(title, details, clearButton);
  return panel;
}

function showPreview(scalePercentInput) {
  const scalePercent = clampScale(scalePercentInput);
  const contentRoot = findNotionContentRoot();
  if (!contentRoot) {
    throw new Error("Could not find Notion page content.");
  }

  const metrics = getContentMetrics(contentRoot);
  const contentHeight = Math.max(1, metrics.bottom - metrics.top);
  const effectivePageHeight = PAGE_BODY_HEIGHT_PX / (scalePercent / 100);
  const estimatedPages = Math.max(1, Math.ceil(contentHeight / effectivePageHeight));

  clearPreview();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "notion-pdf-preview-overlay";
  overlay.style.height = `${Math.max(document.documentElement.scrollHeight, metrics.bottom + 80)}px`;

  for (let pageNumber = 1; pageNumber < estimatedPages; pageNumber += 1) {
    overlay.append(
      createPageLine(
        pageNumber,
        metrics.top + effectivePageHeight * pageNumber,
        metrics.left,
        metrics.width
      )
    );
  }

  document.body.append(overlay, createPanel({ estimatedPages, scalePercent, effectivePageHeight }));

  return { estimatedPages };
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
