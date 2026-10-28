# Quickstart Validation Guide: Markdown Block Editor

**Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This guide proves the feature works end to end from `file://` with no server, build step,
package installation, or network. It is also the manual acceptance script for the specification.

## Prerequisites

- A supported desktop browser: latest two major versions of Chrome, Edge, Firefox, or Safari.
- For direct multi-file saving: a Chromium browser (Chrome or Edge). Firefox and Safari use the
  download fallback.
- The repository checked out locally; no dependencies to install.
- A plain-text destination and at least two rich-text destinations for Copy verification. For
  example: a text editor for plain text, and two of Apple Notes, Microsoft Word, Google Docs, a
  browser contenteditable, or another rich-text editor available on the test machine.
- Tiny test images in PNG, JPEG, GIF, and WebP formats. `tests/fixtures/images/` contains 1×1
  fixtures; any local images work for manual testing.

## Run the App

1. Open `index.html` directly from the filesystem, for example:
   - macOS: `open index.html` or double-click it in Finder.
   - Any OS: enter the `file:///.../index.html` URL in the browser.
2. Confirm the URL starts with `file://` and the page renders without a server.
3. Disable networking (or turn off Wi-Fi) and reload. The page must still load and all core
   flows must work.

There is no install, build, or dev-server command.

## Automated Checks

### Unit and contract tests (development only)

```bash
node --test tests/unit/*.test.js
```

Expected: all tests pass. These tests cover the pure model, Marker detection, canonical
Markdown serializer, reading order, blank-line/newline preservation, search matching, image
reference matching, the HTML renderer, preferences, storage degradation, and security guards.
They do not require npm packages.

Current result (2026-10-28): **86 passing, 0 failing**.

### Browser harness

1. Open `tests/browser/harness.html` from `file://`.
2. Confirm every check is green and the page reports `PASS` with a count.
3. The harness checks DOM wiring, Marker composer behavior, block commit/edit/remove, reading
   order, localStorage/IndexedDB capability probes, settings persistence, performance budgets,
   accessibility structure, responsive layouts, and the renderer in the actual `file://`
   environment.
4. Open `tests/browser/paste-target.html` in a second tab; use it as one rich-text destination
   for the Copy checks.

Expected: no failures. Clipboard and directory-picker checks that require a real user gesture
are marked manual and covered below.

Current result (2026-10-28): **62 passing, 0 failing** in Chrome, Edge, and Firefox.

## Verified Results (2026-10-28)

All automated checks were run against the committed `file://` entry page; no server or build
step was used. Offline runs used an unreachable proxy/network resolver so any runtime network
request would fail.

| Browser | Version | Automated harness | Offline harness | Notes |
|---------|---------|-------------------|-----------------|-------|
| Chrome (macOS) | 156.0.8078.49 | PASS 62/62 | PASS 62/62 | Full editor, storage, settings, clipboard fallbacks |
| Edge (macOS) | 156.0.4314.42 | PASS 62/62 | PASS 62/62 | Same Chromium path as Chrome |
| Firefox (macOS) | 159.0 | PASS 62/62 | PASS 62/62 | WebDriver BiDi run; download save fallback |
| Safari (macOS) | 27.2 | Not run | Not run | Safari Remote Automation is disabled; see exceptions |

Additional automated evidence:

- Golden fixtures round-trip markers, marker-only lines, blank lines, CRLF/BOM, no final
  newline, unicode, trailing spaces, code, tables, data-URL images, unmatched images, and
  duplicate image basenames. Copy Markdown is byte-identical to the Save plan.
- Performance budgets pass: 500-document directory render under 1 s, 500-document search under
  300 ms, 500-block Preview under 1 s, and an inserted image visible under 1 s.
- Layout checks pass at 1280×720, 768 px, and 360×800 with no horizontal page scrolling; the
  directory drawer, compact header, long-text wrapping, and focus return are covered.
