const form = document.getElementById("preview-form");
const scaleInput = document.getElementById("scale");
const clearButton = document.getElementById("clear-button");
const statusElement = document.getElementById("status");

const SCALE_MIN = 11;
const SCALE_MAX = 199;

function setStatus(message, tone = "") {
  statusElement.textContent = message;
  if (tone) {
    statusElement.dataset.tone = tone;
  } else {
    delete statusElement.dataset.tone;
  }
}

function getScalePercent() {
  const scalePercent = Number(scaleInput.value);
  if (!Number.isFinite(scalePercent) || scalePercent < SCALE_MIN || scalePercent > SCALE_MAX) {
    throw new Error(`Enter a scale from ${SCALE_MIN} to ${SCALE_MAX}.`);
  }
  return scalePercent;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  const response = await chrome.tabs.sendMessage(tab.id, message);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const scalePercent = getScalePercent();
    setStatus("Reading the current Notion page...");
    const result = await sendToActiveTab({
      type: "NOTION_PDF_PREVIEW_SHOW",
      scalePercent
    });

    setStatus(`Estimated pages: ${result.estimatedPages}`, "success");
  } catch (error) {
    const message = error.message?.includes("Receiving end does not exist")
      ? "Open a Notion page, then try Preview again."
      : error.message || "Could not create preview on this page.";
    setStatus(message, "error");
  }
});

clearButton.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "NOTION_PDF_PREVIEW_CLEAR" });
    setStatus("Preview cleared.");
  } catch (error) {
    const message = error.message?.includes("Receiving end does not exist")
      ? "Open a Notion page, then try Clear preview again."
      : error.message || "Could not clear preview.";
    setStatus(message, "error");
  }
});
