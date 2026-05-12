import { getVisibleRect } from "../utils/domRects.js";

export function findNotionContentRoot() {
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

export function sortBlocksByPagePosition(blocks) {
  return blocks.slice().sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    return rectA.top - rectB.top || rectA.left - rectB.left;
  });
}

export function getContentBlocks(contentRoot) {
  const notionBlocks = Array.from(contentRoot.querySelectorAll("[data-block-id]"));
  const visibleBlocks = notionBlocks
    .filter((block) => !isInsidePageMetadata(block))
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
export function findPageMetadataElement(root) {
  const candidates = Array.from(
    document.querySelectorAll("[role='table'][aria-label='페이지 속성']")
  );

  const table = candidates.find((candidate) => {
    if (!candidate) return false;

    // content root 주변에 있는 metadata만 사용.
    if (root && root.parentElement && root.parentElement.contains(candidate)) {
      return true;
    }

    // Notion 구조상 title 근처에 있으면 document 기준으로도 잡히게 fallback.
    return true;
  });

  if (!table) {
    return null;
  }

  return table.closest(".layout-content") || table;
}

export function isInsidePageMetadata(element) {
  return Boolean(
    element?.closest?.("[role='table'][aria-label='페이지 속성']")
  );
}
