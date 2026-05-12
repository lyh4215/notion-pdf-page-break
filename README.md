# Notion PDF Preview

Chrome Extension MVP for previewing estimated A4 PDF page breaks before exporting a Notion page.

Source files live under `src/`. Vite builds the loadable Chrome extension into `dist/`.

```text
src/
  manifest.json
  content/
    index.js                 # content script entry
    previewEngine.js         # Notion PDF preview estimation/runtime
    config/layoutConstants.js
    config/listConstants.js
    config/mediaConstants.js
    config/pageMetadataConstants.js
    config/scale.js
    debug/pairwiseGapDebugPanel.js
    debug/registerPairwiseGapDebug.js
    gaps/blockTypes.js
    gaps/pairwiseGaps.js
    measurement/renderedMeasurements.js
    media/mediaElements.js
    media/mediaMeasurements.js
    messaging/previewMessages.js
    messaging/registerContentMessages.js
    notion/bodyWidthStatus.js
    notion/contentBlocks.js
    rendering/styledTextRuns.js
    utils/buttonText.js
    utils/clipboard.js
    utils/domRects.js
    utils/units.js
  popup/
    popup.html
    popup.js
    popup.css
```

The extension does not control Notion's export UI. It reads the visible Notion document, estimates how many A4 portrait pages the content will occupy at a user-entered scale percent, and draws page-end guide lines over the current page.

## MVP Scope

- Scale percent input: `11` to `199`
- Default scale: `100`
- Page size: A4 portrait
- Preview method: overlay guide lines on the current Notion page
- Shows estimated page count
- Labels page boundaries as `Page 1 end`, `Page 2 end`, and so on

## Install Locally

```sh
npm install
npm run build
```

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this repository's `dist` folder.
5. Open a Notion page and click the extension icon.

During development, run `npm run dev` to rebuild the extension whenever source files change.

## How It Estimates

The content script finds the Notion page content, reads visible Notion blocks, estimates each block's PDF layout height, and compares the accumulated height with an A4 content area using internal default margins. The entered scale changes both the virtual PDF layout width and effective content height per page:

```text
layout width = A4 body width / (scale percent / 100)
effective page height = A4 body height / (scale percent / 100)
```

This is intentionally an approximation. The goal is to help place manual Notion line breaks before using Notion's own Export to PDF flow with the same scale value.
