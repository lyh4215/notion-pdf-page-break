import {
  BLOCK_TYPE_COUNT,
  DEFAULT_PAIRWISE_GAP_PT,
  T,
  getBlockTypeIndex,
  getBlockTypeName,
  normalizeBlockTypeIndex
} from "./blockTypes.js";

export {
  BLOCK_TYPE_COUNT,
  BlockType,
  T,
  getBlockTypeIndex,
  getBlockTypeName
} from "./blockTypes.js";

export const PAIRWISE_GAP_PT = Array.from(
  { length: BLOCK_TYPE_COUNT },
  () => Array(BLOCK_TYPE_COUNT).fill(DEFAULT_PAIRWISE_GAP_PT)
);

const PAIRWISE_GAP_STORAGE_KEY = "notion-pdf-preview-pairwise-gap-v1";

export function setPairwiseGap(prevType, nextType, gapPt) {
  const prevIndex = normalizeBlockTypeIndex(prevType);
  const nextIndex = normalizeBlockTypeIndex(nextType);
  const value = Number(gapPt);

  if (!Number.isFinite(value)) {
    return;
  }

  PAIRWISE_GAP_PT[prevIndex][nextIndex] = value;
}

export function getPairwiseGapPt(prevType, nextType) {
  // 주의:
  // numeric enum에서 pageTitle은 0이라서 !prevType 체크를 쓰면 안 됨.
  if (
    prevType === null ||
    prevType === undefined ||
    nextType === null ||
    nextType === undefined ||
    prevType === "" ||
    nextType === ""
  ) {
    return 0;
  }

  const prevIndex = normalizeBlockTypeIndex(prevType);
  const nextIndex = normalizeBlockTypeIndex(nextType);

  return PAIRWISE_GAP_PT[prevIndex]?.[nextIndex] ?? DEFAULT_PAIRWISE_GAP_PT;
}

function captureDefaultPairwiseGapMatrix() {
  PAIRWISE_GAP_DEFAULT_PT = PAIRWISE_GAP_PT.map((row) => row.slice());
}

export function restoreDefaultPairwiseGapMatrix() {
  if (!PAIRWISE_GAP_DEFAULT_PT) {
    return;
  }

  for (let row = 0; row < BLOCK_TYPE_COUNT; row += 1) {
    for (let col = 0; col < BLOCK_TYPE_COUNT; col += 1) {
      PAIRWISE_GAP_PT[row][col] = PAIRWISE_GAP_DEFAULT_PT[row][col];
    }
  }
}

export function savePairwiseGapOverrides() {
  try {
    localStorage.setItem(PAIRWISE_GAP_STORAGE_KEY, JSON.stringify(PAIRWISE_GAP_PT));
  } catch (error) {
    console.warn("[notion-pdf-preview] Failed to save pairwise gap matrix.", error);
  }
}

function loadPairwiseGapOverrides() {
  try {
    const raw = localStorage.getItem(PAIRWISE_GAP_STORAGE_KEY);

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return;
    }

    for (let row = 0; row < Math.min(parsed.length, BLOCK_TYPE_COUNT); row += 1) {
      if (!Array.isArray(parsed[row])) {
        continue;
      }

      for (let col = 0; col < Math.min(parsed[row].length, BLOCK_TYPE_COUNT); col += 1) {
        const value = Number(parsed[row][col]);

        if (Number.isFinite(value)) {
          PAIRWISE_GAP_PT[row][col] = value;
        }
      }
    }
  } catch (error) {
    console.warn("[notion-pdf-preview] Failed to load pairwise gap matrix.", error);
  }
}

export function clearPairwiseGapOverrides() {
  try {
    localStorage.removeItem(PAIRWISE_GAP_STORAGE_KEY);
  } catch (error) {
    console.warn("[notion-pdf-preview] Failed to clear pairwise gap matrix.", error);
  }
}

export function isDefaultPairwiseGapCell(row, col) {
  if (!PAIRWISE_GAP_DEFAULT_PT) {
    return true;
  }

  return Math.abs(PAIRWISE_GAP_PT[row][col] - PAIRWISE_GAP_DEFAULT_PT[row][col]) < 0.0001;
}
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);

// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);

// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);

// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);
// pairwise gap matrix overrides
// format: setPairwiseGap(prevType, nextType, gapPt);

// pageTitle -> *
setPairwiseGap(T.PAGETITLE, T.PAGETITLE, 6.6);
setPairwiseGap(T.PAGETITLE, T.PARAGRAPH, 8.5);
setPairwiseGap(T.PAGETITLE, T.LIST, 8.5);
setPairwiseGap(T.PAGETITLE, T.H2, 15.4);
setPairwiseGap(T.PAGETITLE, T.H3, 8.5);
setPairwiseGap(T.PAGETITLE, T.H4, 8.5);
setPairwiseGap(T.PAGETITLE, T.EQUATION, 10.0);
setPairwiseGap(T.PAGETITLE, T.TABLE, 10.0);
setPairwiseGap(T.PAGETITLE, T.CODE, 4.0);
setPairwiseGap(T.PAGETITLE, T.QUOTE, 6.6);
setPairwiseGap(T.PAGETITLE, T.CALLOUT, 6.6);
setPairwiseGap(T.PAGETITLE, T.MEDIA, 18.2);
setPairwiseGap(T.PAGETITLE, T.COLUMNS, 12.0);
setPairwiseGap(T.PAGETITLE, T.DIVIDER, 6.6);
setPairwiseGap(T.PAGETITLE, T.BLANK, 6.6);
setPairwiseGap(T.PAGETITLE, T.PAGEMETADATA, 23.0);
setPairwiseGap(T.PAGETITLE, T.COLUMNSTART, 6.6);

// paragraph -> *
setPairwiseGap(T.PARAGRAPH, T.PAGETITLE, 6.6);
setPairwiseGap(T.PARAGRAPH, T.PARAGRAPH, 6.6);
setPairwiseGap(T.PARAGRAPH, T.LIST, 7.0);
setPairwiseGap(T.PARAGRAPH, T.H2, 19.3);
setPairwiseGap(T.PARAGRAPH, T.H3, 15.5);
setPairwiseGap(T.PARAGRAPH, T.H4, 14.5);
setPairwiseGap(T.PARAGRAPH, T.EQUATION, 14.0);
setPairwiseGap(T.PARAGRAPH, T.TABLE, 10.6);
setPairwiseGap(T.PARAGRAPH, T.CODE, 4.0);
setPairwiseGap(T.PARAGRAPH, T.QUOTE, 10.0);
setPairwiseGap(T.PARAGRAPH, T.CALLOUT, 10.0);
setPairwiseGap(T.PARAGRAPH, T.MEDIA, 18.2);
setPairwiseGap(T.PARAGRAPH, T.COLUMNS, 12.0);
setPairwiseGap(T.PARAGRAPH, T.DIVIDER, 6.6);
setPairwiseGap(T.PARAGRAPH, T.BLANK, 6.6);
setPairwiseGap(T.PARAGRAPH, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.PARAGRAPH, T.COLUMNSTART, 6.6);

// list -> *
setPairwiseGap(T.LIST, T.PAGETITLE, 6.6);
setPairwiseGap(T.LIST, T.PARAGRAPH, 7.8);
setPairwiseGap(T.LIST, T.LIST, 7.4);
setPairwiseGap(T.LIST, T.H2, 19.2);
setPairwiseGap(T.LIST, T.H3, 15.6);
setPairwiseGap(T.LIST, T.H4, 12.9);
setPairwiseGap(T.LIST, T.EQUATION, 13.2);
setPairwiseGap(T.LIST, T.TABLE, 10.6);
setPairwiseGap(T.LIST, T.CODE, 4.0);
setPairwiseGap(T.LIST, T.QUOTE, 6.6);
setPairwiseGap(T.LIST, T.CALLOUT, 6.6);
setPairwiseGap(T.LIST, T.MEDIA, 18.2);
setPairwiseGap(T.LIST, T.COLUMNS, 12.0);
setPairwiseGap(T.LIST, T.DIVIDER, 6.6);
setPairwiseGap(T.LIST, T.BLANK, 6.6);
setPairwiseGap(T.LIST, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.LIST, T.COLUMNSTART, 6.6);

