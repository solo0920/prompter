# Feature Specification: Markdown Block Editor

**Feature Branch**: `002-markdown-block-editor`

**Created**: 2026-10-28

**Status**: Implemented — automated verification complete; manual acceptance checks pending

**Input**: User description: "首頁header具備主要功能 最左方有file按鈕，可以作開啟檔案儲存及另存新檔等功能，中間有preview及複製按鈕可將md及相關檔案放到剪貼簿，剪貼簿支援文字和圖片混合複製，右側有風格選項及light dark 按鈕及齒輪設定按鈕
body 左方有目錄系統可以查詢之前使用的提示詞文件系統
body 中間是左方提示詞文件點選後會顯示內容的部份，主要以md格式為主，差別在每一行為一個單獨可以拖動移動位置的文字浮框，可依需求拖到指定的位置放置
當一開始為空白提示詞文件時，預設出現一個輸入框，輸入文字按enter即會成為一個新項目，輸入框左方有按鈕，點選後可出現選項決定採用如#, -, .等標題號，也可以由輸入框內直接輸入後，會在前方呈現標題屬性是那一種
每個新項目的左下方有個小"+"號，按下後就會在其下方插入一個新輸入框，輸入完後就成為一個項目
每個項目點擊二下即可edit，enter後就退出編輯狀態"

## Clarifications

### Session 2026-10-28

- Q: Which positioning model should block dragging use? → A: Free 2D canvas; Markdown order follows 24 px row bands from top to bottom, then left-to-right within each band.
- Q: How should images enter a document? → A: Support both file-picker insertion and clipboard paste; image content is stored locally with the document.
- Q: How should images be saved with a document? → A: Save the Markdown file with relative image references together with the associated image files.
- Q: How should unsaved changes be handled when the browser tab is closed or reloaded? → A: In-app navigation uses a Save/Discard/Cancel dialog; tab close and reload use the browser's native leave confirmation because custom unload prompts are not permitted.

## Prompt Contract Impact & Verification

- **Inputs**: User-authored Markdown text and images; an opened `.md` file with optional related
  image files; and images pasted from the clipboard.
- **Prompt contract sections affected**: None. Prompter acts only as an authoring and export
  surface. It serializes user-authored Markdown verbatim and does not generate, transform, or
  inject the standardized prompt contract sections (role, objective, context, constraints,
  output format, examples). Future generators or templates must add and version the contract.
- **`file://` verification**: Open `index.html` directly from disk with no server, build step,
  installation, or network; confirm the URL starts with `file://`; then follow
  [`quickstart.md`](./quickstart.md) scenarios 1–13 with networking disabled. The minimum check
  is: create a blank document, add/edit/drag blocks, insert and paste images, preview, copy,
  save and reopen, search, change settings, and confirm no network requests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author prompts as draggable Markdown blocks (Priority: P1)

As a prompt author, I want to build a prompt as a set of individually draggable Markdown
lines and image blocks so that I can arrange ideas spatially while still producing a clean
Markdown document.

**Why this priority**: The block-based authoring experience is the defining capability of
the homepage. Without it, the workspace is only a conventional text editor.

**Independent Test**: From the File menu, choose New to open a blank document; create several
text blocks with different Markers, insert an image from a file, paste an image, move blocks to
new positions, and edit one block; confirm the content, images, positions, and generated
Markdown reading order are retained in the current session. Separately reload without saving
and confirm the unsaved draft is not restored.

**Acceptance Scenarios**:

1. **Given** a blank document, **When** the document opens, **Then** one empty input box is
   shown in the editing area with the Marker control on its left.
2. **Given** an empty input box, **When** the user types text and presses Enter, **Then** a
   new block is created containing that text and the input box becomes the new block.
   Shift+Enter inserts a line break and keeps the input open.
3. **Given** the input box, **When** the user opens the Marker control and selects a Marker,
   **Then** the selected Marker is displayed in front of the block text and included in the
   Markdown output.
4. **Given** the input box, **When** the user types a recognized Marker followed by a space,
   **Then** the detected Marker is shown live in front of the text, and on Enter it is stored
   once as the block Marker rather than duplicated in the text.
5. **Given** an existing block, **When** the user activates its "+" control, **Then** a new
   input box is inserted directly below that block, and typing text followed by Enter creates
   a new block at that position.
6. **Given** an existing block, **When** the user double-clicks it, **Then** the block enters
   edit mode; pressing Enter commits the edit and exits edit mode, pressing Shift+Enter inserts
   a line break, and pressing Escape cancels the edit.
7. **Given** two or more blocks, **When** the user drags a block to a new position, **Then**
   the block moves within the canvas, the position is retained with the document, and the
   Markdown reading order is updated according to the new position.
8. **Given** a block whose text is cleared during editing, **When** editing ends, **Then**
   the empty block is removed from the document.
9. **Given** an open document, **When** the user chooses Insert Image and selects a supported
   image file, **Then** an image block appears at the insertion point, is stored locally with
   the document, and can be dragged like a text block.
10. **Given** the editor canvas is focused and the clipboard contains an image, **When** the
    user pastes, **Then** an image block is inserted; if the clipboard also contains text, the
    text becomes block content immediately before the image in reading order.
11. **Given** an image block, **When** the user activates its remove control, **Then** the
    image is removed from the canvas and from the Markdown output.
12. **Given** two or more selected blocks, **When** the user drags any selected block, **Then**
    the whole selection moves together as one contiguous group, its relative order is
    preserved, and the group stays selected after the drop.
13. **Given** an empty area of the canvas, **When** the user drags a selection rectangle over
    several blocks, **Then** every text or image block inside the rectangle is selected as a
    group, and the selection remains after release.
14. **Given** one or more selected blocks, **When** the user presses Delete (or the macOS
    Delete/Backspace key), **Then** every selected block is removed, the remaining sequence
    closes its gaps, and the document is marked as changed. Delete while typing in the composer
    or a block editor must edit text instead of removing blocks.
