# Quickstart Validation Guide: Markdown Block Editor

**Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This guide proves the feature works end to end from `file://` with no server, build step,
package installation, or network. It is also the manual acceptance script for the specification.

## Prerequisites

- Chrome is the required acceptance browser (latest two major versions). Firefox 159 and Edge
  156 are supplementary headless checks. **Safari testing is paused at the user's request; do
  not launch Safari during routine verification.** Historical Safari results remain below.
- For direct multi-file saving: Chrome. Firefox and Safari use the download fallback.
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

Local CSS and JavaScript links carry a `?v=...` version query. Bump it after editing those files
so a normal reload from `file://` cannot keep using a stale cached copy.

## Automated Checks

### Unit and contract tests (development only)

```bash
node --test tests/unit/*.test.js
```

Expected: all tests pass. These tests cover the pure model, Marker detection and rank ordering,
canonical Markdown serializer, reading order, blank-line/newline preservation, search matching,
image reference matching, the HTML renderer, preferences, storage degradation, composer
Markdown splitting, and security guards. They do not require npm packages.

Current result (2026-10-31): **108 passing, 0 failing**.

### Browser harness

1. Open `tests/browser/harness.html` from `file://`.
2. Confirm every check is green and the page reports `PASS` with a count.
3. The harness checks DOM wiring, Marker composer behavior, collapsible sections, block
   commit/edit/remove, reading order, localStorage/IndexedDB capability probes, settings
   persistence, performance budgets, accessibility structure, responsive layouts, KaTeX math
   rendering, and the renderer in the actual `file://` environment.
4. Open `tests/browser/paste-target.html` in a second tab; use it as one rich-text destination
   for the Copy checks.

Expected: no failures. Clipboard and directory-picker checks that require a real user gesture
are marked manual and covered below.

Current result (2026-11-02): Chrome **118 passing, 0 failing** (required gate), online and
offline. The latest checks cover layer-focus `+` insertion, composer Marker inheritance and
focused-composer layer selection, empty layers that remain selectable, single-click editing of
text blocks with full text selection, composer click focus, Up/Down navigation through the
composer in layer focus, and the full editor-area preview expand control.
Firefox 159 and Edge 156 last passed the prior 112-check suite as supplementary checks. Safari
27.2 previously reported 108/108 through a local HTTP origin; Safari testing is now paused and is
not part of the current test loop. The suite includes the start screen and ten-file recent list
added in feature 004.

## Verified Results (2026-11-02)

All Chrome and Firefox automated checks were run against the committed `file://` entry page; no
server or build step was used. Offline runs disabled browser networking (CDP network emulation in
Chrome and an unreachable proxy profile in Firefox) so any runtime network request would fail.
Historical Safari automated checks used the same harness over `127.0.0.1`; a direct `file://`
smoke test covered app startup, numbered blocks, KaTeX, IndexedDB, and zero remote resource
requests. Safari is not part of the current test loop.

| Browser | Version | Automated harness | Offline harness | Notes |
|---------|---------|-------------------|-----------------|-------|
| Chrome (macOS) | 156.0.8078.49 | PASS 118/118 | PASS 118/118 | Required gate; full editor, storage, settings, clipboard fallbacks, layer focus, empty layers, click-to-edit, focused-composer layers, full-width preview |
| Firefox (macOS) | 159.0 | PASS 112/112 | PASS 112/112 | Supplementary check; last run before the layer-focus add check |
| Edge (macOS) | 156.0.4314.50 | PASS 112/112 | PASS 112/112 | Supplementary Chromium check; last run before the layer-focus add check |
| Safari (macOS) | 27.2 | PASS 108/108 (HTTP) | Manual file:// smoke | Historical result; Safari testing is paused and not part of the current loop |

Mobile preview behavior was additionally verified at 360×800 in Chrome, Firefox, and Edge:
preview starts closed; opening it hides the document tabs and editor canvas, shows only the
preview tab, and fills the workspace with the preview; closing restores the editor and focus.

The start screen from feature 004 was verified separately: after a refresh it shows up to ten
recent files on the left, New document/Open directory/Open file actions on the right, and no
auto-opened document. On narrow viewports the actions stack above the recent list.

