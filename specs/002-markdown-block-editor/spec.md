# Feature Specification: Markdown Block Editor

**Feature Branch**: `002-markdown-block-editor`

**Created**: 2026-10-28

**Status**: Draft

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
   edit mode; pressing Enter commits the edit and exits edit mode, and pressing Escape cancels
   the edit.
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
   with the title "Untitled" and one empty input box is opened and is not added to the
   document directory until it is saved.
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
6. **Given** unsaved changes, **When** the user chooses New or Open or switches documents,
   **Then** the user is asked to Save, Discard, or Cancel before the action proceeds; when the
   user closes or reloads the tab, **Then** the browser's native leave confirmation appears.
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

**Independent Test**: Create a document with headings, bullets, and an image, open Preview,
then copy the document and paste it into a rich-text destination and a plain-text destination.
The story is complete when the preview matches the Markdown and both destinations receive the
expected content.

**Acceptance Scenarios**:

1. **Given** an open document, **When** the user activates Preview, **Then** the rendered
   Markdown replaces the editor canvas in the same workspace, including unsaved edits, and the
   header toggle becomes `編輯`.
2. **Given** the preview is active, **When** the user activates `編輯`, **Then** the editor
   returns exactly as it was, the document is unchanged, and focus remains on the toggle.
3. **Given** an open document with content, **When** the user activates Copy, **Then** the
   Markdown source is placed on the clipboard exactly as it would be saved, preserving line
   order, Markers, and line breaks.
4. **Given** a document with opened, inserted, or pasted images, **When** the user copies it,
   **Then** a single paste into a rich-text destination includes both the Markdown text and
   the images.
5. **Given** the destination cannot accept images, **When** the user pastes, **Then** the
   Markdown text is still available and the system explains that images could not be included.
6. **Given** an empty document, **When** the homepage is displayed, **Then** Copy is disabled.

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

1. **Given** the homepage is open, **When** the header is displayed, **Then** the right side
   shows a style selector, a light/dark toggle, and a settings button.
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
   is hidden behind a labeled toggle, all header actions remain reachable, and the page does
   not require horizontal scrolling.

---

### Edge Cases

- When the initial input box is empty and Enter is pressed, no block is created.
- When a block's text is empty and it has no Marker after editing, the block is removed.
- When a Marker is typed without a following space, it is treated as ordinary text until the
  space is entered.
- When a line contains only a Marker and no text, the block is removed when editing ends.
- When a block contains a very long single line, the block wraps visually but remains one
  Markdown line.
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

- **FR-001**: The homepage MUST provide a top header, a collapsible left document directory,
  and a central editor area.
- **FR-002**: The header MUST place the File menu at the far left, the Preview/Edit toggle and
  Copy in the center, and the style selector, light/dark toggle, and settings button on the
  right.
- **FR-003**: The File menu MUST provide New, Open, Save, Save As, and Insert Image.
- **FR-004**: The directory MUST start collapsed, be revealed by a labeled toggle at every
  width, and list saved documents in reverse last-modified order with title and last-modified
  date/time.
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
- **FR-009**: New MUST open a blank document titled "Untitled" with one empty input box; the
  document MUST NOT be added to the directory until it is saved.
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
- **FR-015**: When unsaved changes exist, New, Open, switching documents, and other in-app
  navigation MUST ask the user to Save, Discard, or Cancel before continuing. Closing or
  reloading the page MUST trigger the browser's native leave confirmation; the last explicit
  save MUST remain intact.
- **FR-016**: Cancelled file operations MUST leave the current document and its changes
  intact; failed file operations MUST show an error, preserve the content, and leave the
  document editable.
- **FR-017**: A blank document MUST show one input box with a Marker control on its left; typing
  text and pressing Enter MUST create a block, while pressing Enter with empty text MUST do
  nothing.
- **FR-018**: The Marker control MUST offer None, `#`, `##`, `###`, `-`, `1.`, `>`, and `.`
  options, and the selected Marker MUST be displayed in front of the block and included once
  in Markdown output. Choosing an option MUST return focus to the composer text input and
  preserve its caret or selection.
- **FR-019**: When the user types a recognized Marker followed by a space in an input box, the
  Marker MUST be detected live and shown as a prefix; on commit it MUST become the block
  Marker without being duplicated in the block text.
- **FR-020**: Every block MUST expose a "+" control at its lower-right, revealed when the right
  half of the block is hovered; activating it MUST insert a new input box directly below that
  block, and Escape MUST dismiss the inserted input without creating a block.
- **FR-021**: Double-clicking a text block MUST enter edit mode; Enter MUST commit and exit
  edit mode, Escape MUST cancel the edit, and clicking outside MUST commit the edit.
- **FR-022**: A text block MUST hold a single line of text; Enter MUST commit rather than
  insert a line break, and a text block whose text is empty after editing MUST be removed.
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
  preserve the resulting reading order; and a new composer MUST inherit the Marker of its source
  text block, or the nearest preceding text block for an image source, falling back to the
  default Marker selected in settings when no text block precedes it.
- **FR-028**: Preview MUST render the current document's Markdown in place of the editor canvas
  within the same workspace, including headings, lists, quotes, fenced code, basic pipe tables,
  images, and plain text, with raw HTML-looking text escaped, without modifying the document.
  While preview is active the header toggle MUST read `編輯` and activate the unchanged editor
  when selected; preview MUST NOT open a dialog or a new window.
- **FR-029**: Copy MUST place the Markdown source on the clipboard exactly as it would be
  saved, preserving line order, Markers, and line breaks, and MUST show success or failure
  feedback.
- **FR-030**: When the document has opened, inserted, or pasted images, Copy MUST also include
  a rich representation containing the text and images so that one paste into a rich-text
  destination includes both.
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
- **FR-038**: At a 360px-wide viewport, the directory MUST remain collapsed behind a labeled
  toggle, all header actions MUST remain reachable, and the page MUST NOT require horizontal
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

### Key Entities *(include if feature involves data)*

- **Prompt Document**: A saved prompt with a unique identifier, title, file name, ordered
  text and image blocks, locally stored image assets, creation time, and last-modified time.
- **Block**: A text or image unit within a document. A text block contains one line of text,
  a Marker, a canvas position, and a stacking order. An image block contains an image asset,
  alternative text, a canvas position, and a stacking order.
- **Marker**: The optional line prefix chosen from None, `#`, `##`, `###`, `-`, `1.`, `>`, or
  `.`. It is displayed with a text block and included once in Markdown output.
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
  and 360×800, and the directory is reachable through its toggle at 360px.
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
  `-`, `1.`, and `>`. Ordered-list numbers are literal and are not automatically renumbered.
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
- The interface is desktop-first. At narrow widths the directory collapses behind a toggle so
  the editor remains usable.
- The primary interface language is Traditional Chinese, while prompt content may mix
  Traditional Chinese and English.
- Preview uses standard Markdown rendering; custom Markdown extensions are out of scope.