15. **Given** focus is inside the editor, **When** the user presses Up/Down, **Then** the
    previous/next sequence item is selected—including the composer at its own slot—and the
    selection wraps between the first and last items. Tab and Shift+Tab must cycle only through
    the current item's controls, including a text block's text area, and wrap within it; with
    focus on the canvas they use the selected block if one exists. Tabbing or pressing Up/Down
    into the text area starts editing and selects the whole block text; Enter/F2 on the focused
    text area also starts editing with the whole text selected. While a block is being edited,
    plain Up/Down still take priority: they commit the current edit and continue into the
    adjacent item, with a text destination opening directly in edit mode. Tabbing to a title
    control opens the Marker menu for arrow-key selection, and Up/Down on a drag handle moves the
    block one position while keeping focus on that handle.
    Up/Down on the composer title control or input moves to the adjacent item with the same
    first/last wrap; Up/Down on the composer drag handle moves the composer one slot and keeps
    focus on the handle.
16. **Given** the input box contains multiple lines, **When** a non-blank line starts with an
    obvious Markdown Marker (`#`, `##`, `###`, `-`, `1.`, any later `N.` ordered number, `>`,
    `.`) and the user presses Enter, **Then** each such line becomes its own block in source
    order with its Marker stored once, contiguous unmarked lines stay grouped as prose, blank
    lines remain separators, fenced code is never split, and a multi-line input without any such
    Marker remains one block.
17. **Given** a text block followed by blocks of lower rank, **When** the user activates its
    collapse control, **Then** the chevron points right and every following lower-ranked block
    is hidden until the next block of the same or higher rank, while the document content,
    Preview, Save, Copy, and Markdown output remain unchanged.
18. **Given** a collapsed section, **When** the user activates its control again, **Then** its
    descendants reappear and any nested section keeps its own collapsed state.
19. **Given** a collapsed section, **When** the user navigates with Up/Down or moves the
    composer, **Then** hidden blocks are skipped and an open composer is placed after the
    collapsed section rather than inside it.
20. **Given** a collapsed section, **When** the user drags its heading or moves it with the drag
    handle's Up/Down keys, **Then** the hidden descendants move with it as one unit and remain
    hidden until the section is expanded.
21. **Given** any Marker, **Then** it uses its fixed indentation level: `#`=0, `##`=1,
    `###`=2, `-`=3, any `N.` numbered item=4, `>`=5, `.`=6, with content one level below the
    last Marker; the Markdown order and text remain unchanged.
22. **Given** a block, **When** the right side is hovered, **Then** a delete control appears
    above the `+`; activating it removes only that block (and its image asset when applicable),
    without changing other blocks.
23. **Given** a document-changing action just completed, **When** the user presses Cmd/Ctrl+Z
    outside a text input, **Then** the previous content state is restored, including its blocks,
    markers, order, selection, and image assets. Repeated undo walks backward through up to 50
    steps; native text undo remains active inside the composer and block editor.

---

### User Story 2 - Manage Markdown files from the header (Priority: P1)

As a user, I want to create, open, save, and save-as Markdown files from a single File menu
so that my prompt work can live in ordinary files that I control.

**Why this priority**: File ownership and portability are essential. Users must be able to
leave the application and reopen their work without a proprietary export step.

**Independent Test**: Open a Markdown fixture containing headings, bullets, quotes, plain
lines, and an image reference together with its image file; edit one block; choose Save, then
use Save As to create a second document; reopen the saved document and the second document and
confirm the content, Markers, and images are preserved.

**Acceptance Scenarios**:

1. **Given** the homepage is open, **When** the user opens the File menu, **Then** New, Open,
   Save, Save As, and Insert Image are available.
2. **Given** the user chooses New, **When** the action completes, **Then** a blank document
   with the title "Untitled" and one empty input box opens in a new tab, existing tabs remain
   open, and the new document is not added to the directory until it is saved.
3. **Given** a Markdown file and its related images, **When** the user opens them, **Then**
   every non-empty line becomes a block or image block, recognized Markers are extracted,
   blank lines are retained as separators in the saved output, image references are associated
   with the selected files, and the document is added to the directory.
4. **Given** an open document, **When** the user chooses Save, **Then** the document is added
   to or updated in the directory, its Markdown and referenced images are written to the
   current location when direct writing is available, and they are downloaded together when
   it is not.
5. **Given** an open document, **When** the user chooses Save As, **Then** the user is asked
   for a new file name or location, a new document and its image files are created, a new
   directory entry is added, and the original document remains unchanged.
6. **Given** unsaved changes, **When** the user chooses New, Open, another document, or another
   tab, **Then** the current tab stays open with its changes and a new tab opens or activates.
   Closing a dirty tab MUST ask Save, Discard, or Cancel; when the user closes or reloads the
   browser tab, the native leave confirmation appears if any open document is dirty.
7. **Given** a file operation is cancelled, **When** the dialog closes, **Then** the current
   document and its unsaved changes remain intact.
8. **Given** a save operation fails, **When** the failure is reported, **Then** the document
   remains open and editable and no content is lost.

---

### User Story 3 - Preview and copy rich prompt content (Priority: P2)

As a user, I want to preview the rendered Markdown and copy the document, including images,
so that I can verify the result and paste it directly into an AI tool or rich-text editor.

**Why this priority**: Preview and copy are the bridge between authoring and using a prompt.
They deliver value after the core authoring and file workflows exist.

**Independent Test**: Create a document with headings, bullets, and an image, confirm Preview
opens by default on a desktop viewport and starts closed on a mobile viewport, then copy the
document and paste it into a rich-text destination and a plain-text destination. The story is
complete when the preview matches the Markdown and both destinations receive the expected
content.

**Acceptance Scenarios**:

