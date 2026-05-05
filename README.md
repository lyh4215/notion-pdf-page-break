# Notion PDF Preview

Chrome Extension MVP for previewing estimated A4 PDF page breaks before exporting a Notion page.

The extension does not control Notion's export UI. It reads the visible Notion document, estimates how many A4 portrait pages the content will occupy at a user-entered scale percent, and draws page-end guide lines over the current page.

## MVP Scope

- Scale percent input: `11` to `199`
- Default scale: `100`
- Page size: A4 portrait
- Preview method: overlay guide lines on the current Notion page
- Shows estimated page count
- Labels page boundaries as `Page 1 end`, `Page 2 end`, and so on

## Install Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this repository folder.
5. Open a Notion page and click the extension icon.

## How It Estimates

The content script finds the Notion page content, measures its visible block height, and compares that with an A4 content area using an internal default margin. The entered scale changes the effective content height per PDF page:

```text
effective page height = A4 body height / (scale percent / 100)
```

This is intentionally an approximation. The goal is to help place manual Notion line breaks before using Notion's own Export to PDF flow with the same scale value.