// h2 -> *
setPairwiseGap(T.H2, T.PAGETITLE, 6.6);
setPairwiseGap(T.H2, T.PARAGRAPH, 3.7);
setPairwiseGap(T.H2, T.LIST, 3.4);
setPairwiseGap(T.H2, T.H2, 16.9);
setPairwiseGap(T.H2, T.H3, 12.4);
setPairwiseGap(T.H2, T.H4, 10.6);
setPairwiseGap(T.H2, T.EQUATION, 10.0);
setPairwiseGap(T.H2, T.TABLE, 10.6);
setPairwiseGap(T.H2, T.CODE, 4.0);
setPairwiseGap(T.H2, T.QUOTE, 6.6);
setPairwiseGap(T.H2, T.CALLOUT, 6.6);
setPairwiseGap(T.H2, T.MEDIA, 18.2);
setPairwiseGap(T.H2, T.COLUMNS, 12.0);
setPairwiseGap(T.H2, T.DIVIDER, 6.6);
setPairwiseGap(T.H2, T.BLANK, 6.6);
setPairwiseGap(T.H2, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.H2, T.COLUMNSTART, 6.6);

// h3 -> *
setPairwiseGap(T.H3, T.PAGETITLE, 6.6);
setPairwiseGap(T.H3, T.PARAGRAPH, 4.7);
setPairwiseGap(T.H3, T.LIST, 5.3);
setPairwiseGap(T.H3, T.H2, 18.2);
setPairwiseGap(T.H3, T.H3, 13.7);
setPairwiseGap(T.H3, T.H4, 12.0);
setPairwiseGap(T.H3, T.EQUATION, 15.0);
setPairwiseGap(T.H3, T.TABLE, 9.0);
setPairwiseGap(T.H3, T.CODE, 4.0);
setPairwiseGap(T.H3, T.QUOTE, 7.8);
setPairwiseGap(T.H3, T.CALLOUT, 6.6);
setPairwiseGap(T.H3, T.MEDIA, 18.2);
setPairwiseGap(T.H3, T.COLUMNS, 12.0);
setPairwiseGap(T.H3, T.DIVIDER, 6.6);
setPairwiseGap(T.H3, T.BLANK, 6.6);
setPairwiseGap(T.H3, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.H3, T.COLUMNSTART, 6.6);

// h4 -> *
setPairwiseGap(T.H4, T.PAGETITLE, 6.6);
setPairwiseGap(T.H4, T.PARAGRAPH, 4.5);
setPairwiseGap(T.H4, T.LIST, 5.0);
setPairwiseGap(T.H4, T.H2, 17.6);
setPairwiseGap(T.H4, T.H3, 13.0);
setPairwiseGap(T.H4, T.H4, 11.3);
setPairwiseGap(T.H4, T.EQUATION, 10.0);
setPairwiseGap(T.H4, T.TABLE, 10.6);
setPairwiseGap(T.H4, T.CODE, 4.0);
setPairwiseGap(T.H4, T.QUOTE, 6.6);
setPairwiseGap(T.H4, T.CALLOUT, 6.6);
setPairwiseGap(T.H4, T.MEDIA, 18.2);
setPairwiseGap(T.H4, T.COLUMNS, 12.0);
setPairwiseGap(T.H4, T.DIVIDER, 6.6);
setPairwiseGap(T.H4, T.BLANK, 6.6);
setPairwiseGap(T.H4, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.H4, T.COLUMNSTART, 6.6);

