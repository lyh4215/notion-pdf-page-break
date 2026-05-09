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

const CODE_BLOCK_FONT_SIZE_PT = 13.5;
const CODE_BLOCK_LINE_HEIGHT_PT = 18;
const CODE_BLOCK_PADDING_TOP_PT = 12;
const CODE_BLOCK_PADDING_RIGHT_PT = 12;
const CODE_BLOCK_PADDING_BOTTOM_PT = 14;
const CODE_BLOCK_PADDING_LEFT_PT = 12;
const CODE_BLOCK_MARGIN_BOTTOM_PT = 5.5;

const TABLE_TEXT_FONT_SIZE_PT = 10.5;

// 이 값은 "표 전용 추가 top gap"이다.
// 이전 문단 afterGap 6.6pt + TABLE_TOP_GAP_PT 5.0pt ≈ 실제 표 앞 시각 gap 11.6pt
const TABLE_TOP_GAP_PT = 5.0;

const EQUATION_DISPLAY_MARGIN_TOP_PT = 9;
const EQUATION_DISPLAY_MARGIN_BOTTOM_PT = 11;

const BlockType = Object.freeze({
  PAGETITLE: 0,
  PARAGRAPH: 1,
  LIST: 2,
  H2: 3,
  H3: 4,
  H4: 5,
  EQUATION: 6,
  TABLE: 7,
  CODE: 8,
  QUOTE: 9,
  CALLOUT: 10,
  MEDIA: 11,
  COLUMNS: 12,
  DIVIDER: 13,
  BLANK: 14,
  PAGEMETADATA: 15,
});

const T = BlockType;
const BLOCK_TYPE_COUNT = Object.keys(BlockType).length;
const DEFAULT_PAIRWISE_GAP_PT = 6.6;

const BLOCK_TYPE_INDEX = Object.freeze({
  pageTitle: T.PAGETITLE,
  paragraph: T.PARAGRAPH,
  list: T.LIST,
  h2: T.H2,
  h3: T.H3,
  h4: T.H4,
  equation: T.EQUATION,
  table: T.TABLE,
  code: T.CODE,
  quote: T.QUOTE,
  callout: T.CALLOUT,
  media: T.MEDIA,
  columns: T.COLUMNS,
  divider: T.DIVIDER,
  blank: T.BLANK,
  pageMetadata: T.PAGEMETADATA,
});

const PAIRWISE_GAP_PT = Array.from(
  { length: BLOCK_TYPE_COUNT },
  () => Array(BLOCK_TYPE_COUNT).fill(DEFAULT_PAIRWISE_GAP_PT)
);

const PAIRWISE_GAP_STORAGE_KEY = "notion-pdf-preview-pairwise-gap-v1";

const BLOCK_TYPE_LABELS = Object.freeze([
  "pageTitle",
  "paragraph",
  "list",
  "h2",
  "h3",
  "h4",
  "equation",
  "table",
  "code",
  "quote",
  "callout",
  "media",
  "columns",
  "divider",
  "blank",
  "pageMetadata",
]);

let PAIRWISE_GAP_DEFAULT_PT = null;

function normalizeBlockTypeIndex(type) {
  if (Number.isInteger(type) && type >= 0 && type < BLOCK_TYPE_COUNT) {
    return type;
  }

  return BLOCK_TYPE_INDEX[type] ?? T.PARAGRAPH;
}

function getBlockTypeName(index) {
  return BLOCK_TYPE_LABELS[index] ?? `type-${index}`;
}

function setPairwiseGap(prevType, nextType, gapPt) {
  const prevIndex = normalizeBlockTypeIndex(prevType);
  const nextIndex = normalizeBlockTypeIndex(nextType);
  const value = Number(gapPt);

  if (!Number.isFinite(value)) {
    return;
  }

  PAIRWISE_GAP_PT[prevIndex][nextIndex] = value;
}

function getBlockTypeIndex(type) {
  return normalizeBlockTypeIndex(type);
}