Chrome is the required release gate. Firefox and Edge are supplementary compatibility checks.
Safari is not part of the current test loop; its historical results are retained above. If Safari
verification is explicitly requested later, it requires a visible GUI session or a separate
macOS VM because Safari has no supported headless mode.

Additional automated evidence:

- Golden fixtures round-trip markers, marker-only lines, blank lines, CRLF/BOM, no final
  newline, unicode, trailing spaces, code, tables, data-URL images, unmatched images, and
  duplicate image basenames. Copy Markdown is byte-identical to the Save plan.
- Performance budgets pass: 500-document directory render under 1 s, 500-document search under
  300 ms, 500-block Preview under 1 s, and an inserted image visible under 1 s.
- Layout checks pass at 1280×720, 768 px, and 360×800 with no horizontal page scrolling; the
  default-collapsed directory, expanded sidebar/drawer, body rail, compact header, long-text
  wrapping, and focus return are covered.
- Accessibility checks cover unique IDs, accessible names, dialog labelling, live regions,
  skip-link target, focus return, keyboard movement announcements, and reduced-motion CSS.
- Math checks cover inline and display delimiters, headings, lists, quotes, tables, multi-line
  display math, common AMS environments, fenced-code exclusion, currency/escaped-dollar
  literals, and untrusted commands or surrounding raw HTML.
- Input checks cover multi-line composer and block editing, Shift+Enter line breaks, Enter
  commit, auto-growing width and height, full-text selection when editing starts, and Up/Down
  commit-and-continue navigation while editing.
- Preview checks cover live composer and block-editor drafts, draft Marker changes, and
  reverting drafts on dismiss or cancel.
- Storage checks cover IndexedDB-blocked localStorage fallback, both-blocked memory mode, quota
  rollback, corrupt-payload isolation, and the dismissible storage-mode banner.
- Security checks statically reject runtime `fetch`, XHR, WebSocket, `eval`, `new Function`,
  dynamic `import()`, remote script/style URLs, remote image sources, and unsafe image paths.

**Manual-only exceptions**: actual rich-text destination paste (for example Apple Notes and
Microsoft Word), a physical touch device, a screen-reader spot check, and real OS
file/directory pickers still require a human tester. Their automated equivalents (payload
construction, iframe viewport layout, ARIA structure, and picker mocks) pass.

**Manual status (2026-10-30)**: automated verification is complete, but the manual exceptions
above, SC-007, human timing for SC-001, and the full Chrome/Firefox walkthrough remain
outstanding. Safari is not part of the current test loop. Do not mark the specification fully
accepted until those checks are recorded.

## Manual Acceptance Scenarios

Run these in Chrome first as the required acceptance browser. Optionally repeat the core
authoring, preview, copy, and download paths in Firefox and Edge. Do not launch Safari unless
the user explicitly asks for a Safari verification session.

### 1. First run and blank document (US1, FR-017)

1. Clear the site's local data or use a fresh browser profile.
2. Open `index.html`. The directory starts collapsed; use the `文件目錄` button in the far-left
   body rail to open it and see the empty state with `新增文件`.
3. Choose `New Document` from the File menu.
4. Confirm a tab appears above the editor with the editable title `Untitled`, one composer
   appears at the top-left with the Marker control, and Copy is disabled.

Expected: no errors; the canvas is usable at 1280×720 and 360×800.

### 2. Create blocks with markers (US1, FR-018, FR-019, FR-046, FR-047, SC-001, SC-002)

1. With the composer focused, type `# 角色` and press Enter.
2. Confirm one heading block appears with a single `#` prefix and the composer closes.
3. Confirm the `#` prefix is visible without hovering the block, and a block with no Marker shows
   a blank prefix without `×` or text.
4. Hover the right half of the block and press its lower-right `+`; confirm a new composer
   appears directly below.