1. **Given** a new or restored document on a viewport wider than 768 px, **When** the workspace
   opens, **Then** a live rendered preview opens on the right side by default while the editor
   canvas remains visible, without requiring the user to activate the preview icon first.
2. **Given** a new or restored document on a viewport 768 px wide or narrower, **When** the
   workspace opens, **Then** the editor is shown and the preview is closed by default. **When**
   the user activates the preview icon, **Then** the editor tabs and canvas are hidden, a
   full-workspace preview replaces them, and only the preview tab remains in the tab bar;
   activating the icon again restores the editor and its tabs.
3. **Given** the preview pane is open, **When** the user edits the document or switches tabs,
   **Then** the preview updates to the active document without hiding the editor.
4. **Given** the preview pane is open, **When** the user activates the preview icon, **Then** the
   pane closes, the editor is unchanged, and focus remains on the toggle.
5. **Given** an open document with content, **When** the user activates Copy, **Then** the
   Markdown source is placed on the clipboard exactly as it would be saved, preserving line
   order, Markers, and line breaks.
6. **Given** a document with opened, inserted, or pasted images, **When** the user copies it,
   **Then** a single paste into a rich-text destination includes both the Markdown text and
   the images.
6. **Given** the destination cannot accept images, **When** the user pastes, **Then** the
   Markdown text is still available and the system explains that images could not be included.
7. **Given** an empty document, **When** the homepage is displayed, **Then** Copy is disabled.

---

### User Story 4 - Find and reopen prompt documents (Priority: P2)

As a returning user, I want to browse and search previously saved prompt documents in the
left-hand directory so that I can quickly reopen and continue working on them.

**Why this priority**: Reuse of saved work is central to the homepage. It becomes valuable as
soon as documents can be saved and reopened.

**Independent Test**: Save several documents with distinct titles and content, move blocks in
one document, search by a title term and a content term, clear the search, and open a result.
Reload the page and reopen the moved document from the directory; the story is complete when
the correct documents are filtered, the selected document is shown in the editor, and its
block positions and Markdown reading order are restored.

**Acceptance Scenarios**:

1. **Given** saved documents, **When** the homepage loads, **Then** the directory lists them
   newest first with title and last-modified date/time.
2. **Given** a search query, **When** the user types, **Then** the directory filters by title
   and content without a page reload, shows the match count, and supports Traditional Chinese
   and English text.
3. **Given** a query with no matches, **When** the query is entered, **Then** a no-results
   message and a clear-search action are shown.
4. **Given** filtered results or a reloaded homepage, **When** the user selects a saved
   document, **Then** it opens in the editor with its saved block positions and Markdown
   reading order, and the selected item is visibly marked.
5. **Given** an empty directory, **When** the homepage loads, **Then** an empty state offers a
   New document action.
6. **Given** an active search, **When** the user creates a new document, **Then** the search
   is cleared so the new document can be seen after it is saved.

---

### User Story 5 - Personalize and configure the workspace (Priority: P3)

As a user, I want to adjust appearance and workspace settings so that the editor fits my
visual preference and working style.

**Why this priority**: Personalization improves comfort and control but is not required for
the core authoring, file, or copy workflows.

**Independent Test**: Change the visual style, switch light/dark mode, set a default Marker,
toggle the alignment grid, reload the page, and confirm every setting is retained. Open the
settings panel and clear the local library after confirming the warning.

**Acceptance Scenarios**:

1. **Given** the homepage is open, **When** the header is displayed, **Then** the status is
   centered and the right side shows Copy, a style selector, a light/dark toggle, and a settings
   button in that order; document titles appear in the tab bar above the editor, with the
   icon-only live-preview toggle at the tab bar's right edge.
2. **Given** the user changes the light/dark mode, **When** the toggle is activated, **Then**
   the interface changes immediately and the choice is retained after reload.
3. **Given** no explicit appearance choice has been made, **When** the page loads, **Then**
   the device light/dark preference is used.
4. **Given** the style selector, **When** it is opened, **Then** at least two visual styles
   are available; selecting one applies immediately, persists, and does not change the
   light/dark mode.
5. **Given** the settings button, **When** it is activated, **Then** a settings panel opens
   with a default Marker choice, an alignment-grid toggle, a clear-local-library action, and
   version information.
6. **Given** the user clears the local library, **When** the action is confirmed, **Then**
   local documents and layouts are removed, workspace preferences remain, and files already
   saved on disk are not deleted.
7. **Given** a 360px-wide viewport, **When** the homepage is displayed, **Then** the sidebar
   is hidden in the far-left body rail, all header actions remain reachable, the preview starts
   closed, and the page does not require horizontal scrolling.

---

### Edge Cases

- When the initial input box is empty and Enter is pressed, no block is created.
- When a block's text is empty and it has no Marker after editing, the block is removed.
- When a Marker is typed without a following space, it is treated as ordinary text until the
  space is entered.
- When a line contains only a Marker and no text, the block is removed when editing ends.
- When a block contains a very long line, the input grows to its maximum width and wraps
  visually, growing taller so the full text remains visible; each explicit line break becomes
  a Markdown line.
- When blocks overlap, the selected block is brought to the front and the reading order stays
  deterministic.
- When two blocks fall within the same 24 px row band, left-to-right `x` order determines
  Markdown order even if their `y` values differ by less than 24 px.
- When a block is dragged toward the edge of the canvas, it remains within the canvas bounds.
- When a referenced image file is missing, the preview shows its alternative text or a
  placeholder, and Copy still produces the Markdown text with a warning about the missing
  image.
- When an inserted or pasted image uses an unsupported format, it is rejected with a clear
  message and the document is unchanged.
- When an image cannot be stored because local storage is full, the insertion fails with a
  message and the document remains unchanged.
- When two images have the same file name, each receives a unique file name in the document
  so that references do not collide.
- When an image is larger than the canvas, it is scaled to fit for display while its original
  content is preserved.
