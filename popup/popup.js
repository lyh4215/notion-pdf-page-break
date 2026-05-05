const form = document.getElementById("preview-form");
const scaleInput = document.getElementById("scale");
const clearButton = document.getElementById("clear-button");
const statusElement = document.getElementById("status");

const SCALE_MIN = 11;
const SCALE_MAX = 199;
const RECEIVING_END_ERROR = "Receiving end does not exist";

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

function isMissingContentScriptError(error) {
  return error?.message?.includes(RECEIVING_END_ERROR);
}

function isNotionUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && (
      hostname === "notion.so" ||
      hostname.endsWith(".notion.so") ||
      hostname === "notion.site" ||
      hostname.endsWith(".notion.site")
    );
  } catch (_error) {
    return false;
  }
}

async function injectContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/content.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content.js"]
  });
}

async function sendMessage(tabId, message) {
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();

  try {
    return await sendMessage(tab.id, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    if (!isNotionUrl(tab.url)) {
      throw new Error("Open a Notion page, then try again.");
    }

    await injectContentScript(tab.id);
    return sendMessage(tab.id, message);
  }
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
    const message = error.message || "Could not create preview on this page.";
    setStatus(message, "error");
  }
});

clearButton.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "NOTION_PDF_PREVIEW_CLEAR" });
    setStatus("Preview cleared.");
  } catch (error) {
    const message = error.message || "Could not clear preview.";
    setStatus(message, "error");
  }
});
