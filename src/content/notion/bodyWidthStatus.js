const REQUIRED_NOTION_BODY_WIDTH_PX = 710;
const NOTION_BODY_WIDTH_TOLERANCE_PX = 2;

function findMainNotionPageContent() {
  const candidates = Array.from(
    document.querySelectorAll(".layout-content > .notion-page-content, .notion-page-content")
  );

  const visibleCandidates = candidates
    .map((element) => {
      const rect = element.getBoundingClientRect();

      const directBlockCount = element.querySelectorAll(
        ":scope > .notion-selectable, :scope > [data-block-id]"
      ).length;

      const nestedBlockCount = element.querySelectorAll(
        ".notion-selectable, [data-block-id]"
      ).length;

      return {
        element,
        rect,
        directBlockCount,
        nestedBlockCount
      };
    })
    .filter(({ rect, nestedBlockCount }) => {
      return (
        rect.width > 200 &&
        rect.height > 100 &&
        nestedBlockCount > 0
      );
    });

  if (visibleCandidates.length === 0) {
    return null;
  }

  visibleCandidates.sort((a, b) => {
    if (b.directBlockCount !== a.directBlockCount) {
      return b.directBlockCount - a.directBlockCount;
    }

    if (b.nestedBlockCount !== a.nestedBlockCount) {
      return b.nestedBlockCount - a.nestedBlockCount;
    }

    return b.rect.height - a.rect.height;
  });

  return visibleCandidates[0].element;
}

function getMainNotionTextBlockWidth(pageContent) {
  if (!pageContent) {
    return 0;
  }

  const textLikeBlocks = Array.from(
    pageContent.querySelectorAll(
      [
        ":scope > .notion-text-block",
        ":scope > .notion-header-block",
        ":scope > .notion-sub_header-block",
        ":scope > .notion-sub_sub_header-block",
        ":scope > .notion-bulleted_list-block",
        ":scope > .notion-numbered_list-block",
        ":scope > .notion-to_do-block",
        ":scope > .notion-toggle-block",
        ":scope > .notion-quote-block",
        ":scope > .notion-callout-block",
        ":scope > .notion-divider-block"
      ].join(", ")
    )
  );

  if (textLikeBlocks.length === 0) {
    return 0;
  }

  return Math.round(
    Math.max(
      ...textLikeBlocks.map((block) => block.getBoundingClientRect().width)
    )
  );
}

export function getNotionBodyWidthStatus() {
  const pageContent = findMainNotionPageContent();

  if (!pageContent) {
    return {
      found: false,
      ready: false,
      bodyWidth: 0,
      textBlockWidth: 0,
      requiredWidth: REQUIRED_NOTION_BODY_WIDTH_PX
    };
  }

  const bodyWidth = Math.round(pageContent.getBoundingClientRect().width);
  const textBlockWidth = getMainNotionTextBlockWidth(pageContent);

  const ready =
    bodyWidth + NOTION_BODY_WIDTH_TOLERANCE_PX >= REQUIRED_NOTION_BODY_WIDTH_PX;

  return {
    found: true,
    ready,
    bodyWidth,
    textBlockWidth,
    requiredWidth: REQUIRED_NOTION_BODY_WIDTH_PX
  };
}

export function registerBodyWidthStatusMessageHandler() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "NOTION_PDF_PREVIEW_WIDTH_STATUS") {
      sendResponse(getNotionBodyWidthStatus());
      return true;
    }

    return false;
  });
}