// equation -> *
setPairwiseGap(T.EQUATION, T.PAGETITLE, 6.6);
setPairwiseGap(T.EQUATION, T.PARAGRAPH, 12.1);
setPairwiseGap(T.EQUATION, T.LIST, 12.0);
setPairwiseGap(T.EQUATION, T.H2, 14.0);
setPairwiseGap(T.EQUATION, T.H3, 13.5);
setPairwiseGap(T.EQUATION, T.H4, 13.0);
setPairwiseGap(T.EQUATION, T.EQUATION, 11.2);
setPairwiseGap(T.EQUATION, T.TABLE, 10.6);
setPairwiseGap(T.EQUATION, T.CODE, 6.6);
setPairwiseGap(T.EQUATION, T.QUOTE, 12.0);
setPairwiseGap(T.EQUATION, T.CALLOUT, 6.6);
setPairwiseGap(T.EQUATION, T.MEDIA, 18.2);
setPairwiseGap(T.EQUATION, T.COLUMNS, 12.0);
setPairwiseGap(T.EQUATION, T.DIVIDER, 6.6);
setPairwiseGap(T.EQUATION, T.BLANK, 6.6);
setPairwiseGap(T.EQUATION, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.EQUATION, T.COLUMNSTART, 6.6);

// table -> *
setPairwiseGap(T.TABLE, T.PAGETITLE, 6.6);
setPairwiseGap(T.TABLE, T.PARAGRAPH, 6.6);
setPairwiseGap(T.TABLE, T.LIST, 6.6);
setPairwiseGap(T.TABLE, T.H2, 14.0);
setPairwiseGap(T.TABLE, T.H3, 13.6);
setPairwiseGap(T.TABLE, T.H4, 13.3);
setPairwiseGap(T.TABLE, T.EQUATION, 13.6);
setPairwiseGap(T.TABLE, T.TABLE, 8.0);
setPairwiseGap(T.TABLE, T.CODE, 6.6);
setPairwiseGap(T.TABLE, T.QUOTE, 6.6);
setPairwiseGap(T.TABLE, T.CALLOUT, 6.6);
setPairwiseGap(T.TABLE, T.MEDIA, 18.2);
setPairwiseGap(T.TABLE, T.COLUMNS, 12.0);
setPairwiseGap(T.TABLE, T.DIVIDER, 6.6);
setPairwiseGap(T.TABLE, T.BLANK, 6.6);
setPairwiseGap(T.TABLE, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.TABLE, T.COLUMNSTART, 6.6);

// code -> *
setPairwiseGap(T.CODE, T.PAGETITLE, 6.6);
setPairwiseGap(T.CODE, T.PARAGRAPH, 5.5);
setPairwiseGap(T.CODE, T.LIST, 5.5);
setPairwiseGap(T.CODE, T.H2, 18.5);
setPairwiseGap(T.CODE, T.H3, 13.5);
setPairwiseGap(T.CODE, T.H4, 12.5);
setPairwiseGap(T.CODE, T.EQUATION, 10.0);
setPairwiseGap(T.CODE, T.TABLE, 6.6);
setPairwiseGap(T.CODE, T.CODE, 8.0);
setPairwiseGap(T.CODE, T.QUOTE, 6.6);
setPairwiseGap(T.CODE, T.CALLOUT, 6.6);
setPairwiseGap(T.CODE, T.MEDIA, 18.2);
setPairwiseGap(T.CODE, T.COLUMNS, 12.0);
setPairwiseGap(T.CODE, T.DIVIDER, 6.6);
setPairwiseGap(T.CODE, T.BLANK, 6.6);
setPairwiseGap(T.CODE, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.CODE, T.COLUMNSTART, 6.6);