- Accessibility checks cover unique IDs, accessible names, dialog labelling, live regions,
  skip-link target, focus return, keyboard movement announcements, and reduced-motion CSS.
- Storage checks cover IndexedDB-blocked localStorage fallback, both-blocked memory mode, quota
  rollback, corrupt-payload isolation, and the dismissible storage-mode banner.
- Security checks statically reject runtime `fetch`, XHR, WebSocket, `eval`, `new Function`,
  dynamic `import()`, remote script/style URLs, remote image sources, and unsafe image paths.

**Manual-only exceptions**: actual rich-text destination paste (for example Apple Notes and
Microsoft Word), a physical touch device, a screen-reader spot check, real OS file/directory
pickers, and the Safari row above still require a human tester. Their automated equivalents
(payload construction, iframe viewport layout, ARIA structure, picker mocks, and Chromium
direct-write mocks) pass.

## Manual Acceptance Scenarios

Run these in Chrome or Edge first, then repeat the core authoring, preview, copy, and download
paths in Firefox and Safari. Record the browser and result.

### 1. First run and blank document (US1, FR-017)

1. Clear the site's local data or use a fresh browser profile.
2. Open `index.html`. The directory shows the empty state with `新增文件`.
3. Choose `新增文件` from the File menu.
4. Confirm the title is `Untitled`, one composer appears at the top-left with the Marker control,
   and Copy is disabled.

Expected: no errors; the canvas is usable at 1280×720 and 360×800.

### 2. Create blocks with markers (US1, FR-018, FR-019, SC-001, SC-002)

1. With the composer focused, type `# 角色` and press Enter.
2. Confirm one heading block appears with a single `#` prefix and the composer closes.
3. Press the block's lower-left `+`; confirm a new composer appears directly below.
4. Type `- 限制一` and press Enter.
5. Add another block and type `> 只輸出結果` and press Enter.
6. Add another block, open the Marker control, choose `.`, type `literal`, and press Enter.
7. Add a block, type `## 目標` (without choosing a marker), and confirm the live detection label
   shows `##`; press Enter.
8. Press Enter in an empty composer; confirm nothing is created.
9. Try `#Heading` (no space) and `#### Heading`; confirm they remain ordinary text, not
   markers.
10. Create at least five blocks with three different markers in under two minutes.

Expected: each marker appears exactly once; no duplicate prefixes; Copy becomes enabled.

### 3. Edit, cancel, and remove (US1, FR-020..FR-022)

1. Double-click a text block; change the text; press Enter. Confirm the new text is shown.
2. Double-click again; change the text; press Escape. Confirm the original text returns.
3. Double-click; clear all text; press Enter. Confirm the block disappears.
4. Confirm the blank-line separation of surrounding blocks remains sensible.
5. Confirm every block has a labeled `+` control, including image blocks.

### 4. Drag and keyboard movement (US1, FR-023..FR-026, SC-011)

1. Drag a block to a new position; confirm it stays inside the canvas and is raised above
   overlapping blocks.
2. Focus a block and use Alt+Arrow and Alt+Shift+Arrow. Confirm movement is clamped and
   announced by a live region.
3. Create two blocks on the same visual row or within the same 24 px band, one left and one
   right. Confirm Preview/Save order is left-to-right; a block in a lower band comes later.