function getPairwiseGapPt(prevType, nextType) {
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

function restoreDefaultPairwiseGapMatrix() {
  if (!PAIRWISE_GAP_DEFAULT_PT) {
    return;
  }

  for (let row = 0; row < BLOCK_TYPE_COUNT; row += 1) {
    for (let col = 0; col < BLOCK_TYPE_COUNT; col += 1) {
      PAIRWISE_GAP_PT[row][col] = PAIRWISE_GAP_DEFAULT_PT[row][col];
    }
  }
}

function savePairwiseGapOverrides() {
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

function clearPairwiseGapOverrides() {
  try {
    localStorage.removeItem(PAIRWISE_GAP_STORAGE_KEY);
  } catch (error) {
    console.warn("[notion-pdf-preview] Failed to clear pairwise gap matrix.", error);
  }
}

function isDefaultPairwiseGapCell(row, col) {
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
setPairwiseGap(T.PAGETITLE, T.MEDIA, 6.6);
setPairwiseGap(T.PAGETITLE, T.COLUMNS, 6.6);
setPairwiseGap(T.PAGETITLE, T.DIVIDER, 6.6);
setPairwiseGap(T.PAGETITLE, T.BLANK, 6.6);
setPairwiseGap(T.PAGETITLE, T.PAGEMETADATA, 13.2);

// paragraph -> *
setPairwiseGap(T.PARAGRAPH, T.PAGETITLE, 6.6);
setPairwiseGap(T.PARAGRAPH, T.PARAGRAPH, 6.6);
setPairwiseGap(T.PARAGRAPH, T.LIST, 7.0);
setPairwiseGap(T.PARAGRAPH, T.H2, 19.3);
setPairwiseGap(T.PARAGRAPH, T.H3, 15.5);
setPairwiseGap(T.PARAGRAPH, T.H4, 12.9);
setPairwiseGap(T.PARAGRAPH, T.EQUATION, 14.0);
setPairwiseGap(T.PARAGRAPH, T.TABLE, 10.6);
setPairwiseGap(T.PARAGRAPH, T.CODE, 4.0);
setPairwiseGap(T.PARAGRAPH, T.QUOTE, 10.0);
setPairwiseGap(T.PARAGRAPH, T.CALLOUT, 10.0);
setPairwiseGap(T.PARAGRAPH, T.MEDIA, 6.6);
setPairwiseGap(T.PARAGRAPH, T.COLUMNS, 6.6);
setPairwiseGap(T.PARAGRAPH, T.DIVIDER, 6.6);
setPairwiseGap(T.PARAGRAPH, T.BLANK, 6.6);
setPairwiseGap(T.PARAGRAPH, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.LIST, T.MEDIA, 6.6);
setPairwiseGap(T.LIST, T.COLUMNS, 6.6);
setPairwiseGap(T.LIST, T.DIVIDER, 6.6);
setPairwiseGap(T.LIST, T.BLANK, 6.6);
setPairwiseGap(T.LIST, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.H2, T.MEDIA, 6.6);
setPairwiseGap(T.H2, T.COLUMNS, 6.6);
setPairwiseGap(T.H2, T.DIVIDER, 6.6);
setPairwiseGap(T.H2, T.BLANK, 6.6);
setPairwiseGap(T.H2, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.H3, T.MEDIA, 6.6);
setPairwiseGap(T.H3, T.COLUMNS, 6.6);
setPairwiseGap(T.H3, T.DIVIDER, 6.6);
setPairwiseGap(T.H3, T.BLANK, 6.6);
setPairwiseGap(T.H3, T.PAGEMETADATA, 6.6);

// h4 -> *
setPairwiseGap(T.H4, T.PAGETITLE, 6.6);
setPairwiseGap(T.H4, T.PARAGRAPH, 5.0);
setPairwiseGap(T.H4, T.LIST, 5.0);
setPairwiseGap(T.H4, T.H2, 17.6);
setPairwiseGap(T.H4, T.H3, 13.0);
setPairwiseGap(T.H4, T.H4, 11.3);
setPairwiseGap(T.H4, T.EQUATION, 10.0);
setPairwiseGap(T.H4, T.TABLE, 10.6);
setPairwiseGap(T.H4, T.CODE, 4.0);
setPairwiseGap(T.H4, T.QUOTE, 6.6);
setPairwiseGap(T.H4, T.CALLOUT, 6.6);
setPairwiseGap(T.H4, T.MEDIA, 6.6);
setPairwiseGap(T.H4, T.COLUMNS, 6.6);
setPairwiseGap(T.H4, T.DIVIDER, 6.6);
setPairwiseGap(T.H4, T.BLANK, 6.6);
setPairwiseGap(T.H4, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.EQUATION, T.MEDIA, 6.6);
setPairwiseGap(T.EQUATION, T.COLUMNS, 6.6);
setPairwiseGap(T.EQUATION, T.DIVIDER, 6.6);
setPairwiseGap(T.EQUATION, T.BLANK, 6.6);
setPairwiseGap(T.EQUATION, T.PAGEMETADATA, 6.6);

// table -> *
setPairwiseGap(T.TABLE, T.PAGETITLE, 6.6);
setPairwiseGap(T.TABLE, T.PARAGRAPH, 6.6);
setPairwiseGap(T.TABLE, T.LIST, 6.6);
setPairwiseGap(T.TABLE, T.H2, 14.0);
setPairwiseGap(T.TABLE, T.H3, 13.5);
setPairwiseGap(T.TABLE, T.H4, 13.0);
setPairwiseGap(T.TABLE, T.EQUATION, 13.6);
setPairwiseGap(T.TABLE, T.TABLE, 8.0);
setPairwiseGap(T.TABLE, T.CODE, 6.6);
setPairwiseGap(T.TABLE, T.QUOTE, 6.6);
setPairwiseGap(T.TABLE, T.CALLOUT, 6.6);
setPairwiseGap(T.TABLE, T.MEDIA, 6.6);
setPairwiseGap(T.TABLE, T.COLUMNS, 6.6);
setPairwiseGap(T.TABLE, T.DIVIDER, 6.6);
setPairwiseGap(T.TABLE, T.BLANK, 6.6);
setPairwiseGap(T.TABLE, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.CODE, T.MEDIA, 6.6);
setPairwiseGap(T.CODE, T.COLUMNS, 6.6);
setPairwiseGap(T.CODE, T.DIVIDER, 6.6);
setPairwiseGap(T.CODE, T.BLANK, 6.6);
setPairwiseGap(T.CODE, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.QUOTE, T.MEDIA, 6.6);
setPairwiseGap(T.QUOTE, T.COLUMNS, 6.6);
setPairwiseGap(T.QUOTE, T.DIVIDER, 6.6);
setPairwiseGap(T.QUOTE, T.BLANK, 6.6);
setPairwiseGap(T.QUOTE, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.CALLOUT, T.MEDIA, 6.6);
setPairwiseGap(T.CALLOUT, T.COLUMNS, 6.6);
setPairwiseGap(T.CALLOUT, T.DIVIDER, 6.6);
setPairwiseGap(T.CALLOUT, T.BLANK, 6.6);
setPairwiseGap(T.CALLOUT, T.PAGEMETADATA, 6.6);

// media -> *
setPairwiseGap(T.MEDIA, T.PAGETITLE, 6.6);
setPairwiseGap(T.MEDIA, T.PARAGRAPH, 6.6);
setPairwiseGap(T.MEDIA, T.LIST, 6.6);
setPairwiseGap(T.MEDIA, T.H2, 6.6);
setPairwiseGap(T.MEDIA, T.H3, 6.6);
setPairwiseGap(T.MEDIA, T.H4, 6.6);
setPairwiseGap(T.MEDIA, T.EQUATION, 6.6);
setPairwiseGap(T.MEDIA, T.TABLE, 6.6);
setPairwiseGap(T.MEDIA, T.CODE, 6.6);
setPairwiseGap(T.MEDIA, T.QUOTE, 6.6);
setPairwiseGap(T.MEDIA, T.CALLOUT, 6.6);
setPairwiseGap(T.MEDIA, T.MEDIA, 6.6);
setPairwiseGap(T.MEDIA, T.COLUMNS, 6.6);
setPairwiseGap(T.MEDIA, T.DIVIDER, 6.6);
setPairwiseGap(T.MEDIA, T.BLANK, 6.6);
setPairwiseGap(T.MEDIA, T.PAGEMETADATA, 6.6);

// columns -> *
setPairwiseGap(T.COLUMNS, T.PAGETITLE, 6.6);
setPairwiseGap(T.COLUMNS, T.PARAGRAPH, 6.6);
setPairwiseGap(T.COLUMNS, T.LIST, 6.6);
setPairwiseGap(T.COLUMNS, T.H2, 6.6);
setPairwiseGap(T.COLUMNS, T.H3, 6.6);
setPairwiseGap(T.COLUMNS, T.H4, 6.6);
setPairwiseGap(T.COLUMNS, T.EQUATION, 10.0);
setPairwiseGap(T.COLUMNS, T.TABLE, 6.6);
setPairwiseGap(T.COLUMNS, T.CODE, 6.6);
setPairwiseGap(T.COLUMNS, T.QUOTE, 6.6);
setPairwiseGap(T.COLUMNS, T.CALLOUT, 6.6);
setPairwiseGap(T.COLUMNS, T.MEDIA, 6.6);
setPairwiseGap(T.COLUMNS, T.COLUMNS, 6.6);
setPairwiseGap(T.COLUMNS, T.DIVIDER, 6.6);
setPairwiseGap(T.COLUMNS, T.BLANK, 6.6);
setPairwiseGap(T.COLUMNS, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.DIVIDER, T.MEDIA, 6.6);
setPairwiseGap(T.DIVIDER, T.COLUMNS, 6.6);
setPairwiseGap(T.DIVIDER, T.DIVIDER, 6.6);
setPairwiseGap(T.DIVIDER, T.BLANK, 6.6);
setPairwiseGap(T.DIVIDER, T.PAGEMETADATA, 6.6);

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
setPairwiseGap(T.BLANK, T.COLUMNS, 6.6);
setPairwiseGap(T.BLANK, T.DIVIDER, 6.6);
setPairwiseGap(T.BLANK, T.BLANK, 6.6);
setPairwiseGap(T.BLANK, T.PAGEMETADATA, 6.6);

// pageMetadata -> *


// metadata row 사이 간격.
// 3pt ≈ 4px 정도.
setPairwiseGap(T.PAGEMETADATA, T.PAGEMETADATA, 3.0);

// 마지막 metadata 이후 본문과의 간격.
setPairwiseGap(T.PAGEMETADATA, T.PARAGRAPH, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.LIST, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.H2, 5.0);
setPairwiseGap(T.PAGEMETADATA, T.H3, 4.0);
setPairwiseGap(T.PAGEMETADATA, T.H4, 4.0);
setPairwiseGap(T.PAGEMETADATA, T.COLUMNS, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.MEDIA, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.TABLE, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.CODE, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.EQUATION, 3.0);
setPairwiseGap(T.PAGEMETADATA, T.BLANK, 3.0);

captureDefaultPairwiseGapMatrix();
loadPairwiseGapOverrides();

const pairwiseGapDebug = window.NotionPdfGapDebugPanel.createPairwiseGapDebugPanel({
  blockTypeCount: BLOCK_TYPE_COUNT,
  pairwiseGapPt: PAIRWISE_GAP_PT,
  getBlockTypeName,
  isDefaultPairwiseGapCell,
  savePairwiseGapOverrides,
  restoreDefaultPairwiseGapMatrix,
  clearPairwiseGapOverrides,
  refreshPreview: () => {
    document.querySelector(".notion-pdf-preview-pages")?.remove();
    openPdfPreview();
  }
});

window.__openPairwiseGapDebugPanel = pairwiseGapDebug.openPairwiseGapDebugPanel;
window.__PAIRWISE_GAP_PT = PAIRWISE_GAP_PT;

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "g") {
    event.preventDefault();
    pairwiseGapDebug.openPairwiseGapDebugPanel();
  }
});