// quote -> *
setPairwiseGap(T.QUOTE, T.PAGETITLE, 6.6);
setPairwiseGap(T.QUOTE, T.PARAGRAPH, 12.6);
setPairwiseGap(T.QUOTE, T.LIST, 6.6);
setPairwiseGap(T.QUOTE, T.H2, 16.0);
setPairwiseGap(T.QUOTE, T.H3, 14.0);
setPairwiseGap(T.QUOTE, T.H4, 13.0);
setPairwiseGap(T.QUOTE, T.EQUATION, 16.5);
setPairwiseGap(T.QUOTE, T.TABLE, 6.6);
setPairwiseGap(T.QUOTE, T.CODE, 6.6);
setPairwiseGap(T.QUOTE, T.QUOTE, 6.6);
setPairwiseGap(T.QUOTE, T.CALLOUT, 6.6);
setPairwiseGap(T.QUOTE, T.MEDIA, 18.2);
setPairwiseGap(T.QUOTE, T.COLUMNS, 12.0);
setPairwiseGap(T.QUOTE, T.DIVIDER, 6.6);
setPairwiseGap(T.QUOTE, T.BLANK, 6.6);
setPairwiseGap(T.QUOTE, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.QUOTE, T.COLUMNSTART, 6.6);

// callout -> *
setPairwiseGap(T.CALLOUT, T.PAGETITLE, 6.6);
setPairwiseGap(T.CALLOUT, T.PARAGRAPH, 18.0);
setPairwiseGap(T.CALLOUT, T.LIST, 6.6);
setPairwiseGap(T.CALLOUT, T.H2, 18.0);
setPairwiseGap(T.CALLOUT, T.H3, 16.0);
setPairwiseGap(T.CALLOUT, T.H4, 15.0);
setPairwiseGap(T.CALLOUT, T.EQUATION, 10.0);
setPairwiseGap(T.CALLOUT, T.TABLE, 6.6);
setPairwiseGap(T.CALLOUT, T.CODE, 6.6);
setPairwiseGap(T.CALLOUT, T.QUOTE, 6.6);
setPairwiseGap(T.CALLOUT, T.CALLOUT, 6.6);
setPairwiseGap(T.CALLOUT, T.MEDIA, 18.2);
setPairwiseGap(T.CALLOUT, T.COLUMNS, 12.0);
setPairwiseGap(T.CALLOUT, T.DIVIDER, 6.6);
setPairwiseGap(T.CALLOUT, T.BLANK, 6.6);
setPairwiseGap(T.CALLOUT, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.CALLOUT, T.COLUMNSTART, 6.6);

// media -> *
setPairwiseGap(T.MEDIA, T.PAGETITLE, 18.2);
setPairwiseGap(T.MEDIA, T.PARAGRAPH, 18.2);
setPairwiseGap(T.MEDIA, T.LIST, 18.2);
setPairwiseGap(T.MEDIA, T.H2, 18.2);
setPairwiseGap(T.MEDIA, T.H3, 18.2);
setPairwiseGap(T.MEDIA, T.H4, 18.2);
setPairwiseGap(T.MEDIA, T.EQUATION, 18.2);
setPairwiseGap(T.MEDIA, T.TABLE, 18.2);
setPairwiseGap(T.MEDIA, T.CODE, 18.2);
setPairwiseGap(T.MEDIA, T.QUOTE, 18.2);
setPairwiseGap(T.MEDIA, T.CALLOUT, 18.2);
setPairwiseGap(T.MEDIA, T.MEDIA, 18.2);
setPairwiseGap(T.MEDIA, T.COLUMNS, 12.0);
setPairwiseGap(T.MEDIA, T.DIVIDER, 18.2);
setPairwiseGap(T.MEDIA, T.BLANK, 18.2);
setPairwiseGap(T.MEDIA, T.PAGEMETADATA, 18.2);
setPairwiseGap(T.MEDIA, T.COLUMNSTART, 18.2);

// columns -> *
setPairwiseGap(T.COLUMNS, T.PAGETITLE, 25.0);
setPairwiseGap(T.COLUMNS, T.PARAGRAPH, 25.0);
setPairwiseGap(T.COLUMNS, T.LIST, 25.0);
setPairwiseGap(T.COLUMNS, T.H2, 25.0);
setPairwiseGap(T.COLUMNS, T.H3, 25.0);
setPairwiseGap(T.COLUMNS, T.H4, 25.0);
setPairwiseGap(T.COLUMNS, T.EQUATION, 10.0);
setPairwiseGap(T.COLUMNS, T.TABLE, 25.0);
setPairwiseGap(T.COLUMNS, T.CODE, 25.0);
setPairwiseGap(T.COLUMNS, T.QUOTE, 25.0);
setPairwiseGap(T.COLUMNS, T.CALLOUT, 25.0);
setPairwiseGap(T.COLUMNS, T.MEDIA, 25.0);
setPairwiseGap(T.COLUMNS, T.COLUMNS, 12.0);
setPairwiseGap(T.COLUMNS, T.DIVIDER, 25.0);
setPairwiseGap(T.COLUMNS, T.BLANK, 25.0);
setPairwiseGap(T.COLUMNS, T.PAGEMETADATA, 25.0);
setPairwiseGap(T.COLUMNS, T.COLUMNSTART, 25.0);

