import {
  BLOCK_TYPE_COUNT,
  PAIRWISE_GAP_PT,
  clearPairwiseGapOverrides,
  getBlockTypeName,
  isDefaultPairwiseGapCell,
  restoreDefaultPairwiseGapMatrix,
  savePairwiseGapOverrides
} from "../gaps/pairwiseGaps.js";
import { createPairwiseGapDebugPanel } from "./pairwiseGapDebugPanel.js";

export function registerPairwiseGapDebug({ refreshPreview }) {
  const pairwiseGapDebug = createPairwiseGapDebugPanel({
    blockTypeCount: BLOCK_TYPE_COUNT,
    pairwiseGapPt: PAIRWISE_GAP_PT,
    getBlockTypeName,
    isDefaultPairwiseGapCell,
    savePairwiseGapOverrides,
    restoreDefaultPairwiseGapMatrix,
    clearPairwiseGapOverrides,
    refreshPreview
  });

  window.__openPairwiseGapDebugPanel = pairwiseGapDebug.openPairwiseGapDebugPanel;
  window.__PAIRWISE_GAP_PT = PAIRWISE_GAP_PT;

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      pairwiseGapDebug.openPairwiseGapDebugPanel();
    }
  });

  return pairwiseGapDebug;
}
