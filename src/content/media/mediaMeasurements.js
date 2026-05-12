import { PAGE_BODY_WIDTH_PX } from "../config/layoutConstants.js";
import {
  NOTION_IMAGE_SRC_WIDTH_DPR_SCALE,
  NOTION_PDF_MEDIA_MAX_WIDTH_PX
} from "../config/mediaConstants.js";
import { getMediaImageElement } from "./mediaElements.js";
import { getVisibleRect } from "../utils/domRects.js";

function readInlineStyleValue(element, propertyName) {
  if (!element) {
    return "";
  }

  const inlineStyle = element.getAttribute("style") || "";
  const pattern = new RegExp(`${propertyName}\\s*:\\s*([^;]+)`, "i");
  const match = inlineStyle.match(pattern);

  return match ? match[1].trim() : "";
}

function parseCssLengthToPx(value, baseWidth = 0) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === "auto" || normalized === "none") {
    return null;
  }

  const pxMatch = normalized.match(/^(-?\d+(?:\.\d+)?)px$/);

  if (pxMatch) {
    return Number(pxMatch[1]);
  }

  const percentMatch = normalized.match(/^(-?\d+(?:\.\d+)?)%$/);

  if (percentMatch && baseWidth > 0) {
    return baseWidth * (Number(percentMatch[1]) / 100);
  }

  return null;
}

function getMediaPrintReferenceRoot(block) {
  return (
    block.closest(".notion-page-content") ||
    block.closest("[data-content-editable-root='true']") ||
    document.querySelector(".notion-page-content") ||
    block.parentElement
  );
}

function findNotionColumnAncestor(block) {
  let node = block.parentElement;

  while (node && node !== document.body) {
    const className = String(node.className || "").toLowerCase();

    if (className.includes("notion-column-block")) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function getPrintMediaContainerWidth(block, layoutWidth) {
  return Math.max(1, Number(layoutWidth) || PAGE_BODY_WIDTH_PX);
}
function getPrintMediaMaxWidth(block, layoutWidth) {
  const containerWidth = getPrintMediaContainerWidth(block, layoutWidth);

  // column 안에서는 column width 자체가 이미 cap 역할을 하므로,
  // 전역 media max width를 또 강하게 걸 필요가 없음.
  if (findNotionColumnAncestor(block)) {
    return containerWidth;
  }

  return Math.min(
    containerWidth,
    NOTION_PDF_MEDIA_MAX_WIDTH_PX
  );
}

function getNotionImageSrcWidthPx(block) {
  const image = getMediaImageElement(block);

  if (!image) {
    return NaN;
  }

  const rawSrc = image.getAttribute("src") || "";
  const src = rawSrc.replace(/&amp;/g, "&");

  if (!src) {
    return NaN;
  }

  try {
    const url = new URL(src, window.location.href);
    const widthParam = url.searchParams.get("width");

    if (widthParam) {
      const width = Number(widthParam);

      if (Number.isFinite(width) && width > 0) {
        return width;
      }
    }
  } catch (error) {
    // fallback regex below
  }

  const match = src.match(/[?&]width=(\d+)/);

  if (!match) {
    return NaN;
  }

  const width = Number(match[1]);

  return Number.isFinite(width) && width > 0
    ? width
    : NaN;
}

function getNotionImageSrcDisplayWidthPx(block) {
  const srcWidth = getNotionImageSrcWidthPx(block);

  if (!Number.isFinite(srcWidth) || srcWidth <= 0) {
    return NaN;
  }

  return srcWidth / NOTION_IMAGE_SRC_WIDTH_DPR_SCALE;
}

function getInlineStylePxValue(element, propertyName) {
  if (!element) {
    return NaN;
  }

  const value = element.style?.getPropertyValue?.(propertyName) || "";
  const match = String(value).match(/(-?\d+(?:\.\d+)?)px/);

  if (!match) {
    return NaN;
  }

  const parsed = Number(match[1]);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : NaN;
}

function getNotionImageInlineHeightPx(block) {
  const image = getMediaImageElement(block);

  if (!image) {
    return NaN;
  }

  const heightPx = getInlineStylePxValue(image, "height");

  if (Number.isFinite(heightPx) && heightPx > 0) {
    return heightPx;
  }

  const maxHeightPx = getInlineStylePxValue(image, "max-height");

  if (Number.isFinite(maxHeightPx) && maxHeightPx > 0) {
    return maxHeightPx;
  }

  return NaN;
}


export function getPrintMediaTargetWidth(block, layoutWidth) {
  const containerWidth = getPrintMediaContainerWidth(block, layoutWidth);

  const widthValue = readInlineStyleValue(block, "width");
  const widthPx = parseCssLengthToPx(widthValue, containerWidth);

  const srcDisplayWidthPx = getNotionImageSrcDisplayWidthPx(block);

  let targetWidth = containerWidth;

  // 1순위: Notion image src의 width 파라미터
  // 예: width=640 → display width ≈ 320
  if (Number.isFinite(srcDisplayWidthPx) && srcDisplayWidthPx > 0) {
    targetWidth = Math.min(targetWidth, srcDisplayWidthPx);
  }

  // 2순위: inline width
  // 단, width: 100%는 containerWidth라서 사실상 영향 없음.
  if (Number.isFinite(widthPx) && widthPx > 0) {
    targetWidth = Math.min(targetWidth, widthPx);
  }

  return Math.max(1, Math.min(containerWidth, targetWidth));
}

export function getMediaAspectRatio(mediaElement) {
  if (!mediaElement) {
    return null;
  }

  const naturalWidth = Number(mediaElement.naturalWidth) || 0;
  const naturalHeight = Number(mediaElement.naturalHeight) || 0;

  if (naturalWidth > 0 && naturalHeight > 0) {
    return naturalHeight / naturalWidth;
  }

  const rect = getVisibleRect(mediaElement);

  if (rect && rect.width > 0 && rect.height > 0) {
    return rect.height / rect.width;
  }

  const styleHeight = parseCssLengthToPx(
    readInlineStyleValue(mediaElement, "height"),
    0
  );

  const styleWidth = parseCssLengthToPx(
    readInlineStyleValue(mediaElement, "width"),
    0
  );

  if (
    Number.isFinite(styleWidth) &&
    styleWidth > 0 &&
    Number.isFinite(styleHeight) &&
    styleHeight > 0
  ) {
    return styleHeight / styleWidth;
  }

  return null;
}

export function estimateMediaHeight(block, layoutWidth) {
  const image = getMediaImageElement(block);
  const targetWidth = getPrintMediaTargetWidth(block, layoutWidth);

  const srcDisplayWidthPx = getNotionImageSrcDisplayWidthPx(block);
  const inlineHeightPx = getNotionImageInlineHeightPx(block);

  if (
    Number.isFinite(srcDisplayWidthPx) &&
    srcDisplayWidthPx > 0 &&
    Number.isFinite(inlineHeightPx) &&
    inlineHeightPx > 0
  ) {
    return targetWidth * (inlineHeightPx / srcDisplayWidthPx);
  }

  const naturalWidth = image?.naturalWidth || 0;
  const naturalHeight = image?.naturalHeight || 0;

  if (naturalWidth > 0 && naturalHeight > 0) {
    return targetWidth * (naturalHeight / naturalWidth);
  }

  const blockRect = getVisibleRect(block);

  if (blockRect && blockRect.height > 0) {
    return blockRect.height;
  }

  return 220;
}
