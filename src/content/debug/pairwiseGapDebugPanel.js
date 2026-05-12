  function ensurePairwiseGapDebugPanelStyle() {
    if (document.getElementById("notion-pdf-gap-debug-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "notion-pdf-gap-debug-style";
    style.textContent = `
      .notion-pdf-gap-debug-panel {
        position: fixed;
        right: 20px;
        top: 20px;
        z-index: 2147483647;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        width: min(92vw, 980px);
        height: min(88vh, 720px);
        border: 1px solid rgba(15, 23, 42, 0.18);
        border-radius: 10px;
        background: #ffffff;
        box-shadow: 0 20px 80px rgba(15, 23, 42, 0.32);
        color: #111827;
        font: 12px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
      }

      .notion-pdf-gap-debug-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid #e5e7eb;
        background: #f8fafc;
      }

      .notion-pdf-gap-debug-header strong {
        font-size: 13px;
      }

      .notion-pdf-gap-debug-header span {
        color: #64748b;
        font-size: 11px;
      }

      .notion-pdf-gap-debug-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px 12px;
        border-bottom: 1px solid #e5e7eb;
        background: #ffffff;
      }

      .notion-pdf-gap-debug-actions button,
      .notion-pdf-gap-debug-header button {
        min-height: 28px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 9px;
        background: #ffffff;
        color: #1f2937;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .notion-pdf-gap-debug-actions button:hover,
      .notion-pdf-gap-debug-header button:hover {
        background: #f1f5f9;
      }

      .notion-pdf-gap-debug-table-wrap {
        overflow: auto;
        background: #ffffff;
      }

      .notion-pdf-gap-debug-table {
        border-collapse: collapse;
        width: max-content;
        min-width: 100%;
      }

      .notion-pdf-gap-debug-table th,
      .notion-pdf-gap-debug-table td {
        border: 1px solid #e5e7eb;
        padding: 4px;
        text-align: center;
        white-space: nowrap;
        background: #ffffff;
      }

      .notion-pdf-gap-debug-table th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #f8fafc;
        color: #334155;
        font-weight: 800;
      }

      .notion-pdf-gap-debug-table th:first-child {
        left: 0;
        z-index: 3;
      }

      .notion-pdf-gap-debug-row-label {
        position: sticky;
        left: 0;
        z-index: 1;
        background: #f8fafc !important;
        color: #334155;
        font-weight: 800;
        text-align: right !important;
      }

      .notion-pdf-gap-debug-cell-input {
        width: 58px;
        height: 26px;
        border: 1px solid #cbd5e1;
        border-radius: 5px;
        padding: 0 5px;
        text-align: right;
        font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        background: #ffffff;
        color: #111827;
      }

      .notion-pdf-gap-debug-cell-input[data-changed="true"] {
        border-color: #2563eb;
        background: #eff6ff;
        color: #1d4ed8;
        font-weight: 800;
      }

      .notion-pdf-gap-debug-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 12px;
        border-top: 1px solid #e5e7eb;
        background: #f8fafc;
        color: #64748b;
        font-size: 11px;
      }

      .notion-pdf-gap-debug-toast {
        color: #2563eb;
        font-weight: 800;
      }
    `;

    document.head.append(style);
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn("[notion-pdf-preview] Failed to copy text.", error);
      return false;
    }
  }

export function createPairwiseGapDebugPanel(deps) {
    const {
      blockTypeCount,
      pairwiseGapPt,
      getBlockTypeName,
      isDefaultPairwiseGapCell,
      savePairwiseGapOverrides,
      restoreDefaultPairwiseGapMatrix,
      clearPairwiseGapOverrides,
      refreshPreview
    } = deps;

    function getPairwiseGapSetCode() {
      const lines = [];

      lines.push("// pairwise gap matrix overrides");
      lines.push("// format: setPairwiseGap(prevType, nextType, gapPt);");

      for (let row = 0; row < blockTypeCount; row += 1) {
        const prevName = getBlockTypeName(row).toUpperCase();

        lines.push("");
        lines.push(`// ${getBlockTypeName(row)} -> *`);

        for (let col = 0; col < blockTypeCount; col += 1) {
          const nextName = getBlockTypeName(col).toUpperCase();
          const value = pairwiseGapPt[row][col];

          lines.push(
            `setPairwiseGap(T.${prevName}, T.${nextName}, ${Number(value).toFixed(1)});`
          );
        }
      }

      return lines.join("\n");
    }

    function getPairwiseGapChangedSetCode() {
      const lines = [];

      lines.push("// changed pairwise gap overrides only");

      for (let row = 0; row < blockTypeCount; row += 1) {
        for (let col = 0; col < blockTypeCount; col += 1) {
          if (isDefaultPairwiseGapCell(row, col)) {
            continue;
          }

          const prevName = getBlockTypeName(row).toUpperCase();
          const nextName = getBlockTypeName(col).toUpperCase();
          const value = pairwiseGapPt[row][col];

          lines.push(
            `setPairwiseGap(T.${prevName}, T.${nextName}, ${Number(value).toFixed(1)});`
          );
        }
      }

      return lines.join("\n");
    }

    function openPairwiseGapDebugPanel() {
      ensurePairwiseGapDebugPanelStyle();

      const existing = document.querySelector(".notion-pdf-gap-debug-panel");

      if (existing) {
        existing.remove();
      }

      const panel = document.createElement("div");
      panel.className = "notion-pdf-gap-debug-panel";

      const header = document.createElement("div");
      header.className = "notion-pdf-gap-debug-header";

      const titleBox = document.createElement("div");
      titleBox.innerHTML = `
        <strong>Pairwise Gap Matrix</strong>
        <span>row = previous block, column = next block, unit = pt</span>
      `;

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "닫기";
      closeButton.addEventListener("click", () => panel.remove());

      header.append(titleBox, closeButton);

      const actions = document.createElement("div");
      actions.className = "notion-pdf-gap-debug-actions";

      const copyAllButton = document.createElement("button");
      copyAllButton.type = "button";
      copyAllButton.textContent = "전체 setPairwiseGap 복사";

      const copyChangedButton = document.createElement("button");
      copyChangedButton.type = "button";
      copyChangedButton.textContent = "변경값만 복사";

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.textContent = "localStorage 저장";

      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.textContent = "기본값으로 리셋";

      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.textContent = "Preview 다시 계산";

      actions.append(copyAllButton, copyChangedButton, saveButton, resetButton, refreshButton);

      const tableWrap = document.createElement("div");
      tableWrap.className = "notion-pdf-gap-debug-table-wrap";

      const table = document.createElement("table");
      table.className = "notion-pdf-gap-debug-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      const corner = document.createElement("th");
      corner.textContent = "prev \\ next";
      headRow.append(corner);

      for (let col = 0; col < blockTypeCount; col += 1) {
        const th = document.createElement("th");
        th.textContent = getBlockTypeName(col);
        headRow.append(th);
      }

      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");

      function markInputState(input, row, col) {
        input.dataset.changed = String(!isDefaultPairwiseGapCell(row, col));
      }

      function renderBody() {
        tbody.textContent = "";

        for (let row = 0; row < blockTypeCount; row += 1) {
          const tr = document.createElement("tr");

          const rowLabel = document.createElement("td");
          rowLabel.className = "notion-pdf-gap-debug-row-label";
          rowLabel.textContent = getBlockTypeName(row);
          tr.append(rowLabel);

          for (let col = 0; col < blockTypeCount; col += 1) {
            const td = document.createElement("td");

            const input = document.createElement("input");
            input.className = "notion-pdf-gap-debug-cell-input";
            input.type = "number";
            input.step = "0.1";
            input.min = "0";
            input.value = Number(pairwiseGapPt[row][col]).toFixed(1);
            input.title = `${getBlockTypeName(row)} -> ${getBlockTypeName(col)}`;

            markInputState(input, row, col);

            input.addEventListener("input", () => {
              const value = Number(input.value);

              if (!Number.isFinite(value)) {
                return;
              }

              pairwiseGapPt[row][col] = value;
              markInputState(input, row, col);
              savePairwiseGapOverrides();
            });

            td.append(input);
            tr.append(td);
          }

          tbody.append(tr);
        }
      }

      renderBody();

      table.append(tbody);
      tableWrap.append(table);

      const footer = document.createElement("div");
      footer.className = "notion-pdf-gap-debug-footer";

      const hint = document.createElement("div");
      hint.textContent =
        "값을 수정하면 다음 preview 계산부터 반영됩니다. 현재 열린 preview는 다시 계산해야 합니다.";

      const toast = document.createElement("div");
      toast.className = "notion-pdf-gap-debug-toast";
      toast.textContent = "";

      footer.append(hint, toast);

      function showToast(message) {
        toast.textContent = message;
        window.setTimeout(() => {
          if (toast.textContent === message) {
            toast.textContent = "";
          }
        }, 1800);
      }

      copyAllButton.addEventListener("click", async () => {
        const ok = await copyTextToClipboard(getPairwiseGapSetCode());
        showToast(ok ? "전체 코드 복사됨" : "복사 실패");
      });

      copyChangedButton.addEventListener("click", async () => {
        const ok = await copyTextToClipboard(getPairwiseGapChangedSetCode());
        showToast(ok ? "변경값 코드 복사됨" : "복사 실패");
      });

      saveButton.addEventListener("click", () => {
        savePairwiseGapOverrides();
        showToast("저장됨");
      });

      resetButton.addEventListener("click", () => {
        restoreDefaultPairwiseGapMatrix();
        clearPairwiseGapOverrides();
        renderBody();
        showToast("기본값으로 리셋됨");
      });

      refreshButton.addEventListener("click", () => {
        savePairwiseGapOverrides();

        if (typeof refreshPreview === "function") {
          refreshPreview();
          showToast("preview 재계산 실행");
        } else {
          showToast("refresh hook 없음. preview를 다시 열어야 함");
        }
      });

      panel.append(header, actions, tableWrap, footer);
      document.body.append(panel);

      return panel;
    }

    return {
      openPairwiseGapDebugPanel,
      getPairwiseGapSetCode,
      getPairwiseGapChangedSetCode
    };
  }
