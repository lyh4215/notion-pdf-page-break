import { registerPreviewMessageHandler } from "./previewMessages.js";
import { registerBodyWidthStatusMessageHandler } from "../notion/bodyWidthStatus.js";

export function registerContentMessages({ showPreview, clearPreview }) {
  registerPreviewMessageHandler({ showPreview, clearPreview });
  registerBodyWidthStatusMessageHandler();
}
