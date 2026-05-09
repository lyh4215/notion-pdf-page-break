(() => {
if (window.__notionPdfPreviewInstalled) {
  return;
}
window.__notionPdfPreviewInstalled = true;

const OVERLAY_ID = "notion-pdf-preview-overlay";
const PANEL_ID = "notion-pdf-preview-panel";
const PDF_PREVIEW_ID = "notion-pdf-preview-pages";
const MEASURE_ROOT_ID = "notion-pdf-preview-measure-root";

// Calibrated from Notion native PDF export: A4, scale 100%.
// PDF units: 1pt = 4/3 CSS px.
const PT_TO_CSS_PX = 4 / 3;

const A4_WIDTH_PT = 595.92;
const A4_HEIGHT_PT = 842.88;
const A4_WIDTH_PX = A4_WIDTH_PT * PT_TO_CSS_PX;
const A4_HEIGHT_PX = A4_HEIGHT_PT * PT_TO_CSS_PX;

// Notion native PDF export content box, A4 scale 100%.
// Body content uses ~1 inch margins; browser footer/header live outside this box.
const PAGE_BODY_MARGIN_PT = 72;
const PAGE_BODY_WIDTH_PT = A4_WIDTH_PT - PAGE_BODY_MARGIN_PT * 2;
const PAGE_BODY_HEIGHT_PT = A4_HEIGHT_PT - PAGE_BODY_MARGIN_PT * 2;
const PAGE_BODY_WIDTH_PX = PAGE_BODY_WIDTH_PT * PT_TO_CSS_PX;
const PAGE_BODY_HEIGHT_PX = PAGE_BODY_HEIGHT_PT * PT_TO_CSS_PX;
const PAGE_TITLE_FONT_SIZE_PT = 30;
const H2_FONT_SIZE_PT = 22.5;
const H3_FONT_SIZE_PT = 18;
const H4_FONT_SIZE_PT = 15;
const BODY_TEXT_FONT_SIZE_PT = 12;
const INLINE_CODE_FONT_SIZE_PT = 8.75;
const INLINE_CODE_ONLY_LINE_HEIGHT_PT = 12.5;
const INLINE_MATH_LINE_HEIGHT_PT = 18.75;
const CODE_BLOCK_FONT_SIZE_PT = 13;
const CODE_BLOCK_LINE_HEIGHT_PT = 18;
const CODE_BLOCK_PADDING_TOP_PT = 12;
const CODE_BLOCK_PADDING_RIGHT_PT = 12;
const CODE_BLOCK_PADDING_BOTTOM_PT = 14;
const CODE_BLOCK_PADDING_LEFT_PT = 12;
const CODE_BLOCK_MARGIN_BOTTOM_PT = 5.5;
const TABLE_TEXT_FONT_SIZE_PT = 10.5;
const TABLE_TOP_GAP_PT = 5.5;
const EQUATION_INTER_GAP_PT = 13;
const EQUATION_TALL_PAGE_TOP_HEIGHT_PT = 68.6;
const EQUATION_METRIC_PRESETS = {
  short: { glyphHeightPt: 19.13, topGapPt: 13.6, bottomGapPt: 15 },
  fraction: { glyphHeightPt: 36.56, topGapPt: 14, bottomGapPt: 12.5 },
  sigma: { glyphHeightPt: 45.81, topGapPt: 14, bottomGapPt: 12.8 },
  integral: { glyphHeightPt: 41.94, topGapPt: 13, bottomGapPt: 12 },
  matrix2: { glyphHeightPt: 35.91, topGapPt: 15, bottomGapPt: 15 },
  matrix3: { glyphHeightPt: 51.56, topGapPt: 15, bottomGapPt: 15.9 },
  cases2: { glyphHeightPt: 43.56, topGapPt: 16.1, bottomGapPt: 14.4 },
  cases3: { glyphHeightPt: 78.06, topGapPt: 0, bottomGapPt: 10.7, pageTopHeightPt: 88.8 },
  aligned3: { glyphHeightPt: 63.38, topGapPt: 13.6, bottomGapPt: 20.4 },
  alignedLarge: { glyphHeightPt: 139.56, topGapPt: 14.3, bottomGapPt: 16.1, pageTopHeightPt: 155.7 }
};
const BODY_TEXT_FONT_SIZE_PX = BODY_TEXT_FONT_SIZE_PT * PT_TO_CSS_PX;
const CODE_BLOCK_FONT_SIZE_PX = CODE_BLOCK_FONT_SIZE_PT * PT_TO_CSS_PX;
const BODY_CJK_ADVANCE_RATIO = 0.92;
const HEADING_CJK_ADVANCE_RATIO = 0.91;
const LATIN_ADVANCE_RATIO = 1;
const INLINE_CODE_SCALE = INLINE_CODE_FONT_SIZE_PT / BODY_TEXT_FONT_SIZE_PT;
const INLINE_CODE_HORIZONTAL_PADDING_EM = 0.7;
const BODY_FONT_STACK = "Inter, \"NotoSansCJKkr-Regular\", \"Noto Sans CJK KR\", \"Noto Sans KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", Arial, sans-serif";
const HEADING_FONT_STACK = "Inter, \"NotoSansCJKkr-Bold\", \"Noto Sans CJK KR\", \"Noto Sans KR\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", Arial, sans-serif";
const CODE_FONT_STACK = "\"DejaVu Sans Mono\", SFMono-Regular, Menlo, Consolas, \"PT Mono\", \"Liberation Mono\", Courier, monospace";
const MIN_SCALE_PERCENT = 11;
const MAX_SCALE_PERCENT = 199;
let previewState = null;
let previewUpdateQueued = false;
let textMeasureContext = null;
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
  document.getElementById(MEASURE_ROOT_ID)?.remove();
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
      return ` ${getInlineMathDisplayText(node) || "math"} `;
    }

    return Array.from(node.childNodes).map(walk).join("");
  }

  return walk(element).replace(/\s+/g, " ").trim();
}

function getKatexSourceText(katexElement) {
  const annotation = katexElement.querySelector("annotation[encoding='application/x-tex'], annotation");
  return (annotation?.textContent || katexElement.textContent || "").replace(/\u200b/g, "").trim();
}

function getInlineMathDisplayText(katexElement) {
  return getKatexSourceText(katexElement).replace(/\s+/g, "");
}

