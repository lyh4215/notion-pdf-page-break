import { MEASURE_ROOT_ID } from "../config/layoutConstants.js";

export function getInheritedStyleSnapshot(element) {
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

export function applyInheritedStyleSnapshot(element, styleSnapshot) {
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

export function prepareCloneForMeasurement(clone, type = "paragraph") {
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

export function applyRenderedMeasurements(contentRoot, measuredBlocks, layoutWidth) {
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
