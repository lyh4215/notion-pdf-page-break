export function getVisibleRect(element) {
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