function getInlineMathFragmentsForPreview(element, ownOnly = false) {
  const ownerBlock = element.closest("[data-block-id]") || element;
  const fragments = Array.from(element.querySelectorAll(".katex"))
    .filter((candidate) => !candidate.closest(".katex-display, .katex-mathml"))
    .filter((candidate) => !ownOnly || (candidate.closest("[data-block-id]") || ownerBlock) === ownerBlock)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const text = getInlineMathDisplayText(candidate);
      return text
        ? {
            text,
            comparable: normalizeTextForInlineCodeStats(text),
            width: Math.max(0, rect.width || 0)
          }
        : null;
    })
    .filter(Boolean);

  return Array.from(new Map(fragments.map((fragment) => [fragment.comparable, fragment])).values())
    .sort((a, b) => b.text.length - a.text.length);
}

function findInlineMathFragment(token, inlineMathFragments = []) {
  const comparableToken = normalizeTextForInlineCodeStats(token).replace(/[.,:;]+$/, "");
  if (!comparableToken) {
    return null;
  }

  return inlineMathFragments.find((fragment) => {
    return fragment.comparable && (comparableToken.includes(fragment.comparable) || fragment.comparable.includes(comparableToken));
  }) || null;
}

function isInlineMathVisualLine(element, line, ownOnly = false) {
  const normalizedLine = normalizeTextForInlineCodeStats(line);
  if (!normalizedLine) {
    return false;
  }

  return getInlineMathFragmentsForPreview(element, ownOnly).some((fragment) => normalizedLine.includes(fragment.comparable));
}

function normalizeTextForInlineCodeStats(text) {
  return (text || "").replace(/\s+/g, "");
}

function isInlineCodeElement(element) {
  if (!element || element.closest("pre, .notion-code-block, .katex, .katex-mathml")) {
    return false;
  }

  if (element.matches(".notion-inline-code-container, code")) {
    return true;
  }

  const inlineStyle = (element.getAttribute("style") || "").toLowerCase();
  if (inlineStyle.includes("sfmono") || inlineStyle.includes("monospace")) {
    return true;
  }

  const style = window.getComputedStyle(element);
  return style.fontFamily.toLowerCase().includes("mono");
}

function getInlineCodeTextForEstimate(element, ownOnly = false) {
  const ownerBlock = element.closest("[data-block-id]") || element;
  const inlineElements = Array.from(element.querySelectorAll(".notion-inline-code-container, code, span"))
    .filter((candidate) => isInlineCodeElement(candidate))
    .filter((candidate, index, candidates) => !candidates.some((other, otherIndex) => otherIndex !== index && other.contains(candidate)))
    .filter((candidate) => !ownOnly || (candidate.closest("[data-block-id]") || ownerBlock) === ownerBlock);

  return inlineElements.map(getElementText).join(" ").trim();
}

function getInlineCodeFragmentsForPreview(element, ownOnly = false) {
  const ownerBlock = element.closest("[data-block-id]") || element;
  const fragments = Array.from(element.querySelectorAll(".notion-inline-code-container, code, span"))
    .filter((candidate) => isInlineCodeElement(candidate))
    .filter((candidate, index, candidates) => !candidates.some((other, otherIndex) => otherIndex !== index && other.contains(candidate)))
    .filter((candidate) => !ownOnly || (candidate.closest("[data-block-id]") || ownerBlock) === ownerBlock)
    .map(getElementText)
    .filter(Boolean);
  const expandedFragments = fragments.flatMap((fragment) => {
    if (fragment.length <= 40) {
      return [fragment];
    }

    return [fragment, ...fragment.split(/\s+/).filter((token) => token.length >= 3)];
  });

  return Array.from(new Set(expandedFragments)).sort((a, b) => b.length - a.length);
}

function isInlineCodeOnlyVisualLine(element, line, ownOnly = false) {
  const normalizedLine = normalizeTextForInlineCodeStats(line);
  if (!normalizedLine) {
    return false;
  }

  const normalizedInlineText = normalizeTextForInlineCodeStats(getInlineCodeTextForEstimate(element, ownOnly));
  return Boolean(normalizedInlineText) && normalizedInlineText.includes(normalizedLine);
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

function getTextMeasureContext() {
  if (!textMeasureContext) {
    const canvas = document.createElement("canvas");
    textMeasureContext = canvas.getContext("2d");
  }

  return textMeasureContext;
}

function measureRawTextWidth(text, fontSize, fontKind = "body") {
  const context = getTextMeasureContext();
  if (!context) {
    return Array.from(text).length * fontSize * 0.5;
  }

  const family = fontKind === "code"
    ? CODE_FONT_STACK
    : fontKind === "heading" || fontKind === "title"
      ? HEADING_FONT_STACK
      : BODY_FONT_STACK;
  const weight = fontKind === "title" ? 700 : fontKind === "heading" ? 600 : 400;
  context.font = `${weight} ${fontSize}px ${family}`;

  return context.measureText(text).width;
}

function getCharacterWidth(character, fontSize, fontKind = "body") {
  if (fontKind === "code") {
    return measureRawTextWidth(character, fontSize, fontKind);
  }

  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]/.test(character)) {
    return measureRawTextWidth(character, fontSize, fontKind) * getCjkAdvanceRatio(fontKind);
  }

  return measureRawTextWidth(character, fontSize, fontKind) * LATIN_ADVANCE_RATIO;
}

function getCjkAdvanceRatio(fontKind) {
  return fontKind === "heading" || fontKind === "title"
    ? HEADING_CJK_ADVANCE_RATIO
    : BODY_CJK_ADVANCE_RATIO;
}

function getSegmentCjkAdvanceRatio(segmentType) {
  return segmentType === "pageTitle" || segmentType === "h2" || segmentType === "h3" || segmentType === "h4"
    ? HEADING_CJK_ADVANCE_RATIO
    : BODY_CJK_ADVANCE_RATIO;
}

function estimateWrappedLines(text, fontSize, layoutWidth, reservedWidth = 0, fontKind = "body") {
  return wrapTextLinesForPreview(text || " ", fontSize, layoutWidth, reservedWidth, [], fontKind).length;
}

function getComparableInlineCodeText(text) {
  return normalizeTextForInlineCodeStats(text).replace(/[.,:;]+$/, "");
}