5. Type `- 限制一` and press Enter.
6. Add another block and type `> 只輸出結果` and press Enter.
7. Add another block, hover the Marker control, and confirm a two-row panel appears above the
   active title block: `× 1. > .` on top and `- # ## ###` below. Confirm the panel centers on
   the Marker when there is room, and that it shifts to the left page edge instead of being
   clipped when the Marker is near the left side. Move the pointer into the panel and pause;
   confirm it stays open. Move the pointer away and confirm it closes immediately without a
   delay; reopen it, choose `.`, type `literal`, and press Enter.
8. Add a block, type `## 目標` (without choosing a marker), and confirm the live detection label
   shows `##`; press Enter.
9. Press Enter in an empty composer; confirm nothing is created.
10. Try `#Heading` (no space) and `#### Heading`; confirm they remain ordinary text, not
   markers.
11. Create at least five blocks with three different markers in under two minutes.
12. Cmd-click several blocks; confirm they keep bright orange outlines. Hover the left Marker
    area of one selected block, choose `##`, and confirm every selected text block changes while
    the selection remains orange.
13. With two or more blocks selected, drag one of them to a new position. Confirm the whole
    selected group moves together as one contiguous group, keeps its relative order and orange
    selection, and that Escape restores the pre-drag order and selection.
14. Drag on empty canvas around several blocks. Confirm the orange selection rectangle appears,
    every intersected block becomes selected, and the group can then be dragged together.
    Cmd-drag on empty canvas must add to the existing selection; click empty canvas to clear it.
15. Move the pointer to a block's left border or padding, not directly over the Marker symbol.
    Confirm the Marker flyout opens and the cursor is not the grab cursor. Move to the right
    side and confirm the grab cursor and drag handle behavior remain available there.

Expected: each marker appears exactly once; no duplicate prefixes; Copy becomes enabled; the
selected group moves as one unit; the marquee selects the covered blocks; the left border hover
opens the Marker flyout without showing a grab cursor.

### 2a. Multi-line input and auto-growing inputs (FR-017, FR-021, FR-022)

1. With a composer focused, type a long line. Confirm the input grows wider up to its maximum
   and then grows taller as the line wraps, keeping the full text visible.
2. Press Shift+Enter, type a second line, and confirm the composer stays open with both lines
   and no block is created.
3. Press Enter. Confirm one block contains both lines, grows to show them, and Preview renders
   them as consecutive Markdown lines.
4. Double-click the block, add another line with Shift+Enter, confirm the editor grows, then
   press Enter to commit.
5. Paste the same multi-line Markdown sample into an existing block's editor and press Enter.
   Confirm the edited block is replaced by the parsed sequence in place, the surrounding blank
   lines stay correct, the last new block is selected, and the trailing composer stays below it.
6. Create a multi-line fenced code block or display formula in one composer using Shift+Enter;
   confirm Preview renders it as one code block or formula rather than separate lines.
7. Paste a multi-line Markdown sample such as `# 標題`, a prose paragraph, `- 項目一`,
   `- 項目二`, `1. 第一項`, `2. 第二項`, and `3. 第三項` on separate lines, then press Enter.
   Confirm each marked line becomes its own block in source order, each numbered item keeps its
   original number, the prose stays grouped, blank lines between groups survive in the saved
   Markdown, the next composer opens below the last block, and a fenced code sample is not split.
8. Open a saved document that already has blocks. Confirm a focused composer appears below the
   last block, inherits that block's Marker, and remains available after Escape.

### 2b. Collapse sections by Marker rank (FR-052)

1. Create `# 第一章`, `## 第一節`, `### 細項`, `- 項目`, `> 引言`, plain content, and `# 第二章`
   in that order. Confirm chevrons appear only on blocks that have lower-ranked content below
   them, that each chevron sits outside its card immediately to the left, and that `# 第二章`
   has no chevron. Confirm the chevrons follow each block's indentation column.
2. Activate the chevron on `## 第一節`. Confirm its chevron points right, the `###`, `-`, `>`, and
   plain blocks disappear from the canvas, and `# 第一章` and `# 第二章` stay visible.
3. Confirm Preview, Copy, and Save still contain the hidden blocks, and Markdown never includes a
   collapse marker.
4. Collapse `# 第一章`; confirm the already collapsed `## 第一節` also hides. Expand `# 第一章`
   and confirm `## 第一節` returns still collapsed; expand it and confirm all its content returns.
