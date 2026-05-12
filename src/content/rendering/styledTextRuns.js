export function appendStyledTextRun(parent, value) {
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