function isInlineCodeToken(token, inlineCodeFragments = []) {
  const comparableToken = getComparableInlineCodeText(token);

  if (!comparableToken) {
    return false;
  }

  return inlineCodeFragments.some((fragment) => {
    const comparableFragment = getComparableInlineCodeText(fragment);
    return comparableFragment && (comparableFragment.includes(comparableToken) || comparableToken.includes(comparableFragment));
  });
}

function getInlineCodeTokenWidth(token, fontSize) {
  const codeFontSize = fontSize * INLINE_CODE_SCALE;
  return getTextWidth(token, codeFontSize, "code") + codeFontSize * INLINE_CODE_HORIZONTAL_PADDING_EM;
}

function wrapTextLinesForPreview(text, fontSize, layoutWidth, reservedWidth = 0, inlineCodeFragments = [], fontKind = "body", inlineMathFragments = []) {
  if (!text) {
    return ["(empty block)"];
  }

  const availableWidth = Math.max(120, layoutWidth - reservedWidth);
  const lines = [];

  for (const rawLine of text.split("\n")) {
    const line = fontKind === "code"
      ? rawLine.replace(/\t/g, "    ")
      : rawLine.trim().replace(/\s+/g, " ");
    if (!line) {
      lines.push("");
      continue;
    }

    let currentWidth = 0;
    let currentLine = "";

    function appendBreakableCharacters(value, characterFontSize = fontSize, characterFontKind = fontKind) {
      for (const character of value) {
        const characterWidth = getCharacterWidth(character, characterFontSize, characterFontKind);
        const remainingWidth = availableWidth - currentWidth;
        if (currentLine && characterWidth > remainingWidth) {
          lines.push(currentLine.trimEnd());
          currentLine = "";
          currentWidth = 0;
        }

        currentLine += character;
        currentWidth += characterWidth;
      }
    }

    function appendUnbreakableToken(value) {
      const mathFragment = findInlineMathFragment(value, inlineMathFragments);
      const isCodeToken = isInlineCodeToken(value, inlineCodeFragments);
      const tokenFontSize = isCodeToken ? fontSize * INLINE_CODE_SCALE : fontSize;
      const tokenWidth = mathFragment
        ? getInlineMathTokenWidth(value, mathFragment, tokenFontSize, fontKind)
        : isCodeToken ? getInlineCodeTokenWidth(value, fontSize) : getTextWidth(value, tokenFontSize, fontKind);
      const remainingWidth = availableWidth - currentWidth;

      if (currentLine && tokenWidth > remainingWidth) {
        lines.push(currentLine.trimEnd());
        currentLine = "";
        currentWidth = 0;
      }

      currentLine += value;
      currentWidth += tokenWidth;
    }

    function appendMixedToken(value) {
      const isCodeToken = isInlineCodeToken(value, inlineCodeFragments);
      const tokenFontSize = isCodeToken ? fontSize * INLINE_CODE_SCALE : fontSize;
      const partFontKind = isCodeToken ? "code" : fontKind;

      for (const part of value.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]|[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]+/g) || []) {
        if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]/.test(part)) {
          appendBreakableCharacters(part, tokenFontSize, partFontKind);
        } else {
          appendUnbreakableToken(part);
        }
      }
    }

    if (fontKind === "code") {
      appendBreakableCharacters(line, fontSize, "code");
      lines.push(currentLine.trimEnd());
      continue;
    }

    for (const token of line.match(/\S+\s*/g) || []) {
      const tokenValue = currentLine ? token : token.trimStart();

      if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]/.test(tokenValue)) {
        appendMixedToken(tokenValue);
      } else {
        appendUnbreakableToken(tokenValue);
      }
    }

    lines.push(currentLine.trimEnd());
  }

  return lines;
}

function getTextWidth(text, fontSize, fontKind = "body") {
  return Array.from(text).reduce((sum, character) => sum + getCharacterWidth(character, fontSize, fontKind), 0);
}

function getInlineMathTokenWidth(token, mathFragment, fontSize, fontKind) {
  const comparableToken = normalizeTextForInlineCodeStats(token);
  const extraText = comparableToken.replace(mathFragment.comparable, "");
  return mathFragment.width + getTextWidth(extraText, fontSize, fontKind);
}

function getCodePreviewLines(text, layoutWidth) {
  const horizontalPadding = ptToPx(CODE_BLOCK_PADDING_LEFT_PT + CODE_BLOCK_PADDING_RIGHT_PT);
  const fontSize = ptToPx(CODE_BLOCK_FONT_SIZE_PT);
  const rawLines = (text || "").split("\n");
  const lines = rawLines.flatMap((line) => wrapTextLinesForPreview(line || " ", fontSize, layoutWidth, horizontalPadding, [], "code"));
  return lines.length ? lines : [" "];
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
      ...row.map((cellText) => estimateWrappedLines(cellText, ptToPx(TABLE_TEXT_FONT_SIZE_PT), cellWidth))
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
  // top gap 11.5pt, font 10.5pt, one-line row height 21.75pt.
  const rowHeights = estimateTableRowHeights(block, layoutWidth);
  const tableHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, ptToPx(0.75));
  const extraText = getTextOutsideTable(block);
  const topGap = ptToPx(TABLE_TOP_GAP_PT);

  if (!extraText) {
    return topGap + tableHeight;
  }

  const extraLines = estimateWrappedLines(extraText, ptToPx(12), layoutWidth);
  return topGap + tableHeight + blockHeightFromPt(extraLines, 18, -0.62, 6.6);
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
  return ptToPx(getEquationMetrics(block).samePageHeightPt);
}