5. With `## 第一節` collapsed, press Down from its chevron and confirm focus skips the hidden
   blocks. Open a composer inside the section and confirm it moves below the section when the
   section collapses.
6. Drag the collapsed `## 第一節`, or use its drag handle's Up/Down keys, and confirm its hidden
   descendants move with it and remain collapsed.

### 2c. Outline indentation (FR-053)

1. Create `# 第一章`, its paragraph, `## 第一節`, its bullet, a quote, a dot item,
   `### 細項`, its paragraph, and `# 第二章`. Confirm the columns step right as
   `0, 1, 1, 3, 5, 6, 2, 3, 0, 1` 20 px units, using the fixed Marker levels.
2. Create `# first`, `- snd`, `### sed`, `## thrd`, `>`, and `1.`. Confirm the columns are
   `0, 3, 2, 1, 5, 4`; each Marker always uses its own fixed level regardless of order.
3. Confirm Save, Preview, and Copy still output the same Markdown order and text, with no
   indentation characters added.
4. Open the composer under `### 細項` and confirm it aligns with that section's content column.
5. At 360 px width, confirm indented blocks and composers stay inside the canvas without
   horizontal page scrolling.

### 2d. Layer focus toolbar (FR-054)

1. Confirm a second rail button with a `#` icon sits below `文件目錄`. Activate it and confirm a
   vertical toolbar lists `#`, `##`, `###`, `-`, `1.`, `>`, `.` plus `全部收合` and `全部展開`.
2. With a document containing headings, bullets, and quotes, choose `>`. Confirm the first quote
   opens in edit mode with all text selected, that quote's child items are already collapsed,
   other layers turn gray and cannot be clicked or focused, and the composer is hidden.
3. Press Down/Up repeatedly. Confirm editing moves only between quote blocks with first/last
   wrap, and every destination opens in edit mode with all text selected.
4. Choose `#` and confirm its child items are automatically collapsed while the `#` headers stay
   visible. Press `全部展開` and confirm their content returns dimmed. Choose `#` again, close
   the toolbar, or switch tabs and confirm all blocks return to normal interaction without any
   Markdown change.

### 3. Edit, cancel, and remove (US1, FR-020..FR-022, FR-048)

1. Double-click a text block; change the text; press Shift+Enter and type a second line;
   confirm the editor stays open and grows; press Enter. Confirm both lines are kept.
2. Double-click again; change the text; press Escape. Confirm the original text returns.
3. Double-click; clear all text; press Enter. Confirm the block disappears.
4. Confirm the blank-line separation of surrounding blocks remains sensible.
5. Confirm every block has a labeled `+` control and a delete control above it, including image
   blocks; the delete control appears on right-side hover.
6. Cmd-click two or more blocks and press Delete (or the macOS Delete key). Confirm every
   selected block disappears, the remaining blocks close their gaps, and the selection clears.
7. Double-click a block and press Delete inside the editor; confirm it edits text instead of
   removing the block. Repeat in the composer.
8. Hover the right side of a single block and activate the delete control above `+`. Confirm only
   that block is removed. Press Cmd+Z outside the input and confirm the block returns in its
   original position; repeat undo to walk back further document changes. Press Cmd+Shift+Z and
   confirm the deletion is redone; make a new edit and confirm redo is no longer available.
9. With focus inside the composer or block editor, press Cmd+Z and Cmd+Shift+Z and confirm text
   undo and redo remain native instead of removing blocks or changing document structure.

### 4. Drag and keyboard movement (US1, FR-023..FR-026, FR-049, SC-011)

1. Drag a block past the center of a later or earlier block; confirm the intervening blocks
   shift one position and the dragged block takes the target position with no overlap.
2. Focus a block and use Alt+Arrow. Confirm it moves one position earlier or later, stays
   focused, and the live region announces its new position.
3. Create several blocks and confirm Preview/Save order follows the visible top-to-bottom
   sequence with no gaps.
4. Drag a block beyond the last block and confirm it appends while the intervening blocks shift
   toward its former position.