// divider -> *
setPairwiseGap(T.DIVIDER, T.PAGETITLE, 6.6);
setPairwiseGap(T.DIVIDER, T.PARAGRAPH, 6.6);
setPairwiseGap(T.DIVIDER, T.LIST, 6.6);
setPairwiseGap(T.DIVIDER, T.H2, 6.6);
setPairwiseGap(T.DIVIDER, T.H3, 6.6);
setPairwiseGap(T.DIVIDER, T.H4, 6.6);
setPairwiseGap(T.DIVIDER, T.EQUATION, 6.6);
setPairwiseGap(T.DIVIDER, T.TABLE, 6.6);
setPairwiseGap(T.DIVIDER, T.CODE, 6.6);
setPairwiseGap(T.DIVIDER, T.QUOTE, 6.6);
setPairwiseGap(T.DIVIDER, T.CALLOUT, 6.6);
setPairwiseGap(T.DIVIDER, T.MEDIA, 18.2);
setPairwiseGap(T.DIVIDER, T.COLUMNS, 12.0);
setPairwiseGap(T.DIVIDER, T.DIVIDER, 6.6);
setPairwiseGap(T.DIVIDER, T.BLANK, 6.6);
setPairwiseGap(T.DIVIDER, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.DIVIDER, T.COLUMNSTART, 6.6);

// blank -> *
setPairwiseGap(T.BLANK, T.PAGETITLE, 6.6);
setPairwiseGap(T.BLANK, T.PARAGRAPH, 6.6);
setPairwiseGap(T.BLANK, T.LIST, 6.6);
setPairwiseGap(T.BLANK, T.H2, 6.6);
setPairwiseGap(T.BLANK, T.H3, 6.6);
setPairwiseGap(T.BLANK, T.H4, 6.6);
setPairwiseGap(T.BLANK, T.EQUATION, 6.6);
setPairwiseGap(T.BLANK, T.TABLE, 6.6);
setPairwiseGap(T.BLANK, T.CODE, 6.6);
setPairwiseGap(T.BLANK, T.QUOTE, 6.6);
setPairwiseGap(T.BLANK, T.CALLOUT, 6.6);
setPairwiseGap(T.BLANK, T.MEDIA, 6.6);
setPairwiseGap(T.BLANK, T.COLUMNS, 12.0);
setPairwiseGap(T.BLANK, T.DIVIDER, 6.6);
setPairwiseGap(T.BLANK, T.BLANK, 6.6);
setPairwiseGap(T.BLANK, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.BLANK, T.COLUMNSTART, 6.6);

// pageMetadata -> *
setPairwiseGap(T.PAGEMETADATA, T.PAGETITLE, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.PARAGRAPH, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.LIST, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.H2, 24.0);
setPairwiseGap(T.PAGEMETADATA, T.H3, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.H4, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.EQUATION, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.TABLE, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.CODE, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.QUOTE, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.CALLOUT, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.MEDIA, 18.2);
setPairwiseGap(T.PAGEMETADATA, T.COLUMNS, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.DIVIDER, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.BLANK, 12.0);
setPairwiseGap(T.PAGEMETADATA, T.PAGEMETADATA, 8.0);
setPairwiseGap(T.PAGEMETADATA, T.COLUMNSTART, 6.6);