function getEquationMetrics(block) {
  const mathRects = getVisualMathRects(block);
  const mathUnionRect = getUnionRectFromRects(mathRects);
  const domHeightPt = mathUnionRect ? mathUnionRect.height / PT_TO_CSS_PX : 0;
  const presetName = classifyEquationPreset(block, domHeightPt);
  const preset = EQUATION_METRIC_PRESETS[presetName] || EQUATION_METRIC_PRESETS.short;
  const glyphHeightPt = domHeightPt > 0
    ? clamp(domHeightPt, preset.glyphHeightPt * 0.85, preset.glyphHeightPt * 1.15)
    : preset.glyphHeightPt;
  const samePageHeightPt = preset.topGapPt + glyphHeightPt + preset.bottomGapPt;

  return {
    preset: presetName,
    glyphHeightPt,
    topGapPt: preset.topGapPt,
    bottomGapPt: preset.bottomGapPt,
    samePageHeightPt,
    pageTopHeightPt: preset.pageTopHeightPt || glyphHeightPt + preset.bottomGapPt
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getEquationSourceText(block) {
  return Array.from(block.querySelectorAll(".katex"))
    .map(getKatexSourceText)
    .filter(Boolean)
    .join(" ");
}

function classifyEquationPreset(block, domHeightPt = 0) {
  const source = getEquationSourceText(block);
  const rowBreakCount = (source.match(/\\\\/g) || []).length;

  if (/aligned|align|gather|multline/i.test(source)) {
    return /prod|sum|\\sum|\\prod|frac|\\frac/i.test(source) || domHeightPt > 100
      ? "alignedLarge"
      : "aligned3";
  }

  if (/cases/i.test(source)) {
    return rowBreakCount >= 2 || domHeightPt > 60 ? "cases3" : "cases2";
  }

  if (/matrix|pmatrix|bmatrix|vmatrix|array/i.test(source)) {
    return rowBreakCount >= 2 || domHeightPt > 44 ? "matrix3" : "matrix2";
  }

  if (/\\int|∫/.test(source)) {
    return "integral";
  }

  if (/\\sum|\\prod|∑|∏/.test(source)) {
    return "sigma";
  }

  if (/\\frac|\\dfrac|\\tfrac|\/.+\//.test(source) || domHeightPt >= 30) {
    return "fraction";
  }

  return "short";
}

function estimateInlineMathAwareHeight(block, baseHeight) {
  return baseHeight;
}

function getTextFlowLineHeights(element, lines, ownOnly = false) {
  return lines.map((line) => {
    if (isInlineCodeOnlyVisualLine(element, line, ownOnly)) {
      return ptToPx(INLINE_CODE_ONLY_LINE_HEIGHT_PT);
    }

    if (isInlineMathVisualLine(element, line, ownOnly)) {
      return ptToPx(INLINE_MATH_LINE_HEIGHT_PT);
    }

    return ptToPx(18);
  });
}

function sumHeights(heights, start = 0, end = heights.length) {
  return heights.slice(start, end).reduce((sum, height) => sum + height, 0);
}

function estimateTextFlowHeight(block, text, layoutWidth, reservedWidth, afterGapPt, ownOnly = false) {
  const inlineCodeFragments = getInlineCodeFragmentsForPreview(block, ownOnly);
  const inlineMathFragments = getInlineMathFragmentsForPreview(block, ownOnly);
  const lines = wrapTextLinesForPreview(text || " ", BODY_TEXT_FONT_SIZE_PX, layoutWidth, reservedWidth, inlineCodeFragments, "body", inlineMathFragments);
  const lineHeightSum = sumHeights(getTextFlowLineHeights(block, lines, ownOnly));
  return lineHeightSum + ptToPx(-0.62 + afterGapPt);
}

function estimateListItemHeight(text, layoutWidth, depth = 0, compact = false, block = null) {
  const reservedWidth = ptToPx(21.6 + depth * 18);
  return estimateTextFlowHeight(block || document.body, text, layoutWidth, reservedWidth, compact ? 0 : 7.8, true);
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
  let height = estimateListItemHeight(ownText, layoutWidth, 0, compact, block);
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
      // Measured formula: 43.5n + 16 pt.
      const lines = estimateWrappedLines(text, ptToPx(PAGE_TITLE_FONT_SIZE_PT), layoutWidth, 0, "title");
      return blockHeightFromPt(lines, 43.5, 0, 16);
    }

    case "h2": {
      // Important:
      // In Notion DOM, markdown # is rendered as h2.
      // Measured markdown # formula:
      // visible = 27n + 5.58 pt, after gap = 3 pt.
      const lines = estimateWrappedLines(text, ptToPx(H2_FONT_SIZE_PT), layoutWidth, 0, "heading");
      return blockHeightFromPt(lines, 27, 5.58, 8);
    }

    case "h3": {
      // Important:
      // In Notion DOM, markdown ## is rendered as h3.
      // Measured markdown ## formula:
      // visible = 21.75n + 4.31 pt, after gap = 12.5 pt.
      const lines = estimateWrappedLines(text, ptToPx(H3_FONT_SIZE_PT), layoutWidth, 0, "heading");
      return blockHeightFromPt(lines, 21.75, 4.31, 12.5);
    }

    case "h4": {
      // Important:
      // In Notion DOM, markdown ### is rendered as h4.
      // Measured markdown ### formula:
      // visible = 18n + 3.72 pt, after gap = 8 pt.
      const lines = estimateWrappedLines(text, ptToPx(H4_FONT_SIZE_PT), layoutWidth, 0, "heading");
      return blockHeightFromPt(lines, 18, 3.72, 8);
    }

    case "list": {
      return estimateListHeight(block, layoutWidth);
    }

    case "quote": {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, ptToPx(14.25), 12.6);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }
    
    case "equation":
      return estimateEquationHeight(block);

    case "callout": {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, ptToPx(40), 18);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }

    case "code": {
      // Measured code block formula: 18n + 26 pt.
      // n is visual line slots, including blank lines and wrapped long code lines.
      const lineSlots = Math.max(1, getCodePreviewLines(getCodeRawTextForEstimate(block), layoutWidth).length);
      return blockHeightFromPt(lineSlots, CODE_BLOCK_LINE_HEIGHT_PT, CODE_BLOCK_PADDING_TOP_PT + CODE_BLOCK_PADDING_BOTTOM_PT, CODE_BLOCK_MARGIN_BOTTOM_PT);
    }

    case "table":
      return estimateTableHeight(block, layoutWidth);

    case "media":
      return estimateMediaHeight(block, layoutWidth);

    case "divider":
      return ptToPx(14);

    case "blank":
      return ptToPx(18);

    default: {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, 0, 6.6);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }
  }
}

function getInheritedStyleSnapshot(element) {
  const style = window.getComputedStyle(element);

  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight
  };
}

function applyInheritedStyleSnapshot(element, styleSnapshot) {
  if (!styleSnapshot) {
    return;
  }

  Object.assign(element.style, styleSnapshot);
}

