export const BlockType = Object.freeze({
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
  COLUMNSTART: 16,

  // 실제 block 아님.
  // list 내부 bullet text row gap 계산용 가상 타입.
  LISTLINE: 17,
});

export const T = BlockType;
export const BLOCK_TYPE_COUNT = Object.keys(BlockType).length;
export const DEFAULT_PAIRWISE_GAP_PT = 6.6;

export const BLOCK_TYPE_INDEX = Object.freeze({
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

  columnStart: T.COLUMNSTART,
  listLine: T.LISTLINE,
});
export const BLOCK_TYPE_LABELS = Object.freeze([
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
  "columnStart",
  "listLine",
]);

let PAIRWISE_GAP_DEFAULT_PT = null;

export function normalizeBlockTypeIndex(type) {
  if (Number.isInteger(type) && type >= 0 && type < BLOCK_TYPE_COUNT) {
    return type;
  }

  return BLOCK_TYPE_INDEX[type] ?? T.PARAGRAPH;
}

export function getBlockTypeName(index) {
  return BLOCK_TYPE_LABELS[index] ?? `type-${index}`;
}

export function getBlockTypeIndex(type) {
  return normalizeBlockTypeIndex(type);
}
