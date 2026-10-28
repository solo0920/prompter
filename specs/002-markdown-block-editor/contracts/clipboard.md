# Contract: Clipboard

**Version**: 1.0.0 | **Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This contract defines Copy and Paste behavior. Copy must work from a `file://` page, must place
exact Markdown on the clipboard, and, when the document contains images, must also provide a
single-paste rich representation containing both text and images.

## Copy Flavors

For a non-empty document, Copy writes:

| MIME type | Content | When |
|-----------|---------|------|
| `text/plain` | The canonical Markdown string, byte-for-byte identical to Save. | Always. |
| `text/html` | A rendered HTML representation of the same document, with local images embedded as data URLs. | Only when the document contains an image block or a Markdown image line. |

Optional, only when the browser supports it: `text/markdown` with the same canonical Markdown.
The app must not fail if this flavor is unsupported.

Text-only documents deliberately omit `text/html` so destinations that prefer rich HTML fall
back to `text/plain` and keep the Markdown Markers (`#`, `##`, `-`, `1.`, `>` and so on) visible.
Adding an HTML flavor would turn those Markers into formatted headings and lists, and a later
paste or model input would lose the Markdown structure.

### text/plain exactness

- Produced by the single serializer in `markdown-output.md`.
- Includes markers, relative image references, blank-line separation, and the final-newline
  decision.
- No title, metadata, HTML, or UI annotations are added.
- If images cannot be included, `text/plain` is still the complete Markdown; the user is told
  that images were omitted from the rich flavor.
- Copy is disabled when the document has no content.
- Copying a text-only document must not add a `text/html` flavor, even if that document has
  headings or lists.

### text/html rendering

- Uses the same renderer as Preview for headings, bullet lists, ordered lists, blockquotes,
  images, plain text, and fenced code.
- All text is HTML-escaped. Raw HTML in user content is never rendered.
- Local image assets are converted to data URLs with their original MIME type:
  `data:image/png;base64,...`, `image/jpeg`, `image/gif`, or `image/webp`.
- Missing images render their escaped alternative text plus a visually distinct
  "image unavailable" label. Remote image URLs are never included as `<img src>` and never
  fetched; they render a placeholder with the alt text.
- Ordered lists preserve literal values with `<li value="N">`; the app does not renumber user
  content.
- The HTML is self-contained: no external stylesheets, fonts, scripts, or network URLs.
- Inline styles are minimal and limited to layout/readability; destinations may discard them.

## Copy Sequence

1. Verify the document is non-empty. Otherwise the button is disabled and Copy does nothing.
2. Build the canonical Markdown.
3. Collect local image assets:
   - IndexedDB Blob -> `FileReader.readAsDataURL`.
   - localStorage data URL -> use as-is.
   - Missing asset -> placeholder and add to `omittedImages`.
4. Build `ClipboardPayload` with `markdown`, `html`, `hasImages`, and `omittedImages`.
5. If `navigator.clipboard.write` and `ClipboardItem` are available:
   - Create a `ClipboardItem` with a `text/plain` Blob, plus a `text/html` Blob only when
     `hasImages` is true.
   - Await the write from a user gesture.
   - On success, toast "已複製 Markdown 與圖片" or "已複製 Markdown（圖片已省略）".
   - On failure, continue to the fallback.
6. Fallback: create a hidden contenteditable element containing the rich HTML when `hasImages`
   is true, or the Markdown text otherwise; select its contents; install a one-time `copy`
   listener that sets `text/plain`, plus `text/html` only when `hasImages` is true, on
   `event.clipboardData`; call `document.execCommand('copy')`. Remove the element and listener
   afterwards.
   - On success, same feedback as above.
   - On failure, continue to manual copy.
7. Manual copy dialog:
   - Show the exact Markdown in a readonly textarea, selected by default where possible.
   - Provide a "選取全部" action and instructions to copy manually.
   - State that images cannot be included in the manual path.
8. Never report success if neither clipboard path wrote the Markdown.

## Paste Sequence

Listen for `paste` on the canvas and on the active text editor.

1. Read `event.clipboardData` or `window.clipboardData`.
2. Collect text (`text/plain`) and image files from `clipboardData.items` (or
   `clipboardData.files` when items are unavailable).
3. Validate all images as one all-or-nothing batch. If any image is unsupported, corrupt, or
   cannot be stored, reject the whole paste, create no blocks or assets, and report the offending
   file. The document and active edit remain unchanged.
4. If the event target is a text block in edit mode:
   - Insert the validated image files directly below that block.
   - Do not end edit mode or move focus out of the text input.
   - Ignore clipboard text in this case to avoid interrupting the edit.
5. Otherwise (canvas focused):
   - Split text into lines. Non-empty lines become text blocks at the insertion point, in order.
   - Create image blocks from the validated image files.
   - Place text blocks before image blocks in reading order.
   - Place the group below the selected block, or below the last block when nothing is selected.
   - Shift lower overlapping blocks down only as needed to preserve the resulting order.
6. Pasting uses the `paste` event and therefore does not require a clipboard-read permission.
7. Pasting when a modal dialog is open is ignored.

## Capability Detection

| Capability | Detection | Behavior |
|------------|-----------|----------|
| Async clipboard write | `navigator.clipboard && navigator.clipboard.write && window.ClipboardItem` | Preferred. Must be called in a user gesture. |
| Clipboard item support | `ClipboardItem.supports` when available; otherwise attempt text/plain, plus text/html when images are present | Optional flavors are skipped if unsupported. |
| ExecCommand fallback | `document.queryCommandSupported('copy')` or a try/catch call | Used when async write fails. |
| Paste event | `ClipboardEvent` / `clipboardData` | Primary paste path. |
| Clipboard read | Not required | Never used for normal paste. |

## Failure Modes

| Failure | Required behavior |
|---------|-------------------|
| Async clipboard unavailable | Use execCommand fallback. |
| Async write denied/not allowed | Use execCommand fallback. |
| execCommand returns false or throws | Open manual-copy dialog with exact Markdown. |
| Image data URL too large | Omit images from rich HTML, copy text, warn. |
| Image missing/unreadable | Placeholder in rich HTML, copy text, warn. |
| Destination strips images | Text is still present; app cannot control destination behavior. |
| Unsupported pasted image | Reject the whole paste with a clear message; no blocks or assets are kept. |
| Mixed paste storage failure | Do not create partial blocks or assets; report and leave the document unchanged. |

## Destination Expectations

- **Plain-text destinations** receive 100% of the Markdown via `text/plain`.
- **Rich-text destinations** receiving a text-only copy fall back to `text/plain`, so the
  Markdown Markers remain visible and the structure can be pasted onward as Markdown.
- **Rich-text destinations** receiving a document with images get the `text/html` flavor and,
  when they support HTML data-URL images, formatted text and images in one paste.
- Some destinations (for example certain web editors) sanitize data-URL images. The app must
  report that images were omitted and must not claim universal compatibility.
- Verification must cover at least two rich-text destinations available on the test machine and
  at least one plain-text destination. A local `tests/browser/paste-target.html` contenteditable
  can confirm the clipboard flavors without relying on a third-party app.

## Security

- Escape all text before inserting into HTML.
- Never render user-supplied raw HTML.
- Never include remote image URLs in the rich clipboard; only local data URLs or placeholders.
- Do not read the clipboard in the background; paste is user-initiated.
- Clean up hidden DOM nodes, event listeners, and object URLs after copy.

## Non-goals

- Copying files as attachments.
- Copying an HTML fragment that references local file paths.
- Reading images from the clipboard without a paste event.
- Preserving destination-specific formatting beyond standard HTML.