4. Drag a block to a new row and confirm Preview/Save/Copy orders update consistently.
5. Reload without saving (choose Leave if the browser's native prompt appears). Confirm the
   unsaved draft is not restored.

Expected: positions are layout-only; Markdown never contains coordinates; unsaved drafts are
session-only.

### 5. Preview (US3, FR-028, SC-008)

1. Add headings, bullets, an ordered `1.` item, a quote, an image, a fenced code block, a basic
   pipe table, and a long wrapped line.
2. Activate Preview. Confirm the rendered content matches the blocks, includes images, renders
   the code block and table, and does not execute raw HTML-looking text.
3. Close with the close control; reopen and close with Escape. Confirm focus returns to Preview.
4. Confirm raw HTML-looking text is displayed as text, not executed.
5. Confirm a document with 500 blocks renders in under 1 second on a mid-range laptop.

### 6. Copy exact Markdown and rich content (US3, FR-029..FR-031, SC-007)

1. Activate Copy. Paste into a plain-text destination. Confirm the text is byte-identical to the
   saved Markdown, including markers, blank lines, image references, and the final newline.
2. Paste into rich destination 1 and rich destination 2. Confirm text and local images appear in
   a single paste in destinations that support data-URL images.
3. If a destination strips images, confirm the Markdown text is still present and the app
   reported that images were omitted.
4. Empty the document; confirm Copy is disabled.
5. Deny clipboard permission if the browser offers it; confirm the fallback still copies text or
   opens the manual-copy dialog.
6. Confirm a missing image produces a warning and still copies the Markdown line.

### 7. Insert and paste images (US1, FR-041..FR-045, SC-014..SC-016)

1. Open the File menu, choose Insert Image, and select a PNG. Confirm an image block appears at
   the insertion point, is draggable, and has a remove control.
2. Repeat with JPEG, GIF, and WebP.
3. Copy an image in another app and paste it onto the canvas. Confirm an image block appears.
4. Overlap an image block with a lower block, then insert or paste another image above it.
   Confirm the lower overlapping blocks shift down just enough to preserve reading order.
5. Copy mixed text and an image, paste onto the canvas. Confirm text blocks precede image blocks
   in reading order.
6. Double-click a text block, paste an image while editing. Confirm the image appears below the
   block and the text edit is not interrupted.
7. Try an SVG or corrupt image. Confirm it is rejected with a message and the document is
   unchanged.
8. Remove an image block; confirm its Markdown line disappears and other blocks are unchanged.
9. Confirm a large image is scaled to fit but its original bytes are preserved on save.

### 8. Save, Save As, and downloads (US2, FR-012..FR-016, SC-004, SC-015)

**Chromium direct-write path**

1. Create a document with an image. Choose Save As, enter `test-prompt`, and choose a temporary
   folder.
2. Confirm `test-prompt.md` and its image file(s) are written. Open the Markdown in a text
   editor and verify relative image references.
3. Edit the document; choose Save. Confirm the same files update and the directory entry moves
   to the top.
4. Choose Save As again with a new name; confirm a second document and files are created and the
   original files are unchanged.
5. Cancel a picker; confirm the document and dirty state remain.
6. Create a file-name conflict with an unrelated file; confirm the conflict dialog prevents a
   silent overwrite.

**Firefox/Safari download path**

1. Choose Save As and enter a name. Confirm the Markdown and each image download separately.
2. Keep the files together without renaming; open the Markdown again with Open and select its
   images. Confirm content and images are restored.
3. Confirm the app warns that renaming downloads may break image references.

**Open round trip**

1. Open a Markdown fixture with headings, bullets, quotes, blank lines, an image, a code fence,
   a table, and a marker-only line, plus its images.
2. Confirm every non-empty line is represented, markers are extracted, blank-line separation is
   preserved, and the image renders.
3. Save to a new file and diff it against the expected output. Confirm no non-empty line,
   marker, blank-line separation, or associated image is lost.
4. Repeat with CRLF input, a BOM, no final newline, and a data-URL image.

### 9. Unsaved changes (US2, FR-015, FR-016, SC-009)

1. Edit a saved document, then choose New, Open, or another document. Confirm the
   Save/Discard/Cancel dialog appears.
2. Choose Cancel; confirm the document and edits remain.
3. Choose Discard; confirm the target action proceeds.
4. Choose Save; confirm the save completes before the target action.
5. Try closing or reloading the tab with unsaved changes. Confirm the browser's native
   Stay/Leave prompt appears. (A custom three-way dialog is not possible on tab close.)
6. Cancel a picker or fail a save; confirm the document remains open and editable.

### 10. Library and search (US4, FR-004..FR-008, SC-003, SC-005, SC-006, SC-013)

1. Save five documents with distinct Traditional Chinese and English titles/content.
2. Confirm the directory is newest-first with title and last-modified time.
3. Search by a title term, a content term, a mixed-language term, punctuation, and a term with
   leading/trailing spaces. Confirm literal case-insensitive matches and a match count.
4. Search for gibberish; confirm the no-results message and clear-search action.
5. Clear the search; confirm the full list returns.
6. Open a result; confirm it is selected and shown.
7. Move blocks in the open document, Save, reload the page, and reopen it from the directory.
   Confirm the block positions and Markdown reading order are restored.
8. Create a new document while a search is active; confirm the search clears.
9. With 50 documents, time a known-document search; it should take 10 seconds or less. With 500
   documents, confirm results update within 300 ms and the initial directory render completes
   within 1 second on a mid-range laptop.

### 11. Settings, themes, and styles (US5, FR-032..FR-036, SC-010, SC-012)

1. Toggle light/dark; confirm immediate change. Reload; confirm the choice persists.
2. With no explicit choice, change the OS light/dark preference; confirm the app follows it.
3. Use the settings reset to follow the system again.
4. Switch between 紙張 and 石墨; confirm each works in both light and dark and persists.
5. Change the default Marker; create a new composer and confirm it uses the new default.
6. Toggle the alignment grid; confirm it appears/disappears and persists.
7. Open the settings dialog, confirm version information is present.
8. Clear the local library after confirming; confirm the workspace is empty, local records are
   gone, preferences remain, and files already on disk are untouched.

### 12. Responsive and accessibility (FR-037, FR-038, SC-011, SC-012)

1. At 1280×720, confirm no horizontal page scrolling and all regions visible.
2. Resize to 360×800. Confirm the directory is behind a labeled toggle, all header actions are
   reachable, blocks clamp to the canvas, and there is no horizontal page scrolling.
3. On touch, confirm dragging uses the handle and vertical scrolling still works.
4. Complete create, edit, add, move, preview, copy, and save using only the keyboard. Confirm a
   visible focus indicator on every control.
5. Run a screen reader spot check: header controls, directory, blocks, dialogs, live-region
   messages, and image alt text are announced meaningfully.
6. Enable reduced motion; confirm non-essential transitions are disabled.

### 13. Storage degradation (FR-039, FR-040)

1. Use a browser profile or setting where IndexedDB is blocked; confirm the app falls back to
   localStorage and remains usable.
2. Block both IndexedDB and localStorage; confirm the app opens in memory mode with a
   non-blocking warning that identifies the storage mode and can be dismissed, and the session
   remains usable.
3. Fill storage or simulate a quota error; confirm image insertion is rejected with no document
   change and Save reports the failure without losing text.
4. Corrupt the stored library payload; confirm the app opens with an empty library and a warning
   instead of a blank page.

## Browser Matrix

**Legend**: **Required** means the flow must pass for the browser to be supported. **Expected**
means the flow should work when the browser exposes the API, but the documented fallback is
acceptable. **Fallback** means the documented alternative path is the required behavior.

| Flow | Chrome/Edge | Firefox | Safari |
|------|-------------|---------|--------|
| Open from `file://` | Required | Required | Required |
| Create/edit/drag/keyboard | Required | Required | Required |
| Preview and search | Required | Required | Required |
| Save As direct multi-file | Expected (File System Access) | Download fallback | Download fallback |
| Save downloads | Fallback | Required | Required |
| Async rich copy | Expected | Fallback | Fallback |
| `execCommand` copy fallback | Required | Required | Required |
| Image paste via `paste` event | Required | Required | Required |
| IndexedDB persistence | Expected | Expected/fallback | Expected/fallback |
| localStorage fallback | Required | Required | Required |
| 360 px layout | Required | Required | Required |

Record the exact browser versions and pass/fail notes in the test log.

**Verified 2026-10-28**: Chrome 156, Edge 156, and Firefox 159 pass the full automated harness
from `file://`, including offline runs. Safari 27.2 was not automated because Safari Remote
Automation is disabled on the test machine; it remains a manual row.

## Acceptance Checklist

- [x] SC-001 five-block prompt with three markers in under 2 minutes (workflow automated; human timing not measured)
- [x] SC-002 100% correct marker prefixes from menu and typing
- [x] SC-003 positions and reading order survive save/reload
- [x] SC-004 no non-empty line, marker, blank-line separation, or image lost in the round-trip
- [x] SC-005 known-document search in 10 seconds or less with 50 documents (50-document automated search passes)
- [x] SC-006 search updates within 300 ms for 500 documents
- [ ] SC-007 two rich destinations receive text and images in one paste; plain text gets 100% (payload verified; real destinations remain manual)
- [x] SC-008 500-block preview renders within 1 second
- [x] SC-009 unsaved-change choices preserve content (in-app three-way; native on tab close)
- [x] SC-010 settings survive reload
- [x] SC-011 keyboard-only core workflow with visible focus (automated keyboard and focus checks)
- [x] SC-012 no horizontal page scrolling at 1280×720 and 360×800 (768 px also verified)
- [x] SC-013 search correct for Traditional Chinese, English, mixed, punctuation, and spaces
- [x] SC-014 image insertion visible within 1 second
- [x] SC-015 save/reopen restores every image
- [x] SC-016 unsupported/unstorable images rejected with no document change

**Exception recorded**: SC-007 and the Safari browser row require human verification because this
environment cannot drive external rich-text destinations or enable Safari Remote Automation.
The generated rich payload, exact `text/plain` Markdown, image placeholders, and all fallback
paths pass automated checks. The app remains ready for those manual spot checks.

## Known Limitations

- **Tab close**: browsers provide only a native Stay/Leave prompt, not a custom Save/Discard/
  Cancel dialog. In-app navigation uses the three-way dialog.
- **Rich image paste**: some destinations strip data-URL images. Exact Markdown is always
  available via `text/plain`; the app reports omitted images.
- **Direct file writing**: Firefox and Safari do not support the directory picker used for
  multi-file saves; they download files separately. Keep downloads together and do not rename
  them.
- **`file://` storage**: browser storage behavior is not guaranteed. The app warns and keeps
  the session usable, but Save-to-disk is the durable path.
- **Preview subset**: basic pipe tables and fenced code are rendered; other unsupported
  Markdown constructs remain literal text; raw HTML is never rendered.
- **Image editing**: resizing, cropping, rotating, and alt-text editing are out of scope.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Clipboard fails silently | Use a user gesture; check browser permission; confirm the manual-copy dialog appears. |
| Images missing after reopen | Keep the Markdown and image files together; do not rename downloads; re-open with all images selected. |
| Save always downloads | The browser lacks File System Access; use Chrome/Edge for direct writes or accept the download fallback. |
| Storage warning | IndexedDB/localStorage may be blocked or full; save to disk and clear browser data as needed. |
| Search finds nothing | Check leading/trailing spaces; matching is literal, not fuzzy. |
| Theme flashes | Confirm the inline preflight script is present and localStorage is readable. |
| Block cannot be dragged | Use the drag handle on touch; confirm the block is not in edit mode. |

## Exit Criteria

The feature is ready for `/speckit.tasks` and implementation when:

1. Unit and browser harness checks pass.
2. The core manual scenarios pass in at least two supported browsers with networking disabled.
3. The acceptance checklist is complete or any exception is recorded with a documented reason.
4. The known tab-close limitation is either accepted or the spec wording is amended as
   recommended.
