import { PT_TO_CSS_PX } from "../config/layoutConstants.js";

export function ptToPx(pt) {
  return pt * PT_TO_CSS_PX;
}

export function cssPxToPt(px) {
  return px / PT_TO_CSS_PX;
}