- When an image is pasted while a text block is in edit mode, the image block is inserted
  directly below that text block and the text edit is not interrupted.
- When mixed text-and-image content is pasted onto the canvas, text blocks are created before
  the image blocks in reading order.
- When the file picker is cancelled, the current document is unchanged.
- When direct multi-file writing is unavailable, Save and Save As download the Markdown file
  and each associated image file, and tell the user that the files belong together.
- When writing an associated image fails during Save, the system reports which file failed
  and keeps the document open and editable.
- When two documents share the same title, they remain distinguishable by last-modified time
  and each opens the correct content.
- When local data cannot be read, the homepage opens with an empty library and a warning.
- When local persistence is unavailable or full, the homepage shows a non-blocking warning
  and keeps the current session usable.
- When the device light/dark preference changes and the user has not overridden it, the
  interface follows the new preference.
- When a search term contains punctuation or symbols, the characters are treated literally.
- When a Markdown file contains multiline constructs such as code fences or tables, each line
  remains a block and the preview renders the reconstructed Markdown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The homepage MUST provide a top header, a collapsible left document directory
  with a far-left body rail toggle, a document tab bar, a central editor area, and an optional
  live preview pane on the right side.
- **FR-002**: The header MUST use English control labels and place the File and Edit menus at the
  far left, the document status in the center, and Copy, style selector, light/dark toggle, and
  settings on the right in that order.
  Open document names MUST be shown as tabs above the editor, not as a separate title field in
  the header. The icon-only preview toggle MUST sit at the right edge of that tab bar. While the
  preview pane is open on a viewport wider than 768 px, the active document name and a file icon
  MUST appear immediately to its left as a tab-styled label matching the active document tab,
  with its left edge aligned to the preview pane boundary and an `×` that closes preview; when
  preview is closed, only the preview icon remains. On narrower viewports, the document tabs are
  hidden while preview is open and only the preview tab remains in the tab bar.
- **FR-003**: The File menu MUST provide New Document, Open File, Save, Save As, and Insert
  Image. The Edit menu MUST provide Undo and Redo, display the active platform's keyboard
  shortcuts beside them, and disable an action when no history step is available.
- **FR-004**: The directory MUST start collapsed, be revealed by a labeled toggle at the far
  left of the body at every width, and list saved documents in reverse last-modified order with
  title and last-modified date/time.
- **FR-005**: The directory MUST provide a search field that matches titles and content using
  case-insensitive partial matching, ignores leading and trailing whitespace, and supports
  Traditional Chinese and English.
- **FR-006**: Search results MUST update without a page reload, show the number of matches,
  show a no-results message with a clear-search action, and restore the full list when
  cleared.
- **FR-007**: Selecting a directory item MUST open that document in the editor and visibly
  mark it as selected.
- **FR-008**: The directory MUST show an empty state with a New document action when no
  documents are saved.
- **FR-009**: New MUST open a blank document titled "Untitled" with one empty input box in a
  new tab; existing tabs MUST stay open, and the new document MUST NOT be added to the directory
  until it is saved.
- **FR-010**: Open MUST accept a Markdown file and optional related image files. Each
  non-empty line MUST become a text block, recognized Markers MUST be extracted, blank lines
  MUST be retained as separators in saved output, and Markdown image references MUST become
  image blocks when a matching selected image file or embedded image is available. Unmatched
  image references MUST remain text blocks and be flagged in Preview.
- **FR-011**: Opened documents MUST be arranged in a single column in source order, added to
  the directory, and titled from the file name without its extension.
- **FR-012**: Save MUST persist the document to the directory and write its Markdown, using
  standard image references relative to the Markdown file's location, together with each
  associated image file. When direct writing is unavailable, it MUST download the Markdown
  file and each image file using their document file names and inform the user that the files
  belong together.
- **FR-013**: Save As MUST ask for a new file name or location, create a new Markdown file and
  its associated image files, add a new directory entry, leave the original document
  unchanged, and make the new document the current target.
- **FR-014**: Save and Save As MUST be disabled when no document is open; New and Open MUST
  always be available.
- **FR-015**: New, Open, and switching documents MUST preserve other open tabs without
  prompting. Closing a dirty document tab MUST ask the user to Save, Discard, or Cancel before
  removing it. Closing or reloading the browser page MUST trigger the native leave confirmation
  when any open document is dirty; the last explicit save MUST remain intact.
- **FR-016**: Cancelled file operations MUST leave the current document and its changes
  intact; failed file operations MUST show an error, preserve the content, and leave the
  document editable.
- **FR-017**: A blank document MUST show one multi-line input box with a Marker control on its
  left; typing text and pressing Enter MUST create a block, Shift+Enter MUST insert a line
  break without committing, and pressing Enter with empty text MUST do nothing. When Enter is
  pressed on a multi-line value, every non-blank line that starts with a recognized Marker MUST
  become its own block in source order with the Marker stored once; numbered ordered prefixes
  (`1.`, `2.`, `3.`, and later numbers) MUST each become their own block and keep their original
  number. Contiguous unmarked prose lines MUST stay grouped, blank lines MUST remain separators,
  and fenced code MUST NOT be split. A multi-line value without an obvious Marker, including
  ordinary Shift+Enter prose, MUST remain one block.