// 연속 equation 사이의 최소 visual gap 참고값.
// 실제 pushEquationBlock에서는 top gap 중복을 제거한다.

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
function findPageMetadataElement(root) {
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

function isInsidePageMetadata(element) {
  return Boolean(
    element?.closest?.("[role='table'][aria-label='페이지 속성']")
  );
}

function estimatePageMetadataRowBlockHeight(row, layoutWidth) {
  return PAGE_METADATA_ROW_HEIGHT_PX;
}

function measurePageMetadataBlocks(metadataElement, layoutWidth) {
  const rows = getPageMetadataRows(metadataElement);

  if (rows.length === 0) {
    return [];
  }

  const labelWidth = getPageMetadataLabelWidth(rows);

  return rows.map((row, index) => ({
    element: metadataElement,
    type: "pageMetadata",
    text: `${row.label} ${row.value}`,
    layoutWidth,
    height: estimatePageMetadataRowBlockHeight(row, layoutWidth),
    metadataRow: row,
    metadataRowIndex: index,
    metadataLabelWidth: labelWidth
  }));
}
function getPageMetadataTableWidth(layoutWidth) {
  const safeLayoutWidth = Math.max(1, Number(layoutWidth) || PAGE_BODY_WIDTH_PX);

  return Math.min(
    safeLayoutWidth,
    Math.max(
      PAGE_METADATA_TABLE_MIN_WIDTH_PX,
      Math.min(
        PAGE_METADATA_TABLE_MAX_WIDTH_PX,
        safeLayoutWidth * PAGE_METADATA_TABLE_WIDTH_RATIO
      )
    )
  );
}
function getPageMetadataTable(metadataElement) {
  if (!metadataElement) {
    return null;
  }

  if (
    metadataElement.matches?.("[role='table'][aria-label='페이지 속성']")
  ) {
    return metadataElement;
  }

  return metadataElement.querySelector("[role='table'][aria-label='페이지 속성']");
}

function getPageMetadataRows(metadataElement) {
  const table = getPageMetadataTable(metadataElement);

  if (!table) {
    return [];
  }

  const rows = Array.from(table.querySelectorAll("[role='row']"))
    .filter((row) => row.closest("[role='table'][aria-label='페이지 속성']") === table)
    .map((row) => {
      const labelId = row.getAttribute("aria-labelledby");
      const labelCell = labelId ? document.getElementById(labelId) : null;
      const valueElement = row.querySelector("[data-testid='property-value']");

      const labelSource =
        labelCell?.querySelector("div[style*='white-space: nowrap']") ||
        labelCell;

      const label = getElementText(labelSource || row)
        .replace(/\s+/g, " ")
        .trim();

      const value = getElementText(valueElement)
        .replace(/\s+/g, " ")
        .trim();

      return {
        label,
        value,
        element: row
      };
    })
    .filter((row) => {
      if (!row.label || !row.value) {
        return false;
      }

      // Notion UI의 빈 property placeholder는 PDF metadata에서 제외.
      if (row.value === "비어 있음" || row.value.toLowerCase() === "empty") {
        return false;
      }

      return true;
    });

  return rows;
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
function getClassNameText(element) {
  return String(element?.className || "").toLowerCase();
}

function isNotionColumnListBlock(element) {
  const className = getClassNameText(element);

  return (
    className.includes("notion-column_list-block") ||
    className.includes("notion-column-list-block") ||
    className.includes("column_list")
  );
}

function isNotionColumnBlock(element) {
  return getClassNameText(element).includes("notion-column-block");
}

function getDirectColumnBlocks(columnListBlock) {
  if (!columnListBlock) {
    return [];
  }

  const columns = Array.from(
    columnListBlock.querySelectorAll("[data-block-id].notion-column-block")
  )
    .filter((column) => getVisibleRect(column))
    .filter((column) => {
      const nearestColumnList = column.closest(
        ".notion-column_list-block, .notion-column-list-block"
      );

      return nearestColumnList === columnListBlock;
    });

  return sortBlocksByPagePosition(columns);
}

function isColumnsLikeBlock(block) {
  if (!block) {
    return false;
  }

  if (isNotionColumnListBlock(block)) {
    return getDirectColumnBlocks(block).length >= 2;
  }

  return false;
}

function getColumnOuterRect(columnBlock) {
  const columnRect = getVisibleRect(columnBlock);
  const parentRect = getVisibleRect(columnBlock?.parentElement);

  if (parentRect && columnRect && parentRect.width >= columnRect.width) {
    return parentRect;
  }

  return columnRect;
}

function isImmediateContentChildOfContainer(block, container) {
  let node = block.parentElement;

  while (node && node !== container) {
    if (node.hasAttribute?.("data-block-id")) {
      return false;
    }

    node = node.parentElement;
  }

  return node === container;
}
function createRenderedMediaPreview(segment) {
  const layoutWidth = segment.layoutWidth || PAGE_BODY_WIDTH_PX;
  const targetWidth = getPrintMediaTargetWidth(segment.element, layoutWidth);
  const targetHeight = Math.max(
    1,
    Number(segment.contentHeight ?? segment.height) ||
      estimateMediaHeight(segment.element, layoutWidth)
  );

  const wrapper = document.createElement("div");
  wrapper.className = "notion-pdf-preview-rendered-media";
  wrapper.style.width = `${targetWidth}px`;
  wrapper.style.height = `${targetHeight}px`;
  wrapper.style.maxWidth = "100%";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.overflow = "hidden";

  const blockStyle = window.getComputedStyle(segment.element);

  if (
    blockStyle.alignSelf === "center" ||
    segment.element.style.alignSelf === "center"
  ) {
    wrapper.style.marginLeft = "auto";
    wrapper.style.marginRight = "auto";
  }

  const sourceMedia =
    segment.element.matches("img, video, canvas, iframe")
      ? segment.element
      : getSubstantialMediaElement(segment.element) ||
        segment.element.querySelector("img, video, canvas, iframe");

  if (!sourceMedia) {
    return wrapper;
  }

  const clone = sourceMedia.cloneNode(true);

  clone.removeAttribute("loading");
  clone.style.display = "block";
  clone.style.width = "100%";
  clone.style.height = "100%";
  clone.style.maxWidth = "100%";
  clone.style.maxHeight = "100%";
  clone.style.objectFit = "contain";
  clone.style.margin = "0";

  wrapper.append(clone);
  return wrapper;
}
function getColumnInnerContentBlocks(columnBlock) {
  if (!columnBlock) {
    return [];
  }

  const blocks = Array.from(columnBlock.querySelectorAll("[data-block-id]"))
    .filter((block) => block !== columnBlock)
    .filter((block) => getVisibleRect(block))
    .filter((block) => isImmediateContentChildOfContainer(block, columnBlock));

  return sortBlocksByPagePosition(blocks);
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

  if (isColumnsLikeBlock(block)) {
    return "columns";
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
function estimateStackHeight(measuredBlocks) {
  let total = 0;
  let prevType = null;

  for (const block of measuredBlocks) {
    const gapBeforePx = prevType === null
      ? 0
      : ptToPx(getPairwiseGapPt(prevType, block.type));

    total += gapBeforePx + Math.max(1, Number(block.height) || 0);
    prevType = block.type;
  }

  return total;
}

function measureBlockElement(element, layoutWidth, headingFontLevels = null, forcedType = null) {
  const type = forcedType || classifyBlock(element, headingFontLevels);

  const text = type === "code"
    ? getCodeRawTextForEstimate(element)
    : type === "pageMetadata"
      ? getPageMetadataRows(element).map((row) => `${row.label}: ${row.value}`).join("\n")
      : getVisibleTextForEstimate(element, ptToPx(12));

  const measuredBlock = {
    element,
    type,
    text,
    layoutWidth,
    height: 0
  };

  if (type === "pageMetadata") {
    measuredBlock.metadataRows = getPageMetadataRows(element);
    measuredBlock.height = estimatePageMetadataHeight(element, layoutWidth);
    return measuredBlock;
  }

  if (type === "columns") {
    const columnsInfo = measureColumnsBlock(element, layoutWidth, headingFontLevels);

    measuredBlock.columns = columnsInfo.columns;
    measuredBlock.columnGapPx = columnsInfo.columnGapPx;
    measuredBlock.height = columnsInfo.height;

    return measuredBlock;
  }

  if (
    isContainerCapableTextBlock(type) &&
    hasImmediateNestedContentBlocks(element)
  ) {
    const containerInfo = measureTextContainerBlock(
      element,
      layoutWidth,
      type,
      headingFontLevels
    );

    measuredBlock.text = containerInfo.ownText;
    measuredBlock.ownHeight = containerInfo.ownHeight;
    measuredBlock.childBlocks = containerInfo.childBlocks;
    measuredBlock.childrenHeight = containerInfo.childrenHeight;
    measuredBlock.height = containerInfo.height;

    return measuredBlock;
  }

  measuredBlock.height = estimateBlockHeight(element, layoutWidth, type);

  if (type === "table") {
    measuredBlock.tableRowHeights = estimateTableRowHeights(element, layoutWidth);
    measuredBlock.tableRepeatsHeader = tableRepeatsHeader(element);
  }

  return measuredBlock;
}

function getColumnLayoutInfo(columnListBlock, columnBlocks, layoutWidth) {
  const listRect = getVisibleRect(columnListBlock);
  const safeColumnCount = Math.max(1, columnBlocks.length);

  if (!listRect || listRect.width <= 0) {
    const equalWidth = Math.max(120, layoutWidth / safeColumnCount);
    return {
      widths: columnBlocks.map(() => equalWidth),
      columnGapPx: 0
    };
  }

  const widths = columnBlocks.map((columnBlock) => {
    const outerRect = getColumnOuterRect(columnBlock);

    if (!outerRect || outerRect.width <= 0) {
      return Math.max(120, layoutWidth / safeColumnCount);
    }

    const ratio = Math.max(0.05, Math.min(1, outerRect.width / listRect.width));
    return Math.max(120, layoutWidth * ratio);
  });

  const usedWidth = widths.reduce((sum, width) => sum + width, 0);
  const columnGapPx = Math.max(0, layoutWidth - usedWidth);

  return {
    widths,
    columnGapPx
  };
}

function measureColumnsBlock(columnListBlock, layoutWidth, headingFontLevels = null) {
  const columnBlocks = getDirectColumnBlocks(columnListBlock);
  const { widths, columnGapPx } = getColumnLayoutInfo(
    columnListBlock,
    columnBlocks,
    layoutWidth
  );

  const columns = columnBlocks.map((columnBlock, index) => {
    const columnWidth = widths[index] || Math.max(120, layoutWidth / Math.max(1, columnBlocks.length));
    const childElements = getColumnInnerContentBlocks(columnBlock);

    const blocks = childElements.map((childElement) => {
      return measureBlockElement(childElement, columnWidth, headingFontLevels);
    });

    return {
      element: columnBlock,
      width: columnWidth,
      blocks,
      height: estimateStackHeight(blocks)
    };
  });

  return {
    columns,
    columnGapPx,
    height: Math.max(1, ...columns.map((column) => Number(column.height) || 0))
  };
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
function measureTextContainerBlock(element, layoutWidth, type, headingFontLevels = null) {
  const ownText = getOwnVisibleTextForEstimate(element) || " ";
  const ownHeight = estimateLeafBlockHeight(element, layoutWidth, type, ownText);

  const childElements = getImmediateNestedContentBlocks(element);

  const childBlocks = childElements.map((childElement) => {
    return measureBlockElement(childElement, layoutWidth, headingFontLevels);
  });

  const childrenHeight = estimateStackHeight(childBlocks);

  const gapBetweenOwnTextAndChildrenPx = childBlocks.length > 0
    ? ptToPx(getPairwiseGapPt(type, childBlocks[0].type))
    : 0;

  return {
    ownText,
    ownHeight,
    childBlocks,
    childrenHeight,
    height: ownHeight + gapBetweenOwnTextAndChildrenPx + childrenHeight
  };
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
  if (!extraText) {
    return tableHeight;
  }

  const extraLines = estimateWrappedLines(extraText, ptToPx(12), layoutWidth);
  return tableHeight + blockHeightFromPt(extraLines, 18, -0.62, 0);
}

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

function getPrintMediaTargetWidth(block, layoutWidth) {
  const containerWidth = getPrintMediaContainerWidth(block, layoutWidth);

  const widthValue = readInlineStyleValue(block, "width");
  const maxWidthValue = readInlineStyleValue(block, "max-width");

  const widthPx = parseCssLengthToPx(widthValue, containerWidth);
  const maxWidthPx = parseCssLengthToPx(maxWidthValue, containerWidth);

  let targetWidth = containerWidth;

  if (Number.isFinite(widthPx) && widthPx > 0) {
    targetWidth = Math.min(widthPx, containerWidth);
  }

  if (Number.isFinite(maxWidthPx) && maxWidthPx > 0) {
    targetWidth = Math.min(targetWidth, maxWidthPx);
  }

  return Math.max(1, targetWidth);
}

function getMediaAspectRatio(mediaElement) {
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

function estimateMediaHeight(block, layoutWidth) {
  const mediaElement =
    block.matches("img, video, canvas, iframe, figure")
      ? block
      : getSubstantialMediaElement(block) || block.querySelector("img, video, canvas, iframe");

  const targetWidth = getPrintMediaTargetWidth(block, layoutWidth);
  const aspectRatio = getMediaAspectRatio(mediaElement);

  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    return Math.max(1, targetWidth * aspectRatio);
  }

  const mediaRect = getVisibleRect(mediaElement);

  if (mediaRect && mediaRect.height > 0) {
    return mediaRect.height;
  }

  const blockRect = getVisibleRect(block);

  if (blockRect && blockRect.height > 0) {
    return blockRect.height;
  }

  return 220;
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
function cssPxToPt(px) {
  return px / PT_TO_CSS_PX;
}

function getEquationOuterElement(block) {
  return block.matches?.(".notion-equation-block, [class*='notion-equation']")
    ? block
    : block.closest?.(".notion-equation-block, [class*='notion-equation']") || block;
}

function getEquationDisplayElement(block) {
  const outer = getEquationOuterElement(block);

  return Array.from(outer.querySelectorAll(".katex-display"))
    .find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }) || null;
}

function getEquationMetrics(block) {
  const display = getEquationDisplayElement(block);

  if (!display) {
    console.warn("[notion-pdf-preview] No visible .katex-display found.", block);

    return {
      preset: "katex-display-missing",
      measurement: "missing",
      segmentHeightPx: 0,
      samePageHeightPx: 0,
      samePageHeightPt: 0,
      glyphHeightPt: 0,
      topGapPt: 0,
      bottomGapPt: 0,
    };
  }

  const displayRect = display.getBoundingClientRect();

  const fixedTopMarginPx = ptToPx(EQUATION_DISPLAY_MARGIN_TOP_PT);
  const fixedBottomMarginPx = ptToPx(EQUATION_DISPLAY_MARGIN_BOTTOM_PT);

  const displayHeightPx = displayRect.height;
  const segmentHeightPx = displayHeightPx;

  return {
    preset: "katex-display-fixed-padding",
    measurement: "katex-display",

    segmentHeightPx,
    samePageHeightPx: segmentHeightPx,
    pageTopHeightPx: segmentHeightPx,

    samePageHeightPt: cssPxToPt(segmentHeightPx),
    pageTopHeightPt: cssPxToPt(segmentHeightPx),
    glyphHeightPt: cssPxToPt(displayHeightPx),
    topGapPt: 0,
    bottomGapPt: 0,

    debugParts: {
      displayHeightPx,
      segmentHeightPx,
    },
  };
}

function estimateEquationHeight(block) {
  return getEquationMetrics(block).segmentHeightPx;
}
function estimateInlineMathAwareHeight(block, baseHeight) {
  return baseHeight;
}

function getTextFlowLineHeights(element, lines, ownOnly = false) {
  return lines.map((line) => {
    return getTextFlowLineHeightForElement(element, line, ownOnly);
  });
}

function sumHeights(heights, start = 0, end = heights.length) {
  return heights.slice(start, end).reduce((sum, height) => sum + height, 0);
}
const LIST_MARKER_RESERVED_PT = 21.6;
const LIST_NESTED_INDENT_PT = 18;

function getListBlockInfo(block) {
  return `${block.tagName || ""} ${block.className || ""} ${block.getAttribute?.("role") || ""} ${block.getAttribute?.("aria-label") || ""}`.toLowerCase();
}

function getListOwnText(block) {
  return getOwnVisibleTextForEstimate(block) || " ";
}

function getListMarkerText(block, depth = 0, index = 0) {
  const info = getListBlockInfo(block);

  if (info.includes("numbered") || block.closest("ol")) {
    return `${index + 1}.`;
  }

  if (info.includes("to_do") || info.includes("checkbox")) {
    return "☐";
  }

  const bullets = ["•", "◦", "▪"];
  return bullets[depth % bullets.length];
}

function isImmediateNestedChildBlock(parentBlock, candidateBlock) {
  if (!parentBlock || !candidateBlock || parentBlock === candidateBlock) {
    return false;
  }

  const parentId = parentBlock.getAttribute("data-block-id");
  const candidateId = candidateBlock.getAttribute("data-block-id");

  if (!parentId || !candidateId || parentId === candidateId) {
    return false;
  }

  let parent = candidateBlock.parentElement?.closest("[data-block-id]");

  // Notion은 같은 data-block-id wrapper가 중첩될 수 있으므로,
  // candidate와 같은 id의 wrapper는 건너뛴다.
  while (
    parent &&
    parent !== parentBlock &&
    parent.getAttribute("data-block-id") === candidateId
  ) {
    parent = parent.parentElement?.closest("[data-block-id]");
  }

  return parent === parentBlock;
}
function estimateLeafBlockHeight(block, layoutWidth, type, textOverride = null) {
  const text = textOverride != null
    ? textOverride
    : getVisibleTextForEstimate(block, ptToPx(12));

  switch (type) {
    case "pageTitle": {
      const lines = estimateWrappedLines(
        text,
        ptToPx(PAGE_TITLE_FONT_SIZE_PT),
        layoutWidth,
        0,
        "title"
      );
      return blockHeightFromPt(lines, 43.5, 2.25, 0);
    }

    case "h2": {
      const lines = estimateWrappedLines(
        text,
        ptToPx(H2_FONT_SIZE_PT),
        layoutWidth,
        0,
        "heading"
      );
      return blockHeightFromPt(lines, 27, 5.58, 0);
    }

    case "h3": {
      const lines = estimateWrappedLines(
        text,
        ptToPx(H3_FONT_SIZE_PT),
        layoutWidth,
        0,
        "heading"
      );
      return blockHeightFromPt(lines, 21.75, 4.31, 0);
    }

    case "h4": {
      const lines = estimateWrappedLines(
        text,
        ptToPx(H4_FONT_SIZE_PT),
        layoutWidth,
        0,
        "heading"
      );
      return blockHeightFromPt(lines, 18, 3.72, 0);
    }

    case "quote": {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, ptToPx(14.25), 0);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }

    case "callout": {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, ptToPx(40), 0);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }

    default: {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, 0, 0);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }
  }
}
function hasImmediateNestedContentBlocks(block) {
  return getImmediateNestedContentBlocks(block).length > 0;
}

function isContainerCapableTextBlock(type) {
  return (
    type === "paragraph" ||
    type === "quote" ||
    type === "callout" ||
    type === "h2" ||
    type === "h3" ||
    type === "h4"
  );
}
function getImmediateNestedContentBlocks(block) {
  const candidates = Array.from(block.querySelectorAll("[data-block-id]"))
    .filter((nestedBlock) => nestedBlock !== block)
    .filter((nestedBlock) => getVisibleRect(nestedBlock))
    .filter((block) => !isInsidePageMetadata(block))
    .filter((nestedBlock) => isImmediateNestedChildBlock(block, nestedBlock));

  // Notion table은 같은 data-block-id를 가진 wrapper가 여러 겹 중첩된다.
  // 이걸 그대로 받으면 같은 table이 2~3번 preview에 찍힌다.
  // 같은 data-block-id끼리는 가장 바깥쪽 wrapper만 남긴다.
  const outermostOnly = candidates.filter((candidate) => {
    const candidateId = candidate.getAttribute("data-block-id");

    if (!candidateId) {
      return true;
    }

    return !candidates.some((other) => {
      if (other === candidate) {
        return false;
      }

      if (other.getAttribute("data-block-id") !== candidateId) {
        return false;
      }

      return other.contains(candidate);
    });
  });

  // 같은 id가 남아도 마지막 안전장치로 1개만 유지
  const seenIds = new Set();
  const unique = [];

  for (const candidate of outermostOnly) {
    const id = candidate.getAttribute("data-block-id");

    if (id && seenIds.has(id)) {
      continue;
    }

    if (id) {
      seenIds.add(id);
    }

    unique.push(candidate);
  }

  return sortBlocksByPagePosition(unique);
}

function getTextFlowLineHeightForElement(element, line, ownOnly = false) {
  if (isInlineCodeOnlyVisualLine(element, line, ownOnly)) {
    return ptToPx(INLINE_CODE_ONLY_LINE_HEIGHT_PT);
  }

  if (isInlineMathVisualLine(element, line, ownOnly)) {
    return ptToPx(INLINE_MATH_LINE_HEIGHT_PT);
  }

  return ptToPx(18);
}
function getListToListGapPx() {
  return ptToPx(getPairwiseGapPt("list", "list"));
}

function shouldApplyInternalListGap(row, rowIndex) {
  if (rowIndex <= 0) {
    return false;
  }

  if (row.kind === "line") {
    return row.firstLine === true;
  }

  if (row.kind === "textLine") {
    return row.firstLine === true;
  }

  return row.kind === "embeddedBlock";
}

function applyInternalListGaps(rows) {
  return rows.map((row, rowIndex) => ({
    ...row,
    gapBeforePx: shouldApplyInternalListGap(row, rowIndex)
      ? getListToListGapPx()
      : 0
  }));
}

function getListRowBaseHeight(row) {
  if (row.kind === "embeddedBlock") {
    return Math.max(1, Number(row.height) || 0);
  }

  if (row.kind === "textLine") {
    return getTextFlowLineHeightForElement(row.element, row.text, false);
  }

  return getTextFlowLineHeightForElement(row.element, row.text, true);
}

function getListRowTotalHeight(row) {
  return (Number(row.gapBeforePx) || 0) + getListRowBaseHeight(row);
}
function getListChildLayoutWidth(layoutWidth, depth) {
  return Math.max(
    120,
    layoutWidth - ptToPx(LIST_MARKER_RESERVED_PT + depth * LIST_NESTED_INDENT_PT)
  );
}

function createListTextRows({
  block,
  type,
  text,
  layoutWidth,
  depth,
  siblingIndex = 0,
  ownOnly = false,
  kind = "textLine",
  marker = ""
}) {
  const reservedWidth = type === "list"
    ? ptToPx(LIST_MARKER_RESERVED_PT + depth * LIST_NESTED_INDENT_PT)
    : 0;

  const settings = type === "list"
    ? {
        fontSize: BODY_TEXT_FONT_SIZE_PX,
        reservedWidth,
        fontKind: "body"
      }
    : getSegmentWrapSettings({
        type,
        element: block,
        text,
        layoutWidth
      });

  const inlineCodeFragments = getInlineCodeFragmentsForPreview(block, ownOnly);
  const inlineMathFragments = getInlineMathFragmentsForPreview(block, ownOnly);

  const wrappedLines = wrapTextLinesForPreview(
    text || " ",
    settings.fontSize,
    layoutWidth,
    settings.reservedWidth,
    inlineCodeFragments,
    settings.fontKind,
    inlineMathFragments
  );

  return wrappedLines.map((line, lineIndex) => ({
    kind,
    blockType: type,
    text: line || " ",
    element: block,
    depth,
    lineIndex,
    firstLine: lineIndex === 0,
    marker: lineIndex === 0 ? marker : "",
    layoutWidth
  }));
}

function measureChildBlockForList(childBlock, layoutWidth) {
  return measureBlockElement(childBlock, layoutWidth, null);
}

function createListEmbeddedRow(measuredBlock, depth) {
  return {
    kind: "embeddedBlock",
    blockType: measuredBlock.type,
    element: measuredBlock.element,
    depth,
    text: measuredBlock.text || "",
    height: measuredBlock.height,
    layoutWidth: measuredBlock.layoutWidth,
    measuredBlock
  };
}

function buildRowsForChildBlockInList(childBlock, parentLayoutWidth, depth, siblingIndex = 0) {
  const childType = classifyBlock(childBlock);

  // nested list만 재귀 진입.
  if (childType === "list") {
    return buildRawListPreviewRows(
      childBlock,
      parentLayoutWidth,
      depth + 1,
      siblingIndex
    );
  }

  const childLayoutWidth = getListChildLayoutWidth(parentLayoutWidth, depth);
  const measuredChild = measureChildBlockForList(childBlock, childLayoutWidth);

  // paragraph / heading / quote / callout 등은 list row처럼 줄 단위로 풀어준다.
  if (isSyntheticTextSegment(measuredChild.type)) {
    const childText =
      getOwnVisibleTextForEstimate(childBlock) ||
      getVisibleTextForEstimate(childBlock, ptToPx(12)) ||
      " ";

    return createListTextRows({
      block: childBlock,
      type: measuredChild.type,
      text: childText,
      layoutWidth: childLayoutWidth,
      depth,
      ownOnly: false,
      kind: "textLine",
      marker: ""
    });
  }

  // table / code / equation / media / divider / 나중의 columns 모두 여기로 온다.
  return [
    createListEmbeddedRow(measuredChild, depth)
  ];
}

function buildRawListPreviewRows(block, layoutWidth, depth = 0, siblingIndex = 0) {
  const ownText = getListOwnText(block);

  const rows = createListTextRows({
    block,
    type: "list",
    text: ownText,
    layoutWidth,
    depth,
    siblingIndex,
    ownOnly: true,
    kind: "line",
    marker: getListMarkerText(block, depth, siblingIndex)
  });

  const childBlocks = getImmediateNestedContentBlocks(block);

  childBlocks.forEach((childBlock, index) => {
    rows.push(
      ...buildRowsForChildBlockInList(
        childBlock,
        layoutWidth,
        depth,
        index
      )
    );
  });

  return rows;
}

function buildListPreviewRows(block, layoutWidth, depth = 0, siblingIndex = 0) {
  // 외부에서는 항상 gap이 적용된 rows만 사용한다.
  // recursive 내부에서는 gap을 적용하지 않아야 한다.
  return applyInternalListGaps(
    buildRawListPreviewRows(block, layoutWidth, depth, siblingIndex)
  );
}


function getPreviewRowText(row) {
  return typeof row === "string" ? row : row.text;
}
function estimateTextFlowHeight(block, text, layoutWidth, reservedWidth, afterGapPt, ownOnly = false) {
  const inlineCodeFragments = getInlineCodeFragmentsForPreview(block, ownOnly);
  const inlineMathFragments = getInlineMathFragmentsForPreview(block, ownOnly);
  const lines = wrapTextLinesForPreview(text || " ", BODY_TEXT_FONT_SIZE_PX, layoutWidth, reservedWidth, inlineCodeFragments, "body", inlineMathFragments);
  const lineHeightSum = sumHeights(getTextFlowLineHeights(block, lines, ownOnly));
  return lineHeightSum + ptToPx(-0.62 + afterGapPt);
}

function estimateListItemHeight(text, layoutWidth, depth = 0, compact = false, block = null) {
  const reservedWidth = ptToPx(
    LIST_MARKER_RESERVED_PT + depth * LIST_NESTED_INDENT_PT
  );

  return estimateTextFlowHeight(
    block || document.body,
    text,
    layoutWidth,
    reservedWidth,
    0,
    true
  );
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
function getOwnVisibleTextForEstimate(block) {
  if (!block) {
    return "";
  }

  const ownTextParts = [];

  const textLeaves = Array.from(
    block.querySelectorAll("[data-content-editable-leaf='true']")
  );

  for (const leaf of textLeaves) {
    const ownerBlock = leaf.closest("[data-block-id]");

    if (ownerBlock !== block) {
      continue;
    }

    ownTextParts.push(getElementText(leaf));
  }

  return ownTextParts.join("\n").trim();
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
  const rows = buildListPreviewRows(block, layoutWidth, 0, 0);
  const height = rows.reduce((sum, row) => {
    return sum + getListRowTotalHeight(row);
  }, 0);

  return estimateInlineMathAwareHeight(block, height);
}
const PAGE_METADATA_FONT_SIZE_PX = 14;
const PAGE_METADATA_ROW_HEIGHT_PX = 22;
const PAGE_METADATA_LINE_HEIGHT_PX = 20;
const PAGE_METADATA_LABEL_MIN_WIDTH_PX = 42;
const PAGE_METADATA_LABEL_MAX_WIDTH_PX = 88;
const PAGE_METADATA_LABEL_RIGHT_GAP_PX = 10;

const PAGE_METADATA_LABEL_COLOR = "rgba(55, 53, 47, 0.55)";
const PAGE_METADATA_VALUE_COLOR = "rgb(55, 53, 47)";
function measureMetadataTextWidth(text, fontSizePx = PAGE_METADATA_FONT_SIZE_PX) {
  if (!measureMetadataTextWidth.canvas) {
    measureMetadataTextWidth.canvas = document.createElement("canvas");
  }

  const context = measureMetadataTextWidth.canvas.getContext("2d");

  if (!context) {
    return String(text || "").length * fontSizePx * 0.55;
  }

  context.font = `${fontSizePx}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  return context.measureText(String(text || "")).width;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPageMetadataLabelWidth(rows) {
  const maxLabelWidth = rows.reduce((max, row) => {
    return Math.max(max, measureMetadataTextWidth(row.label || ""));
  }, 0);

  return Math.ceil(
    clampNumber(
      maxLabelWidth + PAGE_METADATA_LABEL_RIGHT_GAP_PX,
      PAGE_METADATA_LABEL_MIN_WIDTH_PX,
      PAGE_METADATA_LABEL_MAX_WIDTH_PX
    )
  );
}
function estimatePageMetadataRowHeight(row, layoutWidth) {
  return PAGE_METADATA_ROW_HEIGHT_PX;
}

function estimatePageMetadataHeight(metadataElement, layoutWidth) {
  const rows = getPageMetadataRows(metadataElement);

  if (rows.length === 0) {
    return 0;
  }

  return rows.length * PAGE_METADATA_ROW_HEIGHT_PX + PAGE_METADATA_BOTTOM_GAP_PX;
}

function estimateBlockHeight(block, layoutWidth, type = classifyBlock(block)) {
  const text = getVisibleTextForEstimate(block, ptToPx(12));

  switch (type) {
    case "pageTitle": {
      // Notion page title, not markdown #.
      // Measured formula: 43.5n + 16 pt.
      const lines = estimateWrappedLines(text, ptToPx(PAGE_TITLE_FONT_SIZE_PT), layoutWidth, 0, "title");
      return blockHeightFromPt(lines, 43.5, 2.25, 0);
    }

    case "pageMetadata": {
      return PAGE_METADATA_ROW_HEIGHT_PX;
    }

    case "h2": {
      // Important:
      // In Notion DOM, markdown # is rendered as h2.
      // Measured markdown # formula:
      // visible = 27n + 5.58 pt, after gap = 3 pt.
      const lines = estimateWrappedLines(text, ptToPx(H2_FONT_SIZE_PT), layoutWidth, 0, "heading");
      return blockHeightFromPt(lines, 27, 5.58, 0);
    }

    case "h3": {
      // Important:
      // In Notion DOM, markdown ## is rendered as h3.
      // Measured markdown ## formula:
      // visible = 21.75n + 4.31 pt, after gap = 12.5 pt.
      const lines = estimateWrappedLines(text, ptToPx(H3_FONT_SIZE_PT), layoutWidth, 0, "heading");
      return blockHeightFromPt(lines, 21.75, 4.31, 0);
    }

    case "h4": {
      // Important:
      // In Notion DOM, markdown ### is rendered as h4.
      // Measured markdown ### formula:
      // visible = 18n + 3.72 pt, after gap = 8 pt.
      const lines = estimateWrappedLines(text, ptToPx(H4_FONT_SIZE_PT), layoutWidth, 0, "heading");
      return blockHeightFromPt(lines, 18, 3.72, 0);
    }

    case "list": {
      return estimateListHeight(block, layoutWidth);
    }

    case "columns": {
      return measureColumnsBlock(block, layoutWidth).height;
    }

    case "quote": {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, ptToPx(14.25), 0);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }
    
    case "equation":
      return estimateEquationHeight(block);

    case "callout": {
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, ptToPx(40), 0);
      return estimateInlineMathAwareHeight(block, baseHeight);
    }

    case "code": {
      // Measured code block formula: 18n + 26 pt.
      // n is visual line slots, including blank lines and wrapped long code lines.
      const lineSlots = Math.max(1, getCodePreviewLines(getCodeRawTextForEstimate(block), layoutWidth).length);
      return blockHeightFromPt(lineSlots, CODE_BLOCK_LINE_HEIGHT_PT, CODE_BLOCK_PADDING_TOP_PT + CODE_BLOCK_PADDING_BOTTOM_PT, 0);
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
      const baseHeight = estimateTextFlowHeight(block, text, layoutWidth, 0, 0);
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
  return false;
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

  function lastSegment() {
    const page = currentPage();
    return page.length ? page[page.length - 1] : null;
  }

  function getGapBeforePx(block, continued = false) {
    if (continued) {
      return 0;
    }

    const prev = lastSegment();

    if (!prev || prev.splitAfter) {
      return 0;
    }

    return ptToPx(getPairwiseGapPt(prev.type, block.type));
  }

  function getSegmentContentHeight(block, segmentHeight = block.height) {
    return Math.max(1, Number(segmentHeight) || 0);
  }

  function getAvailableContentHeight(block, continued = false) {
    return pageHeight - usedHeight - getGapBeforePx(block, continued);
  }

  function wouldOverflowSegment(block, segmentHeight = block.height, continued = false) {
    const contentHeight = getSegmentContentHeight(block, segmentHeight);
    const gapBeforePx = getGapBeforePx(block, continued);

    return usedHeight > 0 && usedHeight + gapBeforePx + contentHeight > pageHeight;
  }

  function pushPairwiseSegment(block, options = {}) {
    const continued = Boolean(options.continued);
    const contentHeight = getSegmentContentHeight(block, options.segmentHeight);
    const gapBeforePx = getGapBeforePx(block, continued);
    const segmentHeight = gapBeforePx + contentHeight;

    currentPage().push({
      ...block,
      ...options,
      continued,
      gapBeforePx,
      contentHeight,
      segmentHeight
    });

    usedHeight += segmentHeight;
  }

  function isTextFlowType(type) {
    return type === "paragraph" || type === "list" || type === "quote" || type === "callout";
  }

  function isLineSplittableTextFlow(block) {
    return isTextFlowType(block.type) && block.height > ptToPx(42);
  }

  function pushTableSegment(block, segmentHeight, consumedRows, rowCount, segmentIndex, clipOffset = 0) {
    const splitAfter = consumedRows < rowCount;

    pushPairwiseSegment(block, {
      clipOffset,
      continued: segmentIndex > 0,
      segmentHeight,
      splitAfter
    });
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
      let availableHeight = getAvailableContentHeight(block, segmentIndex > 0);

      if (availableHeight <= 0) {
        startNewPage({
          element: block.element,
          offsetRatio: Math.min(1, consumedRows / rowCount)
        });
        availableHeight = pageHeight;
      }

      const isContinuation = segmentIndex > 0;
      const repeatedHeaderHeight = isContinuation && repeatsHeader ? headerHeight : 0;
      let segmentHeight = borderHeight + repeatedHeaderHeight;
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
      let availableHeight = getAvailableContentHeight(block, segmentIndex > 0);

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

      pushPairwiseSegment(block, {
        clipOffset,
        continued: segmentIndex > 0,
        segmentHeight,
        splitAfter: remainingHeight > 0
      });
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
    if (block.type === "list") {
      const rows = buildListPreviewRows(
        block.element,
        block.layoutWidth || PAGE_BODY_WIDTH_PX,
        0,
        0
      );

      const lineHeights = rows.map((row) => getListRowTotalHeight(row));
      const trailingGap = Math.max(0, block.height - sumHeights(lineHeights));

      return {
        rows,
        lineHeights,
        trailingGap
      };
    }

    const lines = formatSegmentTextForPreview(block).split("\n");
    const lineHeights = getTextFlowLineHeights(block.element, lines, false);
    const trailingGap = Math.max(0, block.height - sumHeights(lineHeights));

    return {
      rows: lines,
      lineHeights,
      trailingGap
    };
  }

  function pushTextFlowSegment(block, rows, lineStart, lineEnd, segmentHeight, segmentIndex, totalLines) {
    const splitAfter = lineEnd < totalLines;
    const selectedRows = rows.slice(lineStart, lineEnd);

    pushPairwiseSegment(block, {
      text: selectedRows.map(getPreviewRowText).join("\n"),
      listRows: block.type === "list" ? selectedRows : undefined,
      continued: segmentIndex > 0,
      segmentHeight,
      splitAfter
    });
  }

  function paginateTextFlowBlock(block) {
    const { rows, lineHeights, trailingGap } = getTextFlowLineMetrics(block);
    const totalLines = Math.max(1, rows.length);
    let lineIndex = 0;
    let segmentIndex = 0;

    if (totalLines <= 1) {
      return false;
    }

    while (lineIndex < totalLines) {
      let availableHeight = getAvailableContentHeight(block, segmentIndex > 0);
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
        pushTextFlowSegment(block, rows, lineIndex, totalLines, finalHeight, segmentIndex, totalLines);
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

      pushTextFlowSegment(block, rows, lineIndex, lineEnd, segmentHeight, segmentIndex, totalLines);
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
    pushPairwiseSegment(block, {
      text: lines.slice(lineStart, lineEnd).join("\n"),
      continued: segmentIndex > 0,
      codePaddingTop,
      codePaddingBottom,
      segmentHeight,
      splitAfter
    });
  }

  function paginateCodeBlock(block) {
    const lines = getCodePreviewLines(block.text || getCodeRawTextForEstimate(block.element), block.layoutWidth || PAGE_BODY_WIDTH_PX);
    const totalLines = Math.max(1, lines.length);
    const lineHeight = ptToPx(CODE_BLOCK_LINE_HEIGHT_PT);
    const firstTopPadding = ptToPx(CODE_BLOCK_PADDING_TOP_PT);
  const finalBottomSpace = ptToPx(CODE_BLOCK_PADDING_BOTTOM_PT);
    let lineIndex = 0;
    let segmentIndex = 0;

    while (lineIndex < totalLines) {
      let availableHeight = getAvailableContentHeight(block, segmentIndex > 0);
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

    const contentHeight =
      metrics.segmentHeightPx ||
      metrics.samePageHeightPx ||
      block.height;

    if (wouldOverflowSegment(block, contentHeight)) {
      startNewPage({
        element: block.element,
        offsetRatio: 0
      });
    }

    pushPairwiseSegment(block, {
      continued: false,
      clipOffset: 0,

      equationMetrics: metrics,
      equationPreset: metrics.preset,
      equationMeasurement: metrics.measurement,

      segmentHeight: contentHeight,
      splitAfter: false
    });
  }

  for (const block of blocks) {
    const blockHeight = Math.max(1, Number(block.height) || 0);
    const isOversized = blockHeight > pageHeight;

    // 1. Table
    // table은 row 단위 split이 가능하므로 먼저 처리한다.
    // 단, row가 1개 이하라 paginateTableBlock()이 false를 반환할 수 있으므로
    // 그 경우에는 아래 일반 block 처리로 fall through 시킨다.
    if (
      block.type === "table" &&
      (isOversized || wouldOverflowSegment(block))
    ) {
      if (paginateTableBlock(block)) {
        continue;
      }
    }

    // 2. Code block
    // code는 line 단위 split을 우선 적용한다.
    if (
      block.type === "code" &&
      (isOversized || wouldOverflowSegment(block))
    ) {
      paginateCodeBlock(block);
      continue;
    }

    // 3. Equation
    // equation은 자체 content height를 다시 재므로 전용 push 함수로 보낸다.
    // pushEquationBlock 내부에서 pairwise gap + page overflow를 처리해야 한다.
    if (block.type === "equation") {
      pushEquationBlock(block);
      continue;
    }

    // 4. Paragraph / List / Quote / Callout
    // 여러 줄짜리 text flow는 line 단위 split을 시도한다.
    if (
      isLineSplittableTextFlow(block) &&
      (isOversized || wouldOverflowSegment(block))
    ) {
      if (paginateTextFlowBlock(block)) {
        continue;
      }
    }

    // 5. 일반 block
    // 현재 페이지에 들어갈 수 있으면 pairwise gap을 붙여 push한다.
    if (!isOversized) {
      if (wouldOverflowSegment(block)) {
        startNewPage({
          element: block.element,
          offsetRatio: 0
        });
      }

      pushPairwiseSegment(block, {
        continued: false,
        segmentHeight: block.height,
        splitAfter: false
      });

      continue;
    }

    // 6. 너무 큰 block fallback
    // table/code/text-flow에서 처리되지 않은 큰 block은 height 기준으로 잘라낸다.
    // 예: media, 큰 custom block 등.
    if (usedHeight > 0) {
      startNewPage({
        element: block.element,
        offsetRatio: 0
      });
    }

    paginateHeightSplitBlock(block);
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
  const pageMetadataElement = findPageMetadataElement(contentRoot);

  const bodyElements = getContentBlocks(contentRoot)
    .filter((element) => element !== pageTitleElement)
    .filter((element) => !isInsidePageMetadata(element));

  const headingFontLevels = getHeadingFontLevels(bodyElements);

  const bodyMeasuredBlocks = bodyElements.map((element) => {
    return measureBlockElement(element, layoutWidth, headingFontLevels);
  });

  const measuredBlocks = [];

  if (pageTitleElement) {
    const titleText = getVisibleTextForEstimate(pageTitleElement);

    measuredBlocks.push({
      element: pageTitleElement,
      type: "pageTitle",
      text: titleText,
      layoutWidth,
      height: estimateBlockHeight(pageTitleElement, layoutWidth, "pageTitle")
    });
  }

  if (pageMetadataElement) {
    measuredBlocks.push(
      ...measurePageMetadataBlocks(pageMetadataElement, layoutWidth)
    );
  }

  measuredBlocks.push(...bodyMeasuredBlocks);

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

  if (segment.type === "list") {
    const rows = segment.listRows || buildListPreviewRows(
      segment.element,
      segment.layoutWidth || PAGE_BODY_WIDTH_PX,
      0,
      0
    );

    return rows.map((row) => {
      if (row.kind === "embeddedBlock") {
        return `${"  ".repeat(row.depth)}[${row.blockType}]`;
      }

      const indent = "  ".repeat(row.depth);
      const marker = row.firstLine ? `${row.marker} ` : "  ";
      return `${indent}${marker}${row.text}`;
    }).join("\n") || "(empty block)";
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

  // pairwise gap 방식에서는 table 자체 margin을 주지 않는다.
  // table 앞 간격은 createRenderedPdfPreviewSegment()의 gapBeforePx가 담당한다.
  table.style.margin = "0";
  table.style.width = "100%";

  const rows = getTableRows(segment.element);

  for (const row of rows) {
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
function createRenderedMeasuredBlockStack(blocks, stackWidth) {
  const stack = document.createElement("div");
  stack.className = "notion-pdf-preview-rendered-stack";
  stack.style.width = `${stackWidth}px`;
  stack.style.boxSizing = "border-box";
  stack.style.overflow = "hidden";

  let prevType = null;

  for (const block of blocks) {
    const gapBeforePx = prevType === null
      ? 0
      : ptToPx(getPairwiseGapPt(prevType, block.type));

    const segment = {
      ...block,
      gapBeforePx,
      contentHeight: block.height,
      segmentHeight: gapBeforePx + block.height,
      clipOffset: 0,
      continued: false,
      splitAfter: false
    };

    stack.append(createRenderedPdfPreviewSegment(segment));
    prevType = block.type;
  }

  return stack;
}

function createRenderedColumnsPreview(segment) {
  const measured = Array.isArray(segment.columns)
    ? {
        columns: segment.columns,
        columnGapPx: Number(segment.columnGapPx) || 0,
        height: segment.height
      }
    : measureColumnsBlock(
        segment.element,
        segment.layoutWidth || PAGE_BODY_WIDTH_PX,
        null
      );

  const columns = measured.columns || [];
  const columnGapPx = Math.max(0, Number(measured.columnGapPx) || 0);

  const wrapper = document.createElement("div");
  wrapper.className = "notion-pdf-preview-rendered-columns";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "flex-start";
  wrapper.style.width = `${segment.layoutWidth || PAGE_BODY_WIDTH_PX}px`;
  wrapper.style.height = `${Math.max(1, Number(segment.height) || Number(measured.height) || 1)}px`;
  wrapper.style.boxSizing = "border-box";
  wrapper.style.overflow = "hidden";

  if (columns.length > 1) {
    wrapper.style.columnGap = `${columnGapPx / Math.max(1, columns.length - 1)}px`;
    wrapper.style.gap = `${columnGapPx / Math.max(1, columns.length - 1)}px`;
  }

  for (const column of columns) {
    const columnElement = document.createElement("div");
    columnElement.className = "notion-pdf-preview-rendered-column";
    columnElement.style.width = `${Math.max(1, Number(column.width) || 1)}px`;
    columnElement.style.flex = `0 0 ${Math.max(1, Number(column.width) || 1)}px`;
    columnElement.style.minWidth = "0";
    columnElement.style.boxSizing = "border-box";
    columnElement.style.overflow = "hidden";

    columnElement.append(
      createRenderedMeasuredBlockStack(
        column.blocks || [],
        Math.max(1, Number(column.width) || 1)
      )
    );

    wrapper.append(columnElement);
  }

  return wrapper;
}

function createRenderedTextContainerPreview(segment) {
  const wrapper = document.createElement("div");
  wrapper.className = "notion-pdf-preview-rendered-text-container";
  wrapper.style.width = `${segment.layoutWidth || PAGE_BODY_WIDTH_PX}px`;
  wrapper.style.height = `${Math.max(1, Number(segment.height) || 1)}px`;
  wrapper.style.boxSizing = "border-box";
  wrapper.style.overflow = "hidden";

  const ownSegment = {
    ...segment,
    text: segment.text || " ",
    childBlocks: undefined,
    height: segment.ownHeight || estimateLeafBlockHeight(
      segment.element,
      segment.layoutWidth || PAGE_BODY_WIDTH_PX,
      segment.type,
      segment.text || " "
    ),
    contentHeight: segment.ownHeight,
    segmentHeight: segment.ownHeight,
    gapBeforePx: 0,
    clipOffset: 0,
    continued: false,
    splitAfter: false
  };

  wrapper.append(createSyntheticTextPreview(ownSegment));

  let prevType = segment.type;

  for (const childBlock of segment.childBlocks || []) {
    const gapBeforePx = ptToPx(getPairwiseGapPt(prevType, childBlock.type));

    const childSegment = {
      ...childBlock,
      gapBeforePx,
      contentHeight: childBlock.height,
      segmentHeight: gapBeforePx + childBlock.height,
      clipOffset: 0,
      continued: false,
      splitAfter: false
    };

    wrapper.append(createRenderedPdfPreviewSegment(childSegment));
    prevType = childBlock.type;
  }

  return wrapper;
}

function createRenderedPageMetadataPreview(segment) {
  const row =
    segment.metadataRow ||
    segment.metadataRows?.[0] ||
    getPageMetadataRows(segment.element)[0];

  const layoutWidth = segment.layoutWidth || PAGE_BODY_WIDTH_PX;
  const labelWidth = Number(segment.metadataLabelWidth) ||
    getPageMetadataLabelWidth(row ? [row] : []);

  const wrapper = document.createElement("div");
  wrapper.className = "notion-pdf-preview-page-metadata-row-block";
  wrapper.style.width = `${layoutWidth}px`;
  wrapper.style.height = `${PAGE_METADATA_ROW_HEIGHT_PX}px`;
  wrapper.style.lineHeight = `${PAGE_METADATA_LINE_HEIGHT_PX}px`;
  wrapper.style.boxSizing = "border-box";
  wrapper.style.overflow = "hidden";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.fontSize = `${PAGE_METADATA_FONT_SIZE_PX}px`;
  wrapper.style.color = PAGE_METADATA_VALUE_COLOR;

  if (!row) {
    return wrapper;
  }

  const label = document.createElement("div");
  label.className = "notion-pdf-preview-page-metadata-label";
  label.textContent = row.label;
  label.style.flex = `0 0 ${labelWidth}px`;
  label.style.width = `${labelWidth}px`;
  label.style.maxWidth = `${labelWidth}px`;
  label.style.minWidth = "0";
  label.style.boxSizing = "border-box";
  label.style.color = PAGE_METADATA_LABEL_COLOR;
  label.style.whiteSpace = "nowrap";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.paddingRight = `${PAGE_METADATA_LABEL_RIGHT_GAP_PX}px`;

  const value = document.createElement("div");
  value.className = "notion-pdf-preview-page-metadata-value";
  value.textContent = row.value;
  value.style.flex = "1 1 auto";
  value.style.minWidth = "0";
  value.style.boxSizing = "border-box";
  value.style.color = PAGE_METADATA_VALUE_COLOR;
  value.style.whiteSpace = "nowrap";
  value.style.overflow = "hidden";
  value.style.textOverflow = "clip";
  value.style.lineHeight = `${PAGE_METADATA_LINE_HEIGHT_PX}px`;

  wrapper.append(label, value);
  return wrapper;
}

function createRenderedPreviewForGenericSegment(segment) {
  if (segment.type === "pageMetadata") {
    return createRenderedPageMetadataPreview(segment);
  }
  if (Array.isArray(segment.childBlocks)) {
    return createRenderedTextContainerPreview(segment);
  }

  if (segment.type === "columns") {
    return createRenderedColumnsPreview(segment);
  }

  if (segment.type === "media") {
    return createRenderedMediaPreview(segment);
  }

  if (segment.type === "table") {
    return createRenderedTablePreview(segment);
  }

  if (segment.type === "equation") {
    return createRenderedEquationPreview(segment);
  }

  if (isSyntheticTextSegment(segment.type) || segment.type === "code") {
    return createSyntheticTextPreview(segment);
  }

  return prepareCloneForMeasurement(
    segment.element.cloneNode(true),
    segment.type
  );
}
function createEmbeddedListBlockPreview(row, parentSegment) {
  const embedded = document.createElement("div");
  embedded.className = "notion-pdf-preview-synthetic-list-embedded-block";

  embedded.style.setProperty(
    "--notion-pdf-preview-list-depth-indent",
    `${ptToPx(row.depth * LIST_NESTED_INDENT_PT + LIST_MARKER_RESERVED_PT)}px`
  );

  embedded.style.height = `${Math.max(1, Number(row.height) || 0)}px`;
  embedded.style.boxSizing = "border-box";
  embedded.style.overflow = "hidden";

  const measuredBlock = row.measuredBlock || {
    type: row.blockType,
    element: row.element,
    text: row.text || getVisibleTextForEstimate(row.element, 0),
    layoutWidth: row.layoutWidth,
    height: row.height
  };

  const childSegment = {
    ...measuredBlock,
    gapBeforePx: 0,
    contentHeight: measuredBlock.height,
    segmentHeight: measuredBlock.height,
    clipOffset: 0,
    continued: false,
    splitAfter: false
  };

  const preview = createRenderedPreviewForGenericSegment(childSegment);
  embedded.append(preview);

  return embedded;
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

  if (segment.type === "list") {
    const rows = Array.isArray(segment.listRows)
      ? segment.listRows
      : buildListPreviewRows(
          segment.element,
          segment.layoutWidth || PAGE_BODY_WIDTH_PX,
          0,
          0
        );

    for (const row of rows) {
      const gapBeforePx = Math.max(0, Number(row.gapBeforePx) || 0);

      if (gapBeforePx > 0) {
        const spacer = document.createElement("div");
        spacer.className = "notion-pdf-preview-synthetic-list-spacer";
        spacer.style.height = `${gapBeforePx}px`;
        text.append(spacer);
      }

      if (row.kind === "embeddedBlock") {
        text.append(createEmbeddedListBlockPreview(row, segment));
        continue;
      }

      const baseHeightPx = getListRowBaseHeight(row);

      const lineElement = document.createElement("div");
      lineElement.className =
        "notion-pdf-preview-synthetic-line notion-pdf-preview-synthetic-list-line";

      lineElement.style.setProperty(
        "--notion-pdf-preview-list-depth-indent",
        `${ptToPx(row.depth * LIST_NESTED_INDENT_PT)}px`
      );

      lineElement.style.setProperty(
        "--notion-pdf-preview-list-marker-width",
        `${ptToPx(LIST_MARKER_RESERVED_PT)}px`
      );

      lineElement.style.height = `${baseHeightPx}px`;
      lineElement.style.lineHeight = `${baseHeightPx}px`;

      const marker = document.createElement("span");
      marker.className = "notion-pdf-preview-synthetic-list-marker";
      marker.textContent =
        row.kind === "line" && row.firstLine
          ? row.marker
          : "";

      const content = document.createElement("span");
      content.className = "notion-pdf-preview-synthetic-list-content";

      appendSyntheticLineContent(content, row.text, {
        ...segment,
        type: row.blockType || segment.type,
        element: row.element || segment.element
      });

      lineElement.append(marker, content);
      text.append(lineElement);
    }

    return text;
  }
  const lines = formatSegmentTextForPreview(segment).split("\n");

  for (const line of lines) {
    const lineElement = document.createElement("div");
    lineElement.className = "notion-pdf-preview-synthetic-line";
    appendSyntheticLineContent(lineElement, line, segment);
    text.append(lineElement);
  }

  return text;
}
function createRenderedEquationPreview(segment) {
  const wrapper = document.createElement("div");
  wrapper.className = "notion-pdf-preview-rendered-equation-inner";

  wrapper.style.boxSizing = "border-box";
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  wrapper.style.paddingTop = "0px";
  wrapper.style.paddingBottom = "0px";
  wrapper.style.overflow = "hidden";

  const sourceDisplay = getEquationDisplayElement(segment.element);

  if (!sourceDisplay) {
    return wrapper;
  }

  const displayClone = sourceDisplay.cloneNode(true);

  // 핵심:
  // 원본 .katex-display에는 margin-top/bottom이 이미 있을 수 있으므로
  // 반드시 제거해야 한다. 안 그러면 12pt + 원본 margin이 중복됨.
  displayClone.style.setProperty("margin", "0", "important");
  displayClone.style.setProperty("margin-top", "0", "important");
  displayClone.style.setProperty("margin-bottom", "0", "important");
  displayClone.style.setProperty("padding", "0", "important");
  displayClone.style.setProperty("width", "100%", "important");
  displayClone.style.setProperty("max-width", "none", "important");
  displayClone.style.setProperty("box-sizing", "border-box", "important");

  wrapper.append(displayClone);
  return wrapper;
}

function createRenderedPdfPreviewSegment(segment) {
  const segmentElement = document.createElement("div");

  const segmentHeight = Math.max(1, segment.segmentHeight ?? segment.height);
  const gapBeforePx = Math.max(0, Number(segment.gapBeforePx) || 0);
  const contentHeight = Math.max(
    1,
    Number(segment.contentHeight ?? segment.height ?? segmentHeight - gapBeforePx) || 0
  );

  const debugLabel =
    `${segment.type} | ${Math.round(segmentHeight)}px` +
    ` | gap ${Math.round(gapBeforePx)}px` +
    ` | content ${Math.round(contentHeight)}px` +
    `${segment.continued ? " | continued" : ""}` +
    `${segment.splitAfter ? " | splits" : ""}`;

  segmentElement.className = "notion-pdf-preview-rendered-segment";
  segmentElement.dataset.type = segment.type;
  segmentElement.dataset.debugLabel = debugLabel;
  segmentElement.dataset.copyText = segment.text || "(empty block)";

  // 핵심:
  // segmentHeight는 이미 gapBeforePx + contentHeight를 포함한다.
  // 따라서 gap을 margin으로 주면 preview DOM flow에서 간격이 이중으로 보일 수 있다.
  segmentElement.style.position = "relative";
  segmentElement.style.boxSizing = "border-box";
  segmentElement.style.width = "100%";
  segmentElement.style.height = `${segmentHeight}px`;
  segmentElement.style.overflow = "hidden";
  

  if (segment.continued || segment.splitAfter) {
    segmentElement.classList.add("notion-pdf-preview-rendered-segment-clipped");
  }

  if (segment.type === "equation") {
    segmentElement.classList.add("notion-pdf-preview-rendered-segment-equation");
  }

  const clone = createRenderedPreviewForGenericSegment(segment);

  clone.classList.add("notion-pdf-preview-rendered-clone");

  // 핵심:
  // marginTop 금지.
  // gap은 normal flow가 아니라 absolute top offset으로만 표현한다.
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.right = "0";
  clone.style.top = `${gapBeforePx}px`;
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.marginTop = "0";
  clone.style.marginBottom = "0";
  clone.style.boxSizing = "border-box";

  clone.style.setProperty("--notion-pdf-preview-gap-before", `${gapBeforePx}px`);
  clone.style.height = `${contentHeight}px`;
  clone.style.overflow = "hidden";
    

  // clone 자체가 content 영역 높이만 차지하도록 제한.
  // synthetic/equation은 내부가 100%를 쓰는 경우가 있어서 이게 중요함.
  clone.style.height = `${contentHeight}px`;
  clone.style.overflow = "hidden";

  const clipOffset = segment.type === "equation"
    ? 0
    : Number(segment.clipOffset) || 0;

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
