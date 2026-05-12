export const OVERLAY_ID = "notion-pdf-preview-overlay";
export const PANEL_ID = "notion-pdf-preview-panel";
export const PDF_PREVIEW_ID = "notion-pdf-preview-pages";
export const MEASURE_ROOT_ID = "notion-pdf-preview-measure-root";

// Calibrated from Notion native PDF export: A4, scale 100%.
// PDF units: 1pt = 4/3 CSS px.
export const PT_TO_CSS_PX = 4 / 3;

export const A4_WIDTH_PT = 595.92;
export const A4_HEIGHT_PT = 842.88;
export const A4_WIDTH_PX = A4_WIDTH_PT * PT_TO_CSS_PX;
export const A4_HEIGHT_PX = A4_HEIGHT_PT * PT_TO_CSS_PX;

// Notion native PDF export content box, A4 scale 100%.
// Body content uses ~1 inch margins; browser footer/header live outside this box.
export const PAGE_BODY_MARGIN_PT = 72;
export const PAGE_BODY_WIDTH_PT = A4_WIDTH_PT - PAGE_BODY_MARGIN_PT * 2;
export const PAGE_BODY_HEIGHT_PT = A4_HEIGHT_PT - PAGE_BODY_MARGIN_PT * 2;
export const PAGE_BODY_WIDTH_PX = PAGE_BODY_WIDTH_PT * PT_TO_CSS_PX;
export const PAGE_BODY_HEIGHT_PX = PAGE_BODY_HEIGHT_PT * PT_TO_CSS_PX;
export const PAGE_TITLE_FONT_SIZE_PT = 30;
export const H2_FONT_SIZE_PT = 22.5;
export const H3_FONT_SIZE_PT = 18;
export const H4_FONT_SIZE_PT = 15;
export const BODY_TEXT_FONT_SIZE_PT = 12;
export const INLINE_CODE_FONT_SIZE_PT = 8.75;
export const INLINE_CODE_ONLY_LINE_HEIGHT_PT = 12.5;
export const INLINE_MATH_LINE_HEIGHT_PT = 18.75;

export const CODE_BLOCK_FONT_SIZE_PT = 13.5;
export const CODE_BLOCK_LINE_HEIGHT_PT = 18;
export const CODE_BLOCK_PADDING_TOP_PT = 12;
export const CODE_BLOCK_PADDING_RIGHT_PT = 12;
export const CODE_BLOCK_PADDING_BOTTOM_PT = 14;
export const CODE_BLOCK_PADDING_LEFT_PT = 12;
export const CODE_BLOCK_MARGIN_BOTTOM_PT = 5.5;

export const TABLE_TEXT_FONT_SIZE_PT = 10.5;

// 이 값은 "표 전용 추가 top gap"이다.
// 이전 문단 afterGap 6.6pt + TABLE_TOP_GAP_PT 5.0pt ≈ 실제 표 앞 시각 gap 11.6pt
export const TABLE_TOP_GAP_PT = 5.0;

export const EQUATION_DISPLAY_MARGIN_TOP_PT = 9;
export const EQUATION_DISPLAY_MARGIN_BOTTOM_PT = 11;