- **FR-018**: The Marker control MUST offer None, `#`, `##`, `###`, `-`, `1.`, `>`, and `.`
  options (None is represented by `×` in the flyout), and the selected Marker MUST be displayed
  in front of the block and included once in Markdown output. Block Markers MUST be visible
  without hover; when no Marker is set, the prefix MUST be blank with no `×` or text. Moving the
  pointer anywhere from the block's left border through the Marker prefix MUST open a
  symbol-only two-row panel above the active title block. The panel MUST be horizontally centered
  on the Marker when there is enough space; if centering would cross the left page edge, its left
  edge MUST align with that page edge so the whole menu stays visible and clickable. Clicking or
  pressing Enter/Space MUST also open it for keyboard and touch input. The upper row MUST show
  `×`, `1.`, `>`, `.` and the lower row MUST show `-`, `#`, `##`, `###`. A hover-opened flyout
  MUST remain open while the pointer is over the Marker or the flyout, including while crossing
  the gap between them, and MUST close immediately, with no close timer, once the pointer leaves
  both the Marker and the connecting hover corridor. It MUST also close after choosing an option,
  pressing Escape or Tab, or clicking outside. The left Marker area MUST NOT show a grab cursor;
  the right side of the block retains the drag cursor and drag handle. Choosing an option MUST
  return focus to the composer text input and preserve its caret or selection. Numbered ordered
  markers other than `1.` MUST retain their number when loaded, pasted, or committed; the menu
  MUST treat them as the ordered-list Marker type.
- **FR-019**: When the user types a recognized Marker followed by a space in an input box, the
  Marker MUST be detected live and shown as a prefix; on commit it MUST become the block
  Marker without being duplicated in the block text.
- **FR-020**: Every block MUST expose a "+" control at its lower-right, revealed when the right
  half of the block is hovered; activating it MUST insert a new input box directly below that
  block, and Escape MUST dismiss the inserted input without creating a block.
- **FR-021**: Double-clicking a text block MUST enter edit mode; entering edit mode MUST select
  the block's full text by default. Enter MUST commit and exit edit mode, Shift+Enter MUST insert
  a line break, Escape MUST cancel the edit, and clicking outside MUST commit the edit.
- **FR-022**: A text block MUST hold one or more lines of text. Enter MUST commit rather than
  insert a line break; Shift+Enter MUST insert a line break. The input box MUST grow wider as
  text exceeds its current width, up to its maximum width, and MUST grow taller as content
  wraps so the full text remains visible. A text block whose text is empty after editing MUST
  be removed.
- **FR-023**: Each block MUST be draggable to a new two-dimensional position within the
  canvas, MUST remain within the canvas bounds, and its position MUST persist with the
  document.
- **FR-024**: When blocks overlap, the selected block MUST be shown in front and the reading
  order MUST remain deterministic.
- **FR-025**: Users who cannot drag MUST have a keyboard-accessible way to change a block's
  position or reading order.
- **FR-026**: Block positions MUST be layout-only; Markdown output MUST order blocks by
  24 px row bands (`row = round(y / 24)`), then left-to-right by `x`, then by `seq`, then by
  `id` for exact ties; the same order MUST be used by Save, Preview, and Copy. Each image block
  MUST contribute one Markdown image line using its relative file name and alternative text.
- **FR-027**: New text blocks MUST be placed below the last block in reading order; blocks
  inserted with "+" MUST be placed below their source block; inserted or pasted images MUST be
  placed at the insertion point, below the selected block when one exists and otherwise below
  the last block; lower overlapping blocks MUST shift down by the minimum amount needed to
  preserve the resulting reading order; a new composer MUST inherit the Marker of its source
  text block, or the nearest preceding text block for an image source, falling back to the
  default Marker selected in settings when no text block precedes it; an open composer MUST
  occupy a fixed sequence slot that does not move with its source block when blocks are moved;
  it MUST be draggable by a handle, and a block dragged across it MUST shift it one position
  like any intervening item.
- **FR-028**: Preview MUST render the current document's Markdown in a live pane on the right
  side of the workspace while the editor canvas remains visible, including headings, lists,
  quotes, fenced code, basic pipe tables, images, plain text, and KaTeX math using `$...$`,
  `$$...$$`, `\(...\)`, and `\[...\]` delimiters, with raw HTML-looking text
  escaped, without modifying the document. While the composer or a block editor contains
  uncommitted text, Preview MUST render that draft in place and refresh as the text changes;
  dismissing or canceling the draft MUST restore the committed document. The preview icon at
  the right edge of the tab bar MUST toggle the pane; edits and tab switches MUST refresh it
  without closing it. Preview MUST NOT open a dialog or a new window.
- **FR-029**: Copy MUST place the Markdown source on the clipboard exactly as it would be
  saved, preserving line order, Markers, and line breaks, and MUST show success or failure
  feedback.
- **FR-030**: When the document has opened, inserted, or pasted images, Copy MUST also include
  a rich representation containing the text and images so that one paste into a rich-text
  destination includes both. For a text-only document, Copy MUST provide the Markdown text
  without a rich HTML flavor so Markers are not converted to formatted headings and lists.
- **FR-031**: When images cannot be included, Copy MUST still place the Markdown text on the
  clipboard and MUST explain that images were omitted; Copy MUST be disabled when the
  document is empty.
- **FR-032**: The right side of the header MUST provide a style selector with at least two
  visual styles, a light/dark toggle, and a settings button.
- **FR-033**: The light/dark toggle MUST change the interface immediately, follow the device
  preference until the user makes an explicit choice, and persist that choice. The style
  selection MUST apply immediately, persist, and remain independent of the light/dark setting.
- **FR-034**: The settings button MUST open a panel containing at least a default Marker
  choice, an alignment-grid visibility toggle, a clear-local-library action with confirmation,
  and version information. Settings changes MUST persist.
- **FR-035**: Clearing the local library MUST remove local documents, layouts, and locally
  stored image assets, MUST retain workspace preferences, and MUST NOT delete files already
  saved on disk.
- **FR-036**: Saved documents, layouts, image assets, and preferences MUST remain available
  after a reload in the same browser on the same device.
- **FR-037**: All header, directory, editor, preview, and settings controls MUST be operable by
  keyboard alone, expose accessible names, and show a visible focus indicator.
- **FR-038**: At a 360px-wide viewport, the directory MUST remain collapsed in the far-left
  body rail, all header actions MUST remain reachable, and the page MUST NOT require horizontal
  scrolling.