5. With a composer open after the last block, move that block and confirm the composer stays in
   its own sequence slot instead of following it.
6. Drag the composer by its handle to another slot; confirm blocks shift to make room and the
   Markdown order remains unchanged. Then drag a block across the composer and confirm the
   composer shifts one position.
7. With a block root or the canvas focused, press Up/Down repeatedly. Confirm the previous/next
   sequence item is selected, including the composer at its own slot, and that Up on the first
   item wraps to the last while Down on the last wraps to the first. Start editing a block, change
   its text, and press Up/Down again: confirm the current text is committed and the adjacent item
   is selected, with a text destination entering edit mode and all text selected.
8. Focus a block and press Tab repeatedly. Confirm Tab into the text area starts edit mode
   directly with all text selected, the next Tab reaches the title/Marker and opens its menu, the
   next reaches the drag handle, then the remaining controls and block root, wrapping inside the
   block without moving to another block, composer, header, or left rail. Confirm Enter/F2 also
   starts edit mode with all text selected when the text area already has focus. Focus the
   composer input and confirm Tab cycles only its marker, input, and handle. Shift+Tab must wrap
   in the opposite direction. With focus on the canvas, confirm Tab uses the selected block if
   one exists.
9. Tab to a block's title area and confirm the Marker menu opens automatically. Press Down to
   enter the options, use Up/Down to move between the two rows and Left/Right within a row, and
   Enter/Space to apply the focused option. Confirm Space/Enter on the title area still opens
   and focuses the current option.
10. Tab to a block's right drag handle and press Up/Down. Confirm the block moves one position
    earlier/later, focus stays on the handle, and the move is announced. From the title area,
    action controls, or block root, press Up/Down to change items and confirm focus stays in the
    same zone on the new item. From a text area, confirm Up/Down commit the current edit and
    continue to the adjacent item; a text destination must open in edit mode with all text
    selected, and repeated Up/Down must keep moving without requiring Escape.
11. Focus the composer input, type some text, and press Up/Down. Confirm the item before/after
    the composer slot is selected, wrapping at the ends, while the composer and its text remain.
    Repeat with the composer title control focused. Then focus the composer drag handle and press
    Up/Down; confirm the composer itself moves one sequence slot, focus stays on the handle, and
    the block order is unchanged.