// columnStart -> *
setPairwiseGap(T.COLUMNSTART, T.PAGETITLE, 6.6);
setPairwiseGap(T.COLUMNSTART, T.PARAGRAPH, 0.0);
setPairwiseGap(T.COLUMNSTART, T.LIST, 6.6);
setPairwiseGap(T.COLUMNSTART, T.H2, 6.6);
setPairwiseGap(T.COLUMNSTART, T.H3, 6.6);
setPairwiseGap(T.COLUMNSTART, T.H4, 6.6);
setPairwiseGap(T.COLUMNSTART, T.EQUATION, 6.6);
setPairwiseGap(T.COLUMNSTART, T.TABLE, 6.6);
setPairwiseGap(T.COLUMNSTART, T.CODE, 6.6);
setPairwiseGap(T.COLUMNSTART, T.QUOTE, 6.6);
setPairwiseGap(T.COLUMNSTART, T.CALLOUT, 6.6);
setPairwiseGap(T.COLUMNSTART, T.MEDIA, 12.0);
setPairwiseGap(T.COLUMNSTART, T.COLUMNS, 6.6);
setPairwiseGap(T.COLUMNSTART, T.DIVIDER, 6.6);
setPairwiseGap(T.COLUMNSTART, T.BLANK, 6.6);
setPairwiseGap(T.COLUMNSTART, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.COLUMNSTART, T.COLUMNSTART, 6.6);

// listLine -> *
// list 내부의 bullet text row를 paragraph처럼 취급하기 위한 기본값
setPairwiseGap(T.LISTLINE, T.PAGETITLE, 6.6);
setPairwiseGap(T.LISTLINE, T.PARAGRAPH, 6.6);
setPairwiseGap(T.LISTLINE, T.LIST, 7.0);
setPairwiseGap(T.LISTLINE, T.H2, 19.3);
setPairwiseGap(T.LISTLINE, T.H3, 15.5);
setPairwiseGap(T.LISTLINE, T.H4, 14.5);
setPairwiseGap(T.LISTLINE, T.EQUATION, 14.0);
setPairwiseGap(T.LISTLINE, T.TABLE, 10.6);
setPairwiseGap(T.LISTLINE, T.CODE, 4.0);
setPairwiseGap(T.LISTLINE, T.QUOTE, 10.0);
setPairwiseGap(T.LISTLINE, T.CALLOUT, 10.0);
setPairwiseGap(T.LISTLINE, T.MEDIA, 18.2);
setPairwiseGap(T.LISTLINE, T.COLUMNS, 12.0);
setPairwiseGap(T.LISTLINE, T.DIVIDER, 6.6);
setPairwiseGap(T.LISTLINE, T.BLANK, 6.6);
setPairwiseGap(T.LISTLINE, T.PAGEMETADATA, 6.6);
setPairwiseGap(T.LISTLINE, T.COLUMNSTART, 6.6);

// paragraph -> paragraph에 대응되는 값
setPairwiseGap(T.LISTLINE, T.LISTLINE, 6.6);

function copyPairwiseGapRow(fromType, toType) {
  for (let nextType = 0; nextType < BLOCK_TYPE_COUNT; nextType += 1) {
    setPairwiseGap(toType, nextType, getPairwiseGapPt(fromType, nextType));
  }
}

function copyPairwiseGapColumn(fromType, toType) {
  for (let prevType = 0; prevType < BLOCK_TYPE_COUNT; prevType += 1) {
    setPairwiseGap(prevType, toType, getPairwiseGapPt(prevType, fromType));
  }
}

// list 내부의 bullet text row는 paragraph처럼 취급.
// listLine -> *  = paragraph -> *
// * -> listLine  = * -> paragraph
copyPairwiseGapRow(T.PARAGRAPH, T.LISTLINE);
copyPairwiseGapColumn(T.PARAGRAPH, T.LISTLINE);

// 안전하게 명시
setPairwiseGap(T.LISTLINE, T.LISTLINE, getPairwiseGapPt(T.PARAGRAPH, T.PARAGRAPH));

captureDefaultPairwiseGapMatrix();
loadPairwiseGapOverrides();
