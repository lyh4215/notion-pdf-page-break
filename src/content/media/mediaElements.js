import { getVisibleRect } from "../utils/domRects.js";

export function hasExplicitMediaHint(blockInfo) {
  return (
    blockInfo.includes("image") ||
    blockInfo.includes("video") ||
    blockInfo.includes("embed") ||
    blockInfo.includes("audio") ||
    blockInfo.includes("pdf") ||
    blockInfo.includes("file")
  );
}

export function getSubstantialMediaElement(block) {
  const candidates = Array.from(block.querySelectorAll("img, video, iframe, canvas, figure"));

  return candidates.find((element) => {
    const rect = getVisibleRect(element);
    return rect && rect.width >= 80 && rect.height >= 60;
  }) || null;
}

export function getMediaImageElement(block) {
  if (!block) {
    return null;
  }

  if (block.matches?.("img")) {
    return block;
  }

  return getSubstantialMediaElement(block) || block.querySelector("img");
}