- **FR-039**: If local persistence is unavailable or full, the system MUST show a non-blocking
  warning in the document directory, identify the active storage mode and reason, offer a
  dismiss action, keep the current session usable, and MUST NOT silently discard unsaved edits.
- **FR-040**: If stored library data cannot be read, the homepage MUST open with an empty
  library and a warning instead of failing to load.
- **FR-041**: Insert Image MUST open a picker for PNG, JPEG, GIF, and WebP images; the chosen
  image MUST become an image block at the insertion point, be stored locally with the
  document, and receive a unique file name used by its Markdown reference.
- **FR-042**: Pasting an image while the canvas is focused MUST create an image block at the
  insertion point. Pasting while a text block is in edit mode MUST insert the image block
  directly below that text block. Mixed text-and-image clipboard content MUST create text
  blocks before image blocks in reading order.
- **FR-043**: Each image block MUST display the image scaled to fit the canvas, preserve the
  original image content, provide a remove control, expose a "+" control, and use the image
  file name as its default alternative text.
- **FR-044**: Removing an image block MUST remove both the block and its Markdown image line
  without changing other blocks.
- **FR-045**: Unsupported image formats and images that cannot be stored because local storage
  is full MUST be rejected with a clear message, and the document MUST remain unchanged.
- **FR-046**: Cmd-click (Ctrl-click on Windows) MUST toggle a block in a multi-selection without
  clearing the other selected blocks, and selected blocks MUST use a bright orange highlight.
  Hovering the Marker control of a selected text block MUST open the symbol flyout; choosing a
  Marker MUST apply it to every selected text block, leave unselected blocks and image blocks
  unchanged, and keep the selection highlighted. Dragging any selected block MUST move the whole
  selection as one contiguous group, preserve the selected blocks' relative reading order, and
  keep the group selected after the drop. Dragging a non-selected block MUST move only that
  block. Canceling or dropping outside the canvas MUST restore the pre-drag sequence and
  selection.
- **FR-047**: Dragging on empty canvas MUST draw a visible selection rectangle and select every
  text or image block it intersects. The rectangle selection MUST replace the current selection,
  except that holding Cmd (Ctrl on Windows) MUST add the intersected blocks to the existing
  selection. Releasing MUST keep the selection; Escape or cancellation MUST restore the
  pre-marquee selection; a plain empty-canvas click MUST clear the selection.
- **FR-048**: With one or more blocks selected, pressing Delete (or Backspace from the macOS
  Delete key) while focus is within the canvas MUST remove every selected block, release unused
  image assets, close sequence gaps, adjust the composer slot, mark the document dirty, clear the
  selection, and focus the canvas or the composer when the document becomes empty. Delete MUST
  be ignored while focus is in the composer, a block editor, or another input.
- **FR-049**: With focus within the editor canvas, Up/Down MUST move through the sequence items
  (blocks plus the composer at its own slot) and wrap from the first item to the last and from
  the last to the first. Tab and Shift+Tab MUST cycle focus only among the controls of the
  current item (the focused block or composer) and wrap within it. Within a text block, the Tab
  order MUST be text area, title/Marker, drag handle, then the remaining action controls and the
  block root. Tab into the text area MUST start editing directly with the full block text
  selected; Enter/F2 on the focused text area MUST also enter edit mode with the full text
  selected. Tab into the title/Marker control MUST open the Marker menu, with Down/Up then
  focusing its options; Space or Enter MUST continue to open the menu with the current option
  focused. When focus is on the canvas, Tab/Shift+Tab MUST use the selected block if one exists,
  otherwise cycle only among editor items; they MUST NOT move to the header or left rail.
  Up/Down that changes the selected item MUST preserve the active focus zone (text, title,
  action, handle, or root) in the destination item when that zone exists; when the destination
  is a text block's text zone, it MUST enter edit mode and select the whole block text. Plain
  Up/Down MUST have priority over caret movement: while a block is in edit mode they MUST commit
  the current edit and continue into the adjacent item, and a text-block destination MUST stay
  in edit mode with all text selected. The Marker menu's Up/Down keys choose an option. Up/Down
  on a block's right drag handle MUST move that block one sequence position earlier or later
  while keeping focus on the handle. Up/Down on the composer title control or text input
  MUST select the adjacent sequence item, wrapping at the ends, while leaving the composer open.
  Up/Down on the composer's right drag handle MUST move the composer one slot earlier or later
  and keep focus on that handle. Tab from a block editor MUST continue to the current block's
  title/Marker control.
- **FR-050**: Open documents MUST be represented as tabs above the editor. Each tab MUST show
  the document title/file name and a close control. File > New and opening a file or saved
  document MUST open or activate a tab while preserving other open tabs and their unsaved state.
  Switching tabs MUST restore each document's blocks, assets, dirty state, composer, selection,
  and file target. Closing a dirty tab MUST offer Save, Discard, or Cancel; closing a clean tab
  MUST remove it and activate a neighboring tab, and closing the last tab MUST return to the
  empty workspace. The active tab's title MUST remain editable.
- **FR-051**: On viewports wider than 768 px, the preview pane MUST open by default when a
  document is created, opened, or restored, and MUST remain open across tab switches and updates.
  On viewports 768 px wide or narrower, it MUST start closed and MUST NOT open automatically;
  activating the preview toggle MUST hide the document tabs and editor canvas, replace the
  editor with a full-workspace preview below the tab bar, and leave only the preview tab visible.
  Activating it again MUST restore the editor, its tabs, and focus to the toggle. It MUST stay
  closed after the user closes it until another document is created or opened on desktop, and
  MUST show the empty state when the active document has no previewable content.