function createMeasurementRoot(contentRoot, layoutWidth) {
  document.getElementById(MEASURE_ROOT_ID)?.remove();

  const root = document.createElement("div");

  root.id = MEASURE_ROOT_ID;
  root.className = "notion-pdf-preview-measure-root";
  root.style.width = `${layoutWidth}px`;
  applyInheritedStyleSnapshot(root, getInheritedStyleSnapshot(contentRoot));

  document.body.append(root);
  return root;
}

function prepareCloneForMeasurement(clone, type = "paragraph") {
  clone.dataset.pdfPreviewType = type;
  clone.removeAttribute("id");
  clone.removeAttribute("contenteditable");
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.minWidth = "0";
  clone.style.marginLeft = "0";
  clone.style.marginRight = "0";
  clone.style.alignSelf = "stretch";
  clone.style.transform = "none";

  clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  clone.querySelectorAll("[contenteditable]").forEach((element) => {
    element.setAttribute("contenteditable", "false");
  });

  clone.querySelectorAll("img, video, canvas, iframe").forEach((element) => {
    element.removeAttribute("loading");
  });

  return clone;
}

function shouldUseRenderedHeight(type) {
  return type === "media";
}

function getMarginBottom(element) {
  return Number.parseFloat(window.getComputedStyle(element).marginBottom) || 0;
}

function getMeasuredStackHeight(clone, nextClone) {
  const rect = clone.getBoundingClientRect();

  if (!rect || rect.height <= 0) {
    return 0;
  }

  if (nextClone) {
    const nextRect = nextClone.getBoundingClientRect();
    const stackedHeight = nextRect.top - rect.top;

    if (Number.isFinite(stackedHeight) && stackedHeight > 0) {
      return stackedHeight;
    }
  }

  return rect.height + getMarginBottom(clone);
}

