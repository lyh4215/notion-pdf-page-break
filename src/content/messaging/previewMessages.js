export function registerPreviewMessageHandler({ showPreview, clearPreview }) {
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
}