- **FR-052**: A text block with at least one following block of lower rank MUST show a collapse
  control outside its card, immediately to the left of the block and aligned with its top title
  row. The control MUST follow the block's outline indentation rather than consuming title-row
  width. Rank order from highest to lowest MUST be `#`, `##`, `###`, `-`, `1.`, `>`, `.`, then
  unmarked text and image content. Activating the control MUST hide every following lower-ranked
  block until the next block of the same or higher rank; activating it again MUST restore them
  while preserving nested collapse states. Collapse MUST be view-only: hidden blocks MUST remain
  in the document model and in Save, Preview, and Copy output. Hidden blocks MUST be skipped by
  layout and keyboard navigation, an open composer MUST move after the collapsed section, and
  dragging or moving a collapsed section with the keyboard MUST move its hidden descendants as
  one unit. The control MUST expose its expanded state and an accessible label, focus MUST remain
  on it after toggling, and collapse state MUST NOT be written into Markdown.
- **FR-053**: The editor canvas MUST assign a fixed indentation level to each Marker:
  `#` = 0, `##` = 1, `###` = 2, `-` = 3, any numbered ordered prefix (`1.`, `2.`, `3.`, ...) =
  4, `>` = 5, `.` = 6, with unmarked content and images one level below the last Marker and plain
  text documents starting at 0. The level MUST NOT depend on which other Markers happen to
  precede the block, so `###` is always two steps right, `-` always three, numbered items always
  four, `>` always five, and `.` always six. Content beneath a Marker MUST use the next depth.
  Indentation MUST be layout-only: it MUST NOT change block text, Markers, Save, Preview, Copy,
  or Markdown reading order. A composer opened after a block MUST align with that block's level,
  and indented blocks MUST stay within the available canvas width.
- **FR-054**: The left directory rail MUST provide a second button below `文件目錄` that opens a
  vertical layer-focus toolbar listing `#`, `##`, `###`, `-`, `1.`, `>`, `.`, followed by
  `全部收合` and `全部展開` actions. Activating one layer MUST mark every text block with that
  Marker as the active layer, begin editing the first one, and automatically collapse every
  collapsible block of that layer so its child items are hidden while the layer's own headers
  remain visible. Blocks of all other layers MUST be visually de-emphasized, locked, and
  unselectable; image blocks are also de-emphasized. Up/Down MUST then move only among blocks of
  the selected layer, entering edit mode and selecting the full text on each step, with
  first/last wrap. Collapse All MUST collapse every collapsible block of the selected layer and
  Expand All MUST restore them; with no layer selected, the actions apply to every collapsible
  section in the document. Opening the same layer again, closing the toolbar, or switching
  documents MUST exit layer focus and restore normal block interaction. The composer MUST stay
  hidden during layer focus, and layer focus MUST NOT change Markdown content, Save, Preview, or
  Copy output.
- **FR-055**: Every block MUST show a delete control on right-side hover/focus, positioned above
  the `+` control. Activating it MUST remove only that block, and image deletion MUST also release
  its asset when no longer referenced. Outside text inputs, Cmd+Z (macOS) or Ctrl+Z (Windows) MUST
  undo the most recent document-changing action, restoring blocks, markers, ordering, blank
  lines, image assets, selection, and dirty state from the previous content state. Undo MUST cover
  at least insertion, deletion, text edits, Marker changes, and drag/keyboard reordering, retain
  up to 50 steps for the active document, and reset when another document is opened or activated.
  Cmd/Ctrl+Shift+Z outside text inputs MUST redo the most recently undone action, and a new
  document-changing action MUST clear the redo history. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z inside
  the composer or a block editor MUST remain native text undo and redo. View-only changes such
  as selection, collapse, or layer focus MUST NOT consume an undo step.


### Key Entities *(include if feature involves data)*

- **Prompt Document**: A saved prompt with a unique identifier, title, file name, ordered
  text and image blocks, locally stored image assets, creation time, and last-modified time.
- **Block**: A text or image unit within a document. A text block contains one or more lines
  of text, a Marker, a canvas position, and a stacking order. An image block contains an image
  asset, alternative text, a canvas position, and a stacking order.
- **Marker**: The optional line prefix chosen from None, `#`, `##`, `###`, `-`, `1.`, `>`, or
  `.`. Open, pasted, or committed ordered lists may retain later numbers such as `2.` and `3.`. It is displayed with a text block and included once in Markdown output.
- **Image Asset**: An image inserted from a file, pasted from the clipboard, or imported with
  an opened Markdown file. It is stored locally with the document, has a unique file name and
  default alternative text, and is used by Preview, Save, and rich Copy.
- **Workspace Preference**: A per-device setting containing the visual style, light/dark
  choice, default Marker, and alignment-grid visibility.
- **Search Query**: Transient text entered in the directory search field. It filters documents
  and is not stored with the library.
- **Clipboard Payload**: The transient content produced by Copy, containing Markdown text and,
  when available, a rich representation with images.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can create a five-block prompt with at least three different
  Markers in under 2 minutes.
- **SC-002**: All supported Markers produce the correct Markdown prefix in 100% of test cases,
  whether chosen from the Marker control or typed directly.
- **SC-003**: Block positions and Markdown reading order survive save and reload in 100% of
  tested documents.
- **SC-004**: Opening and saving a Markdown file preserves every non-empty line, Marker,
  blank-line separation, and associated image in 100% of the test corpus.
- **SC-005**: With a library of 50 documents, 90% of representative returning users can locate
  a known document using search in 10 seconds or less.
- **SC-006**: Search results update within 300 ms for libraries of up to 500 documents on a
  mid-range laptop.
- **SC-007**: Copying a document with opened, inserted, or pasted images and pasting it into
  at least two supported rich-text destinations includes both text and images in a single
  paste; text-only destinations receive 100% of the Markdown source.
- **SC-008**: Preview renders documents of up to 500 blocks within 1 second on a mid-range
  laptop.