function applyRenderedMeasurements(contentRoot, measuredBlocks, layoutWidth) {
  if (!measuredBlocks.length) {
    return;
  }

  const root = createMeasurementRoot(contentRoot, layoutWidth);
  const clones = [];

  try {
    for (const block of measuredBlocks) {
      const clone = prepareCloneForMeasurement(block.element.cloneNode(true), block.type);
      root.append(clone);
      clones.push(clone);
    }

    // Force a single layout pass after every clone has been stacked at PDF body width.
    root.getBoundingClientRect();

    measuredBlocks.forEach((block, index) => {
      const clone = clones[index];
      const renderedHeight = getMeasuredStackHeight(clone, clones[index + 1]);

      if (shouldUseRenderedHeight(block.type) && Number.isFinite(renderedHeight) && renderedHeight > 0) {
        block.height = renderedHeight;
        block.measurement = "rendered";
      }
    });
  } finally {
    root.remove();
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

  function isTextFlowType(type) {
    return type === "paragraph" || type === "list" || type === "quote" || type === "callout";
  }

  function isLineSplittableTextFlow(block) {
    return isTextFlowType(block.type) && block.height > ptToPx(42);
  }

  function pushTableSegment(block, segmentHeight, consumedRows, rowCount, segmentIndex, clipOffset = 0) {
    const splitAfter = consumedRows < rowCount;
    const tableTopGap = segmentIndex === 0 ? ptToPx(TABLE_TOP_GAP_PT) : 0;
    currentPage().push({
      ...block,
      clipOffset,
      continued: segmentIndex > 0,
      tableTopGap,
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
      const tableTopGap = segmentIndex === 0 ? ptToPx(TABLE_TOP_GAP_PT) : 0;
      let segmentHeight = tableTopGap + borderHeight + repeatedHeaderHeight;
      let originalRows = 0;
      const segmentStartRow = consumedRows;

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
      const clipOffset = rowHeights.slice(0, segmentStartRow).reduce((sum, height) => sum + height, borderHeight);
      pushTableSegment(block, segmentHeight, consumedRows, rowCount, segmentIndex, clipOffset);
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
      const clipOffset = consumedHeight;
      consumedHeight += segmentHeight;
      remainingHeight -= segmentHeight;

      currentPage().push({
        ...block,
        clipOffset,
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

  function getTextFlowLineMetrics(block) {
    const lines = formatSegmentTextForPreview(block).split("\n");
    const lineHeights = getTextFlowLineHeights(block.element, lines, block.type === "list");
    const trailingGap = Math.max(0, block.height - sumHeights(lineHeights));
    return { lines, lineHeights, trailingGap };
  }

  function pushTextFlowSegment(block, lines, lineStart, lineEnd, segmentHeight, segmentIndex, totalLines) {
    const splitAfter = lineEnd < totalLines;
    currentPage().push({
      ...block,
      text: lines.slice(lineStart, lineEnd).join("\n"),
      continued: segmentIndex > 0,
      segmentHeight,
      splitAfter
    });
    usedHeight += segmentHeight;
  }

  function paginateTextFlowBlock(block) {
    const { lines, lineHeights, trailingGap } = getTextFlowLineMetrics(block);
    const totalLines = Math.max(1, lines.length);
    let lineIndex = 0;
    let segmentIndex = 0;

    if (totalLines <= 1) {
      return false;
    }

    while (lineIndex < totalLines) {
      let availableHeight = pageHeight - usedHeight;
      const nextLineHeight = lineHeights[lineIndex] || ptToPx(18);

      if (availableHeight < nextLineHeight && usedHeight > 0) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, lineIndex / totalLines)
        });
        availableHeight = pageHeight;
      }

      const finalHeight = sumHeights(lineHeights, lineIndex) + trailingGap;

      if (finalHeight <= availableHeight) {
        pushTextFlowSegment(block, lines, lineIndex, totalLines, finalHeight, segmentIndex, totalLines);
        lineIndex = totalLines;
        break;
      }

      let lineEnd = lineIndex;
      let segmentHeight = 0;

      while (lineEnd < totalLines && segmentHeight + lineHeights[lineEnd] <= availableHeight) {
        segmentHeight += lineHeights[lineEnd];
        lineEnd += 1;
      }

      if (lineEnd === lineIndex) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, lineIndex / totalLines)
        });
        continue;
      }

      pushTextFlowSegment(block, lines, lineIndex, lineEnd, segmentHeight, segmentIndex, totalLines);
      lineIndex = lineEnd;
      segmentIndex += 1;

      if (lineIndex < totalLines) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, lineIndex / totalLines)
        });
      }
    }

    return true;
  }

  function pushCodeSegment(block, lines, lineStart, lineEnd, segmentHeight, segmentIndex, totalLines, codePaddingTop, codePaddingBottom) {
    const splitAfter = lineEnd < totalLines;
    currentPage().push({
      ...block,
      text: lines.slice(lineStart, lineEnd).join("\n"),
      continued: segmentIndex > 0,
      codePaddingTop,
      codePaddingBottom,
      segmentHeight,
      splitAfter
    });
    usedHeight += segmentHeight;
  }

  function paginateCodeBlock(block) {
    const lines = getCodePreviewLines(block.text || getCodeRawTextForEstimate(block.element), block.layoutWidth || PAGE_BODY_WIDTH_PX);
    const totalLines = Math.max(1, lines.length);
    const lineHeight = ptToPx(CODE_BLOCK_LINE_HEIGHT_PT);
    const firstTopPadding = ptToPx(CODE_BLOCK_PADDING_TOP_PT);
    const finalBottomSpace = ptToPx(CODE_BLOCK_PADDING_BOTTOM_PT + CODE_BLOCK_MARGIN_BOTTOM_PT);
    let lineIndex = 0;
    let segmentIndex = 0;

    while (lineIndex < totalLines) {
      let availableHeight = pageHeight - usedHeight;
      const codePaddingTop = segmentIndex === 0 ? firstTopPadding : 0;

      if (usedHeight > 0 && availableHeight < codePaddingTop + lineHeight) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, lineIndex / totalLines)
        });
        availableHeight = pageHeight;
      }

      const remainingLines = totalLines - lineIndex;
      const finalSegmentHeight = codePaddingTop + remainingLines * lineHeight + finalBottomSpace;

      if (finalSegmentHeight <= availableHeight) {
        pushCodeSegment(block, lines, lineIndex, totalLines, finalSegmentHeight, segmentIndex, totalLines, codePaddingTop, ptToPx(CODE_BLOCK_PADDING_BOTTOM_PT));
        lineIndex = totalLines;
        break;
      }

      const availableLineHeight = Math.max(0, availableHeight - codePaddingTop);
      let fittingLines = Math.floor(availableLineHeight / lineHeight);

      if (fittingLines <= 0) {
        if (usedHeight > 0) {
          startNewPage({
            element: block.element,
            offsetRatio: Math.min(1, lineIndex / totalLines)
          });
          continue;
        }

        fittingLines = 1;
      }

      const lineEnd = Math.min(totalLines, lineIndex + fittingLines);
      const segmentHeight = codePaddingTop + (lineEnd - lineIndex) * lineHeight;
      pushCodeSegment(block, lines, lineIndex, lineEnd, segmentHeight, segmentIndex, totalLines, codePaddingTop, 0);
      lineIndex = lineEnd;
      segmentIndex += 1;

      if (lineIndex < totalLines) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, lineIndex / totalLines)
        });
      }
    }

    return true;
  }

  function pushEquationBlock(block) {
    const metrics = getEquationMetrics(block.element);
    const samePageHeight = ptToPx(metrics.samePageHeightPt);
    const previousSegment = currentPage().at(-1);
    const followsEquation = previousSegment?.type === "equation";
    const blockHeight = followsEquation
      ? ptToPx(Math.max(EQUATION_INTER_GAP_PT, metrics.glyphHeightPt + metrics.bottomGapPt))
      : samePageHeight;

    if (usedHeight > 0 && usedHeight + blockHeight > pageHeight) {
      startNewPage({
        element: block.element,
        offsetRatio: 0
      });
    }

    const startsAtPageTop = usedHeight === 0;
    const segmentHeight = startsAtPageTop
      ? ptToPx(metrics.pageTopHeightPt)
      : followsEquation
        ? blockHeight
        : samePageHeight;

    currentPage().push({
      ...block,
      continued: false,
      equationPreset: metrics.preset,
      segmentHeight,
      splitAfter: false
    });
    usedHeight += segmentHeight;
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

    if (block.type === "code" && usedHeight > 0 && usedHeight + block.height > pageHeight) {
      paginateCodeBlock(block);
      continue;
    }

    if (block.type === "equation") {
      pushEquationBlock(block);
      continue;
    }

    if (
      isLineSplittableTextFlow(block) &&
      usedHeight + block.height > pageHeight
    ) {
      if (paginateTextFlowBlock(block)) {
        continue;
      }
    }

    if (block.height <= pageHeight) {
      if (usedHeight > 0 && usedHeight + block.height > pageHeight) {
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

    if (block.type === "code") {
      paginateCodeBlock(block);
      continue;
    }

    if (usedHeight > 0) {
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
  }

  return {
    breaks,
    pages: pages.filter((page) => page.length > 0)
  };
}

function estimateDocumentLayout(contentRoot, scalePercent) {
  const scaleFactor = scalePercent / 100;
  const layoutWidth = PAGE_BODY_WIDTH_PX / scaleFactor;
  const sourceStyle = getInheritedStyleSnapshot(contentRoot);
  const pageTitleElement = findPageTitleBlock(contentRoot);
  const blocks = getContentBlocks(contentRoot).filter((element) => element !== pageTitleElement);
  const headingFontLevels = getHeadingFontLevels(blocks);
  const measuredBlocks = blocks.map((element) => {
    const type = classifyBlock(element, headingFontLevels);
    const text = type === "code" ? getCodeRawTextForEstimate(element) : getVisibleTextForEstimate(element);
    const measuredBlock = {
      element,
      type,
      text,
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
    const titleText = getVisibleTextForEstimate(pageTitleElement);
    measuredBlocks.unshift({
      element: pageTitleElement,
      type: "pageTitle",
      text: titleText,
      layoutWidth,
      height: estimateBlockHeight(pageTitleElement, layoutWidth, "pageTitle")
    });
  }
  while (measuredBlocks.at(-1)?.type === "blank") {
    measuredBlocks.pop();
  }
  applyRenderedMeasurements(contentRoot, measuredBlocks, layoutWidth);
  const pageHeight = PAGE_BODY_HEIGHT_PX / scaleFactor;
  const pagination = paginateBlocks(measuredBlocks, pageHeight);

  return {
    blocks: measuredBlocks,
    estimatedPages: Math.max(1, pagination.pages.length),
    layoutWidth,
    pageBreaks: pagination.breaks,
    pageHeight,
    pages: pagination.pages,
    sourceStyle
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
      return `${segment.type} | ${Math.round(segment.segmentHeight ?? segment.height)}px${suffix}\n${formatSegmentTextForPreview(segment)}`;
    });

    return [`Page ${pageIndex + 1}`, ...blocks].join("\n\n");
  }).join("\n\n");
}

function getSegmentWrapSettings(segment) {
  const layoutWidth = segment.layoutWidth || PAGE_BODY_WIDTH_PX;

  switch (segment.type) {
    case "pageTitle":
      return { fontSize: ptToPx(PAGE_TITLE_FONT_SIZE_PT), layoutWidth, reservedWidth: 0, fontKind: "title" };
    case "h2":
      return { fontSize: ptToPx(H2_FONT_SIZE_PT), layoutWidth, reservedWidth: 0, fontKind: "heading" };
    case "h3":
      return { fontSize: ptToPx(H3_FONT_SIZE_PT), layoutWidth, reservedWidth: 0, fontKind: "heading" };
    case "h4":
      return { fontSize: ptToPx(H4_FONT_SIZE_PT), layoutWidth, reservedWidth: 0, fontKind: "heading" };
    case "list":
      return { fontSize: BODY_TEXT_FONT_SIZE_PX, layoutWidth, reservedWidth: ptToPx(21.6), fontKind: "body" };
    case "quote":
      return { fontSize: BODY_TEXT_FONT_SIZE_PX, layoutWidth, reservedWidth: ptToPx(14.25), fontKind: "body" };
    case "callout":
      return { fontSize: BODY_TEXT_FONT_SIZE_PX, layoutWidth, reservedWidth: ptToPx(40), fontKind: "body" };
    case "paragraph":
    default:
      return { fontSize: BODY_TEXT_FONT_SIZE_PX, layoutWidth, reservedWidth: 0, fontKind: "body" };
  }
}

function isSyntheticTextSegment(type) {
  return (
    type === "pageTitle" ||
    type === "h2" ||
    type === "h3" ||
    type === "h4" ||
    type === "paragraph" ||
    type === "list" ||
    type === "quote" ||
    type === "callout"
  );
}

function formatSegmentTextForPreview(segment) {
  if (segment.type === "table") {
    return getTableRows(segment.element).map((row) => row.join(" | ")).join("\n") || "(empty block)";
  }

  if (segment.type === "code") {
    const layoutWidth = segment.layoutWidth || PAGE_BODY_WIDTH_PX;
    return getCodePreviewLines(segment.text || "", layoutWidth).join("\n") || "(empty block)";
  }

  if (!isSyntheticTextSegment(segment.type)) {
    return segment.text || "(empty block)";
  }

  const { fontSize, layoutWidth, reservedWidth, fontKind } = getSegmentWrapSettings(segment);
  const inlineCodeFragments = getInlineCodeFragmentsForPreview(segment.element, segment.type === "list");
  const inlineMathFragments = getInlineMathFragmentsForPreview(segment.element, segment.type === "list");
  return wrapTextLinesForPreview(segment.text || "", fontSize, layoutWidth, reservedWidth, inlineCodeFragments, fontKind, inlineMathFragments).join("\n");
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

function createRenderedTablePreview(segment) {
  const table = document.createElement("table");
  table.className = "notion-pdf-preview-synthetic-table";
  const tableTopGap = Number.isFinite(segment.tableTopGap)
    ? segment.tableTopGap
    : segment.continued
      ? 0
      : ptToPx(TABLE_TOP_GAP_PT);
  table.style.marginTop = `${tableTopGap}px`;

  for (const row of getTableRows(segment.element)) {
    const tr = document.createElement("tr");

    for (const cellText of row) {
      const cell = document.createElement("td");
      cell.textContent = cellText;
      tr.append(cell);
    }

    table.append(tr);
  }

  return table;
}

function appendStyledTextRun(parent, value) {
  if (!value) {
    return;
  }

  const runs = value.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]+|[A-Za-z0-9_./:%+-]+|[^A-Za-z0-9_\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]+/g) || [value];

  for (const run of runs) {
    const span = document.createElement("span");
    span.textContent = run;

    if (/^[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u3400-\u9FFF]+$/.test(run)) {
      span.className = "notion-pdf-preview-script-cjk";
    } else if (/^[A-Za-z0-9_./:%+-]+$/.test(run)) {
      span.className = "notion-pdf-preview-script-latin";
    }

    parent.append(span);
  }
}