12. Reload without saving (choose Leave if the browser's native prompt appears). Confirm the
    unsaved draft is not restored.

Expected: positions are layout-only; Markdown never contains coordinates; unsaved drafts are
session-only; arrow, Tab, and marker-menu keyboard navigation stays inside the editor.

### 5. Live preview and document tabs (US2, US3, FR-028, FR-050, FR-051, SC-008)

1. Add headings, bullets, an ordered `1.` item, a quote, an image, a fenced code block, a basic
   pipe table, a long wrapped line, inline math such as `$a^2+b^2=c^2$`, and display math such
   as `$$\int_0^1 x^2 dx$$`.
2. At 1280×720, confirm the live preview pane is already open on the right by default while the
   editor canvas remains visible on the left; the active document name and file icon appear as a
   tab-styled label aligned with the preview pane's left boundary and immediately left of the
   preview icon, with an `×` that closes preview. Confirm images render, the code block and table
   render, math renders with the bundled KaTeX fonts, and raw HTML-looking text is not executed.
   Close and reopen preview with the icon; confirm the closed state shows only the preview icon.
   At 360×800, confirm preview starts closed; activate the icon and confirm the document tabs and
   editor canvas disappear, only the preview tab remains, and the full-page preview starts below
   the tab bar; activate it again and confirm the editor, its tabs, and focus return.
3. With the composer focused, type text but do not press Enter. Confirm the preview shows that
   draft at the composer slot; clear the text and confirm the draft disappears.
4. Double-click a block and change its text without committing. Confirm the preview follows the
   draft. Press Escape and confirm the preview returns to the committed text.
5. Edit a block and commit it. Confirm the right preview updates without closing or hiding the
   editor.
6. Choose File > New Document twice. Confirm each document opens in a new tab above the editor, each tab
   has a small `×`, and the active tab title is editable.
7. Switch tabs. Confirm blocks, dirty state, composer, and selection are restored per tab, and
   the preview updates to the active document.
8. Close a clean tab with `×`; confirm the neighboring tab becomes active. Make a tab dirty and
   close it; confirm Save, Discard, or Cancel appears.
9. Close the last tab. Confirm the empty workspace returns and the preview pane closes.
10. Close preview once with the filename tab's `×` and once with the preview icon; confirm the
    editor is unchanged, the preview closes, and the filename label disappears so only the preview
    icon remains.
11. Confirm a document with 500 blocks renders in under 1 second on a mid-range laptop.

### 6. Copy exact Markdown and rich content (US3, FR-029..FR-031, SC-007)

1. Create a text-only document with headings and lists. Activate Copy and paste into a
   plain-text destination. Confirm the text is byte-identical to the saved Markdown, including
   markers, blank lines, image references, and the final newline.
2. Paste the same text-only copy into rich destination 1 and rich destination 2. Confirm the
   Markdown Markers (`#`, `##`, `-`) remain visible instead of being converted to formatted
   headings and lists.
3. Add a local image, activate Copy, and paste into rich destination 1 and rich destination 2.
   Confirm text and local images appear in a single paste in destinations that support data-URL
   images.
4. If a destination strips images, confirm the Markdown text is still present and the app
   reported that images were omitted.
5. Empty the document; confirm Copy is disabled.
6. Deny clipboard permission if the browser offers it; confirm the fallback still copies text or
   opens the manual-copy dialog.
7. Confirm a missing image produces a warning and still copies the Markdown line.

### 7. Insert and paste images (US1, FR-041..FR-045, SC-014..SC-016)

1. Open the File menu, choose Insert Image, and select a PNG. Confirm an image block appears at
   the insertion point, is draggable, and has a remove control.
2. Repeat with JPEG, GIF, and WebP.
3. Copy an image in another app and paste it onto the canvas. Confirm an image block appears.
4. Insert or paste another image above a lower block. Confirm the lower blocks shift down and
   no blocks overlap.
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

**Firefox download path**

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

1. Edit a saved document, then choose New, Open, or another document. Confirm a new tab opens
   or an existing tab activates without a prompt, and the dirty tab remains open with a dirty
   marker.
2. Return to the dirty tab and confirm its edits are preserved.
3. Click its tab `×`. Confirm the Save/Discard/Cancel dialog appears.
4. Choose Cancel; confirm the tab and edits remain.
5. Click `×` again and choose Discard; confirm the tab closes and a neighboring tab activates.
   Repeat with Save and confirm the save completes before the tab closes.
6. With any dirty tab open, reload the browser page. Confirm the native Stay/Leave prompt
   appears.
7. Cancel a picker or fail a save; confirm the document remains open and editable.

### 10. Library and search (US4, FR-004..FR-008, SC-003, SC-005, SC-006, SC-013)

1. Save five documents with distinct Traditional Chinese and English titles/content.
2. Open `文件目錄` in the body rail; confirm the directory is newest-first with one compact row
   per file showing its file name and last-modified time.
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
3. Open Settings and check `Follow system theme`; confirm the app follows the OS theme.
   Uncheck it and confirm the current effective theme becomes an explicit light or dark choice.
4. With a fresh profile, confirm 簡約留白 (`apple`) is the default. Switch among all ten
   styles; confirm each works in both light and dark and persists.
5. With a blank document, change the default Marker and confirm the initial composer uses it.
   Commit a block with `##` and confirm the next composer inherits `##`; use `+` on a
   differently marked block and confirm it inherits that block's Marker.
6. Open the settings dialog, confirm version information is present.
7. Clear the local library after confirming; confirm the workspace is empty, local records are
   gone, preferences remain, and files already on disk are untouched.

### 12. Responsive and accessibility (FR-037, FR-038, SC-011, SC-012)

1. At 1280×720, confirm no horizontal page scrolling, the title is in the tab bar above the
   editor, the eye preview and Copy precede Style on the right, and the `文件目錄` rail opens
   the directory as a left column.
2. Resize to 360×800. Confirm the directory remains collapsed in the far-left body rail, all
   header actions are reachable, blocks stay within the sequence column, and there is no
   horizontal page scrolling. Confirm preview starts closed; activate preview and confirm the
   document tabs and editor canvas disappear, only the preview tab remains, and the preview fills
   the workspace below the tab bar without horizontal scrolling; activate it again and confirm
   the editor and its tabs return.
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

**Legend**: **Required** means the flow must pass because Chrome is the release gate.
**Verified** means the flow passed as a supplementary compatibility check and is not
release-blocking. **Expected** means the flow should work when the browser exposes the API,
but the documented fallback is acceptable. **Fallback** means the documented alternative path
is the required behavior.

> Safari is not part of the current test loop; the Safari column below is historical.

| Flow | Chrome (required) | Firefox (supplementary) | Safari (historical) |
|------|-------------------|-------------------------|---------------------|
| Open from `file://` | Required | Verified | Verified (direct smoke) |
| Create/edit/drag/keyboard | Required | Verified | Verified (HTTP harness) |
| Preview and search | Required | Verified | Verified (HTTP harness) |
| Save As direct multi-file | Required (File System Access) | Download fallback | Download fallback |
| Save downloads | Fallback | Verified | Manual |
| Async rich copy | Expected | Fallback | Expected/fallback |
| `execCommand` copy fallback | Required | Verified | Manual/fallback |
| Image paste via `paste` event | Required | Verified | Verified (HTTP harness) |
| IndexedDB persistence | Expected/fallback | Verified/fallback | Verified (direct smoke) |
| localStorage fallback | Required | Verified | Verified/fallback |
| 360 px layout | Required | Verified | Verified (HTTP harness) |

Record the exact Chrome version and pass/fail notes in the test log.

**Verified 2026-11-02**: Chrome 156 passes the full 118-check automated harness from `file://`,
online and offline, and is the required release gate; the latest checks cover layer-focus `+`
insertion with the focused Marker, focused-composer layer selection, empty layers that remain
selectable with the composer Marker applied, single-click editing of text blocks, composer click
focus, Up/Down navigation through the composer in layer focus, and the full editor-area preview
expand control. Firefox 159 and Edge 156 last passed the prior 112-check suite as supplementary
checks. Safari 27.2 historically passed the HTTP harness 108/108 and a direct `file://` startup
smoke; Safari testing is paused and is not part of the current loop.

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

**Exception recorded**: SC-007 requires human verification because this environment cannot
drive external rich-text destinations. The generated rich payload, exact `text/plain`
Markdown, text-only `text/plain`-only flavor, image placeholders, and all fallback paths pass
automated checks. The app remains ready for those manual spot checks.

## Known Limitations

- **Browser tab close**: browsers provide only a native Stay/Leave prompt, not a custom
  Save/Discard/Cancel dialog. In-app document-tab close uses the three-way dialog.
- **Rich image paste**: some destinations strip data-URL images. Exact Markdown is always
  available via `text/plain`; the app reports omitted images.
- **Direct file writing**: Firefox does not support the directory picker used for multi-file
  saves; it downloads files separately. Keep downloads together and do not rename them.
- **`file://` storage**: browser storage behavior is not guaranteed. The app warns and keeps
  the session usable, but Save-to-disk is the durable path.
- **Preview subset**: basic pipe tables, fenced code, and KaTeX math are rendered; other
  unsupported Markdown constructs remain literal text; raw HTML is never rendered.
- **Math rendering**: KaTeX 0.19.1 is bundled locally, so math works offline. Supported
  delimiters are `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`; common AMS environments also
  render. Invalid or unsupported LaTeX shows KaTeX's inline error instead of breaking Preview.
  Rich HTML Copy uses MathML-only math so pasted formulas do not require the Preview stylesheet.
- **Image editing**: resizing, cropping, rotating, and alt-text editing are out of scope.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Clipboard fails silently | Use a user gesture; check browser permission; confirm the manual-copy dialog appears. |
| Images missing after reopen | Keep the Markdown and image files together; do not rename downloads; re-open with all images selected. |
| Save always downloads | The browser lacks File System Access; use Chrome for direct writes or accept the download fallback. |
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