- **SC-009**: 100% of in-app attempts to leave a document with unsaved changes present a Save,
  Discard, or Cancel choice; closing or reloading the tab triggers the browser's native leave
  confirmation, and no content is lost in storage-failure tests.
- **SC-010**: 100% of appearance and workspace settings persist after a page reload.
- **SC-011**: A keyboard-only user can complete the create, edit, add, move, preview, copy,
  and save workflows, with a visible focus indicator on every control.
- **SC-012**: The homepage remains usable without horizontal page scrolling at both 1280×720
  and 360×800, and the directory is reachable through its toggle at 360px. On a 360px viewport,
  preview starts closed; its full-page mode hides the document tabs and fills the workspace
  without horizontal scrolling while only the preview tab remains visible.
- **SC-013**: The directory search returns correct results for a test corpus containing
  Traditional Chinese, English, mixed-language, punctuation, and space-containing content.
- **SC-014**: A user can insert a supported image from a file or paste one from the clipboard
  and see an image block within 1 second on a mid-range laptop.
- **SC-015**: Saving a document with inserted or pasted images produces a Markdown file and
  its associated image files; reopening them restores every image in 100% of test cases.
- **SC-016**: Unsupported or unstorable images are rejected with a message and cause no change
  to the document in 100% of failure tests.

## Assumptions

- This specification refines the homepage workspace described in
  `001-homepage-prompt-library`; where the two conflict, this specification governs the current
  homepage behavior.
- The product is single-user and local-first. Accounts, cloud sync, sharing, and collaboration
  are out of scope.
- The document format is line-oriented: each non-empty line is one block. Multiline Markdown
  constructs such as code fences, tables, and multi-line paragraphs remain literal lines and
  are reconstructed for Preview and Save rather than edited as structured objects.
- Free positioning is a layout aid. Markdown has no spatial positions, so output follows the
  24 px row-band reading order defined by the blocks: `row = round(y / 24)`, then `x`, then
  `seq`, then `id`. Blocks within the same band are intentionally left-to-right even when their
  `y` values differ by less than 24 px.
- Unsaved documents, including a new `Untitled` document, are session-only. Only an explicit
  Save persists a document; closing or reloading with unsaved changes triggers the browser's
  native leave confirmation and does not restore the unsaved draft.
- The `.` Marker is a literal prefix. Standard Markdown semantics apply to `#`, `##`, `###`,
  `-`, numbered ordered prefixes (`1.`, `2.`, `3.`, ...), and `>`. Ordered-list prefixes
  preserve their original number and are not automatically renumbered.
- "Related files" means images referenced by the Markdown document. Other attachment types are
  out of scope.
- Images can enter a document through Open with matching image files, through Insert Image, or
  by pasting from the clipboard. Supported formats are PNG, JPEG, GIF, and WebP; SVG and other
  formats are out of scope.
- Image content is stored locally with the document. Image resizing, cropping, and alternative
  text editing are out of scope; alternative text defaults to the image file name.
- Save and Save As write the Markdown file with relative image references together with its
  associated image files. Unrelated files on disk are not modified.
- When direct multi-file writing is unavailable, Save and Save As download the Markdown file
  and each associated image file separately and tell the user that they belong together. This
  is an accepted behavior of the local-first application.
- The directory is a flat list. Nested folders, tags, favorites, and bulk management are out of
  scope.
- The settings panel defines the minimum settings listed in this specification. Additional
  settings may be added later.
- Browser security rules prevent a custom three-way dialog during tab close or reload. The
  native leave confirmation is the expected behavior for those cases; the three-way dialog
  applies to navigation inside the app.
- The default light/dark mode follows the device; an explicit choice overrides it until changed.
- Documents, layouts, and preferences are stored locally per browser and device. Clearing
  browser data removes them, and they are not available on another device.
- The interface is desktop-first. At narrow widths the directory collapses behind a toggle, the
  preview starts closed, and the preview toggle switches the workspace to a full-page preview so
  the editor remains usable.
- The primary interface language is Traditional Chinese, while prompt content may mix
  Traditional Chinese and English.
- Preview uses standard Markdown rendering plus KaTeX math; other custom Markdown extensions are
  out of scope.

## Completion Status (2026-10-30)

- Implementation: complete; all 96 tasks in `tasks.md` are checked.
- Automated verification: 105 unit tests and 110 browser tests pass in Chrome 156 and
  Firefox 159, online and offline, from `file://`; Edge 156 passes 110/110 in headless runs.
  Safari historically passed 108/108 through the HTTP harness and a direct `file://` startup
  smoke; Safari testing is paused at the user's request.
- Start screen verification (2026-10-30): feature 004 opens on a start screen after refresh,
  lists up to ten recent files sorted by update time, and exposes New document, Open directory,
  and Open file actions. Chrome, Firefox, and Edge pass the 110-check suite.
- Mobile preview verification (2026-10-30): Chrome, Firefox, and Edge pass 110/110. At 360×800,
  preview starts closed; opening it hides the document tabs and editor canvas, leaves only the
  preview tab, fills the workspace below the tab bar without horizontal scrolling, and returns
  focus to the toggle when closed.
- Manual acceptance still pending:
  - SC-007: paste rich text and images into two real rich-text destinations.
  - Physical touch-device checks.
  - Screen-reader spot checks.
  - Real OS file and directory pickers.
  - Human timing for SC-001 and the manual walkthrough in the release browsers.
- Accepted limitations:
  - Browser tab close/reload uses the native Stay/Leave prompt instead of a custom dialog.
  - Firefox and Safari fall back to separate downloads for multi-file Save/Save As.
  - Some rich-text destinations strip data-URL images; exact Markdown remains available.
  - Safari testing is paused at the user's request because launching Safari disrupts the active
    desktop session. Historical Safari results remain in `quickstart.md`; do not launch Safari
    during routine verification. If requested later, it needs a visible GUI session or a separate
    macOS VM because Safari has no supported headless mode.