function appendSyntheticLineContent(lineElement, line, segment) {
  if (segment.type === "code") {
    lineElement.textContent = line || " ";
    return;
  }

  const fragments = isSyntheticTextSegment(segment.type)
    ? getInlineCodeFragmentsForPreview(segment.element, segment.type === "list")
    : [];
  const isInlineCodeOnlyLine = isSyntheticTextSegment(segment.type)
    ? isInlineCodeOnlyVisualLine(segment.element, line, segment.type === "list")
    : false;
  const isInlineMathLine = isSyntheticTextSegment(segment.type)
    ? isInlineMathVisualLine(segment.element, line, segment.type === "list")
    : false;

  if (isInlineCodeOnlyLine) {
    lineElement.classList.add("notion-pdf-preview-synthetic-line-inline-code-only");
  } else if (isInlineMathLine) {
    lineElement.classList.add("notion-pdf-preview-synthetic-line-inline-math");
  }

  if (!fragments.length) {
    appendStyledTextRun(lineElement, line || " ");
    return;
  }

  if (isInlineCodeOnlyLine) {
    const code = document.createElement("span");
    code.className = "notion-pdf-preview-inline-code";
    code.textContent = line || " ";
    lineElement.append(code);
    return;
  }

  let cursor = 0;
  let matched = false;

  while (cursor < line.length) {
    let nextIndex = -1;
    let nextFragment = "";

    for (const fragment of fragments) {
      const index = line.indexOf(fragment, cursor);
      if (index >= 0 && (nextIndex === -1 || index < nextIndex || (index === nextIndex && fragment.length > nextFragment.length))) {
        nextIndex = index;
        nextFragment = fragment;
      }
    }

    if (nextIndex === -1) {
      appendStyledTextRun(lineElement, line.slice(cursor));
      break;
    }

    if (nextIndex > cursor) {
      appendStyledTextRun(lineElement, line.slice(cursor, nextIndex));
    }

    const code = document.createElement("span");
    code.className = "notion-pdf-preview-inline-code";
    code.textContent = nextFragment;
    lineElement.append(code);
    matched = true;
    cursor = nextIndex + nextFragment.length;
  }

  if (!line && !matched) {
    lineElement.textContent = " ";
  }
}

function createSyntheticTextPreview(segment) {
  const text = document.createElement("div");
  text.className = "notion-pdf-preview-synthetic-text";
  text.dataset.type = segment.type;
  text.style.setProperty("--notion-pdf-preview-body-font-size", `${BODY_TEXT_FONT_SIZE_PX}px`);
  text.style.setProperty("--notion-pdf-preview-cjk-scale", getSegmentCjkAdvanceRatio(segment.type));
  text.style.setProperty("--notion-pdf-preview-latin-scale", LATIN_ADVANCE_RATIO);
  text.style.setProperty("--notion-pdf-preview-inline-code-scale", INLINE_CODE_SCALE);
  text.style.setProperty("--notion-pdf-preview-inline-code-only-line-height", `${ptToPx(INLINE_CODE_ONLY_LINE_HEIGHT_PT)}px`);
  text.style.setProperty("--notion-pdf-preview-inline-math-line-height", `${ptToPx(INLINE_MATH_LINE_HEIGHT_PT)}px`);
  text.style.setProperty("--notion-pdf-preview-inline-code-side-padding", `${INLINE_CODE_HORIZONTAL_PADDING_EM / 2}em`);
  text.style.setProperty("--notion-pdf-preview-code-font-size", `${CODE_BLOCK_FONT_SIZE_PX}px`);
  text.style.setProperty("--notion-pdf-preview-code-padding-top", `${Number.isFinite(segment.codePaddingTop) ? segment.codePaddingTop : ptToPx(CODE_BLOCK_PADDING_TOP_PT)}px`);
  text.style.setProperty("--notion-pdf-preview-code-padding-right", `${ptToPx(CODE_BLOCK_PADDING_RIGHT_PT)}px`);
  text.style.setProperty("--notion-pdf-preview-code-padding-bottom", `${Number.isFinite(segment.codePaddingBottom) ? segment.codePaddingBottom : ptToPx(CODE_BLOCK_PADDING_BOTTOM_PT)}px`);
  text.style.setProperty("--notion-pdf-preview-code-padding-left", `${ptToPx(CODE_BLOCK_PADDING_LEFT_PT)}px`);
  const lines = formatSegmentTextForPreview(segment).split("\n");

  for (const line of lines) {
    const lineElement = document.createElement("div");
    lineElement.className = "notion-pdf-preview-synthetic-line";
    appendSyntheticLineContent(lineElement, line, segment);
    text.append(lineElement);
  }

  return text;
}

function createRenderedPdfPreviewSegment(segment) {
  const segmentElement = document.createElement("div");
  const segmentHeight = Math.max(1, segment.segmentHeight ?? segment.height);
  const debugLabel = `${segment.type} | ${Math.round(segmentHeight)}px${segment.continued ? " | continued" : ""}${segment.splitAfter ? " | splits" : ""}`;

  segmentElement.className = "notion-pdf-preview-rendered-segment";
  segmentElement.dataset.type = segment.type;
  segmentElement.dataset.debugLabel = debugLabel;
  segmentElement.dataset.copyText = segment.text || "(empty block)";
  segmentElement.style.height = `${segmentHeight}px`;

  if (segment.continued || segment.splitAfter) {
    segmentElement.classList.add("notion-pdf-preview-rendered-segment-clipped");
  }

  if (segment.type === "equation") {
    segmentElement.classList.add("notion-pdf-preview-rendered-segment-equation");
  }

  const clone = segment.type === "table"
    ? createRenderedTablePreview(segment)
    : isSyntheticTextSegment(segment.type) || segment.type === "code"
      ? createSyntheticTextPreview(segment)
      : prepareCloneForMeasurement(segment.element.cloneNode(true), segment.type);
  clone.classList.add("notion-pdf-preview-rendered-clone");

  const clipOffset = Number(segment.clipOffset) || 0;
  if (clipOffset > 0) {
    clone.style.transform = `translateY(-${clipOffset}px)`;
  }

  segmentElement.append(clone);
  return segmentElement;
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
  const pageScale = Math.min(1, 660 / layout.layoutWidth);

  const modal = document.createElement("section");
  modal.id = PDF_PREVIEW_ID;
  modal.className = "notion-pdf-preview-pages";

  const header = document.createElement("header");
  header.className = "notion-pdf-preview-pages-header";

  const title = document.createElement("strong");
  title.textContent = `Predicted PDF preview (${pages.length} pages)`;

  const details = document.createElement("span");
  details.textContent = `A4 | ${scalePercent}% scale | rendered DOM body ${Math.round(layout.layoutWidth)} x ${Math.round(layout.pageHeight)}px`;

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
    page.style.setProperty("--notion-pdf-preview-page-width", `${layout.layoutWidth * pageScale}px`);
    page.style.setProperty("--notion-pdf-preview-page-height", `${layout.pageHeight * pageScale}px`);
    page.style.setProperty("--notion-pdf-preview-body-width", `${layout.layoutWidth}px`);
    page.style.setProperty("--notion-pdf-preview-body-height", `${layout.pageHeight}px`);
    page.style.setProperty("--notion-pdf-preview-render-scale", String(pageScale));

    const pageLabel = document.createElement("div");
    pageLabel.className = "notion-pdf-preview-page-label";
    pageLabel.textContent = `Page ${pageIndex + 1}`;

    const body = document.createElement("div");
    body.className = "notion-pdf-preview-page-body";

    const renderedStack = document.createElement("div");
    renderedStack.className = "notion-pdf-preview-rendered-stack";
    applyInheritedStyleSnapshot(renderedStack, layout.sourceStyle);

    for (const segment of pageBlocks) {
      renderedStack.append(createRenderedPdfPreviewSegment(segment));
    }

    body.append(renderedStack);
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
  details.textContent = `A4 portrait | ${scalePercent}% scale | rendered layout estimate`;

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
