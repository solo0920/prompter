# Contract: User Interface

**Version**: 1.0.0 | **Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This contract describes the observable interface behavior for the homepage workspace. It is
implementation-neutral but fixes labels, keyboard behavior, focus, states, and responsive
behavior so tests can be written against it.

## Layout

```text
+-----------------------------------------------------------------------------------+
| File |                        [status]                        | Copy Style Theme Settings |
+------+------------------------------------------------------------------------------------+
| Dir  | [ Document A × ][ Document B × ]                       [ File icon Document B ] [ Preview ] |
| rail +---------------------------------------------+------------------------------------+
| [=]  |                                             |  Live preview                      |
|      |              Editor canvas                  |  +------------------------------+  |
|      |      +----------------+    +-------------+  |  | rendered Markdown            |  |
|      |      | # Heading      |    |  image      |  |  |                              |  |
|      |      +----------------+    +-------------+  |  +------------------------------+  |
+------+---------------------------------------------+------------------------------------+
```

- Header: File menu far left; document status in the center; icon-only live-preview toggle,
  Copy, style selector, light/dark toggle, and settings on the right in that order.
- Document names are shown as tabs above the editor; the active tab's title is editable.
- Each tab has a small `×` close control. Tabs can be opened, switched, and closed independently.
- Left body rail: a narrow, always-visible `文件目錄` button at the far left of the workspace.
- Left: a collapsible directory with search, match count, and document list; it starts collapsed.
- Center: scrollable editor canvas. Right: an optional live preview pane that stays visible while
  editing and updates after edits and tab switches.
- The directory toggle sits in the body rail at every width: it pushes the sidebar open on wide
  screens and opens an off-canvas drawer below 768 px.

## Header Controls

| Control | Accessible name | Behavior |
|---------|-----------------|----------|
| File | `檔案` | Opens the File menu. |
| File > New | `新增文件` | Opens a new tab with a blank document titled `Untitled` and one composer; existing tabs stay open. |
| File > Open | `開啟檔案` | Opens the multi-file picker; opened Markdown files appear in new tabs. |
| File > Save | `儲存` | Disabled when no document. First save asks for a name/location; later saves target the current file when available. |
| File > Save As | `另存新檔` | Disabled when no document. Asks for a new name/location and creates a new document entry. |
| File > Insert Image | `插入圖片` | Opens the image picker; disabled when no document. |
| Preview | `即時預覽` | Preview-window icon at the right edge of the document tab bar toggles the live preview pane. While preview is open, the active document name with a file icon appears as a tab-styled label immediately to its left, with an `×` that closes preview. The editor canvas stays visible. Disabled when no document. |
| Copy | `複製` | Disabled when the document is empty. Copies exact Markdown with Markers; adds rich HTML only when the document contains images, with math included as self-contained MathML. |
| Style | `視覺風格` | Selects one of ten styles; 簡約留白 (`apple`) is the default. Independent of light/dark. Feature 003 defines the set and maps legacy values to Apple. |
| Theme | `切換明暗` | Toggles light/dark and stores an explicit choice. Tooltip reflects the next state. |
| Settings | `設定` | Opens the settings dialog. |
| Directory toggle | `文件目錄` | Located in the far-left body rail. Shows/hides the document directory at every width. Collapsed by default; `aria-expanded` reflects state. |

### File menu keyboard behavior

- Enter/Space on File opens the menu and focuses the first enabled item.
- Arrow Down/Up moves through items; Home/End jump to first/last; Escape closes and returns
  focus to File; Tab closes the menu.
- Clicking outside closes it.
- Disabled items remain in the menu with `disabled` and are skipped by focus.

## Directory

- Starts collapsed on every page load; the `文件目錄` button in the far-left body rail expands it.
- On wide screens the open directory occupies a left column next to the rail and pushes the
  workspace.
- At 768 px and below it opens as an off-canvas drawer beside the rail with an overlay; Escape or
  the overlay closes it and returns focus to the rail toggle.
- Search input label: `搜尋提示詞文件`.
- Placeholder: `搜尋標題或內容…`.
- Results count: `N 個文件` or `N 個結果`.
- Clear search button label: `清除搜尋`.
- No results: message `找不到符合的文件。` plus a clear-search action.
- Empty library: message `尚未儲存任何文件。` plus a `新增文件` action.
- Each item shows the title and localized last-modified date/time; the selected item has
  `aria-current="true"` and a visible selected style.
- Selecting an item keeps the sidebar open on wide screens and closes the narrow drawer after
  the document loads.
- Selecting an item with unsaved changes runs the Save/Discard/Cancel flow before opening.
- Creating a new document clears an active search so the new document is visible after save.
- The list is sorted by `updatedAt` descending.
- Search matches title, block text, image alt text, and image file names, case-insensitively,
  with leading/trailing query whitespace ignored and punctuation treated literally.
- Results update without a page reload and within 300 ms for 500 documents.

## Document Tabs

- Open documents appear as a horizontal tab bar above the editor and preview pane.
- The active tab embeds the labeled `文件標題` text input; inactive tabs show their title text.
- Each tab includes a close `×` control; closing the active tab activates a neighboring tab.
- Closing a dirty tab asks Save, Discard, or Cancel. Closing the last tab returns to the empty
  workspace.
- File > New, File > Open, and directory selection open or activate a tab without discarding
  other open tabs.
- Default `Untitled` for a new document; opened documents use the file name without extension.
- Editing the title marks the active document dirty and updates its default save file name.
- Empty title falls back to `Untitled` on blur/save.
- The title is not included in Markdown output.
- Maximum 200 characters; longer input is truncated with a message.

## Composer

The composer is the only input box that creates a new block.

- A blank document opens with one composer at the top-left and the Marker control on its left.
- The composer shows the selected or detected Marker as a prefix pill.
- The composer occupies a fixed sequence slot. Moving its source block or reordering other
  blocks does not drag the composer along.
- A drag handle at the composer's right edge moves the composer between slots. Dragging a block
  across the composer shifts the composer one position like any other intervening item.
- When the composer handle is focused, Up/Down moves the composer one slot earlier/later and
  keeps focus on the handle; the composer stays open and the block order is unchanged.
- The composer is a multi-line text area. It grows wider as text exceeds its current width,
  up to the composer maximum, and grows taller when the text wraps so the full text remains
  visible.
- Enter:
  - With non-empty text: create a text block at the composer slot, mark dirty, keep the next
    composer focused, and do not leave the committed block selected or outlined.
  - With empty/whitespace-only text: no block, no error.
- Shift+Enter inserts a line break without committing the composer.
- Escape:
  - Inserted via "+": dismiss the composer; no block.
  - Initial blank-document composer: keep it (a blank document always has an input).
- Moving the pointer anywhere from the block's left border through the Marker prefix opens a
  symbol-only flyout to its left; clicking or pressing Enter/Space also opens it for keyboard
  and touch input. The left side uses the default cursor, while the right side keeps the grab
  cursor and drag handle. The flyout lists `×` (no Marker),
  `#`, `##`, `###`, `-`, `1.`, `>`, and `.` with descriptive accessible names but no visible
  title text. Arrow Up/Down navigates, Home/End jump to the first/last option, Escape closes,
  and selecting an option applies it, returns focus to the composer text input, and preserves
  the caret or selection. A hover-opened flyout stays open while the pointer is over the Marker
  or flyout, including the gap between them, and closes after the pointer leaves both areas,
  chooses an option, presses Escape or Tab, or clicks outside.
- Typing a recognized marker token followed by exactly one space at the start shows a live
  detection label (for example `偵測到： ##`). On Enter the marker is stored once and removed
  from the text. If the user selects a different marker from the menu after typing, the menu
  choice replaces the detected marker until the text is edited again.
- Clicking elsewhere does not silently commit composer text; it remains visible until Enter or
  Escape. Navigating away triggers the unsaved-changes check if it has text.
- Only one composer exists. Activating "+" while a composer is open commits that composer if it
  has text, then opens the new one.

## Block Display

Each text block is a floating box showing:

- The Marker prefix (if any) as a non-editable visual prefix that is also a button for changing
  the Marker. Markers are always visible without hover; when no Marker is set, the prefix is a
  blank clickable area with no `×` or text. The flyout opens when the pointer enters anywhere
  from the block's left border through this prefix, on click, or on keyboard activation.
- The text, wrapped visually and representing one or more Markdown lines. The text area is a
  Tab stop; Enter/F2 while it is focused starts block editing.
- A drag handle/affordance (the block body when not editing, plus a visible handle on touch).
- A small lower-right `+` button with accessible name `在此區塊下方新增`, revealed while the
  right half of the block is hovered or keyboard-focused, and always visible on touch devices.
- A selected/focus style with a visible outline. Multi-selected blocks use a bright orange
  highlight; the composer uses its own accent border only while its input or controls hold
  focus.

Each image block shows:

- The image scaled to fit the canvas width, preserving aspect ratio.
- The alternative text as the image's alt text (visually hidden if the image loads).
- A remove button labeled `移除圖片`.
- The same `+`, drag, select, and focus behavior as text blocks.
- A missing-image placeholder with the alt text when the asset cannot be loaded.

## Selection

- Cmd-click (Ctrl-click on Windows) toggles a block in the current selection without clearing
  the others; a plain click selects only that block.
- Dragging any selected block moves the entire selection as one contiguous group, preserving the
  selected blocks' relative order and leaving unselected blocks outside the group. The whole
  group stays highlighted during and after the drag. Dragging a non-selected block clears the
  selection and moves only that block. Escape or an out-of-bounds drop restores the pre-drag
  order and selection.
- Dragging on empty canvas draws a selection rectangle and selects every text or image block it
  intersects. Holding Cmd (Ctrl on Windows) while dragging adds the hits to the existing
  selection. Releasing keeps the selection; Escape restores the pre-marquee selection; a plain
  empty-canvas click clears it.
- Hovering the Marker control of a selected text block opens the symbol flyout. Choosing a
  Marker applies it to every selected text block; unselected blocks and image blocks are
  unchanged, and the selection remains highlighted.

## Editing a Block

- Double-click a text block (double-tap on touch), or focus it and press Enter/F2, to enter
  edit mode.
- Edit mode shows a multi-line text area containing the block text and the Marker button. The
  text area grows wider with its content up to the block maximum and grows taller as text
  wraps.
- Enter commits and exits edit mode; Shift+Enter inserts a line break; Escape cancels and
  restores the original text and marker; clicking outside commits.
- After committing a text block, the next composer inherits that block's Marker.
- Marker detection applies on commit: a recognized prefix typed at the start is extracted once.
  If the block already has a marker, a second typed marker is treated as literal text.
- Committing empty/whitespace-only text removes the block. Its blank-line separation transfers
  to the previous block or document leading blanks. If the last block is removed, the
  blank-document composer reappears.
- A marker-only block is removed only when the user edits it to empty; marker-only lines from an
  opened file remain literal text until edited.
- Image blocks are not text-editable; their remove control is the deletion path.
- Editing does not disable Preview or Copy; both use committed blocks.
- Delete/Backspace removes the current selection only when focus is on the canvas or a block;
  while the composer or block editor input is focused, those keys edit text normally.

## "+" Insertion

- Every block has a "+" control at its lower-right, revealed while the right half of the block
  is hovered or keyboard-focused, and kept visible on touch devices.
- Activating it creates one composer directly below the source block, aligned to the source x.
- The composer inherits the Marker of the source text block. For an image source, it inherits the
  nearest preceding text block's Marker; with no preceding text block it falls back to the
  default Marker from settings.
- Escape dismisses the inserted composer without creating a block.
- Enter commits it and removes the composer; the next composer receives focus and the new block
  is not left selected.
- If the document has unsaved changes, adding a block marks it dirty; no save prompt is needed.

## Dragging and Keyboard Movement

- Pointer drag starts on the block body (not on an interactive control) or on the visible drag
  handle. A movement threshold prevents accidental drags on click.
- During drag, the dragged block follows the pointer while the intervening blocks shift live
  into their previewed sequence positions. Releasing commits the sequential shift; canceling
  restores the pre-drag sequence.
- When multiple blocks are selected, dragging any one of them moves the whole selection as a
  contiguous group. The group follows the pointer as one unit, intervening blocks shift live,
  and releasing inserts the group at the previewed position.
- A drag that starts on empty canvas draws an orange selection rectangle instead of moving
  blocks; blocks are selected as soon as the rectangle intersects them.
- The grab cursor and drag affordance apply to the right side of a block. The left Marker area
  uses the default cursor so it is clear that it opens the Marker flyout instead of dragging.

## Keyboard Navigation

- With focus on a block or the canvas, Up/Down moves through the previous/next sequence item and
  wraps at the ends. The composer participates at its own sequence slot; focusing it clears the
  block selection and places the caret in the composer input.
- While focus is inside a text block, the Tab order is text area → title/Marker → drag handle →
  remaining action controls → block root, wrapping within that block. While focus is inside the
  composer, it cycles only the composer's marker, input, and handle. When focus is on the canvas,
  it uses the selected block if one exists; otherwise it cycles editor items. It never moves to
  the header or left rail, and both directions wrap.
- Up/Down select the previous/next item and preserve the active focus zone (text, title, action,
  handle, or root) in the destination item when available, so repeated navigation keeps the same
  control type active.
- Space/Enter on the title/Marker control opens the symbol-only flyout; Up/Down moves through
  the Marker options and Enter/Space applies the focused option.
- Up/Down on a drag handle moves the focused block one position earlier/later and keeps focus on
  the handle, with the move announced.
- Up/Down on the composer title control or text input moves to the sequence item immediately
  before or after the composer's slot, wrapping at the ends; the composer remains open. Up/Down
  on the composer drag handle moves the composer one slot earlier or later and keeps focus on the
  handle. Other keys keep normal text editing, and the block editor input retains its normal
  caret behavior.
- Every block occupies a contiguous sequence position; there are no free-floating coordinates
  or empty gaps.
- The selected/dragged block is raised above the other blocks while dragging.
- Alt+Arrow moves the selected block one position earlier or later in the sequence and is
  announced in a polite live region (for example `區塊已移到第 2 個位置，共 3 個區塊`).
- Touch drag uses `touch-action: none` only on the drag handle so vertical page scrolling still
  works elsewhere.
- Dragging never changes Markdown text content.

## Reading Order

- Reading order is the visible sequence order. The editor lays blocks out top to bottom with no
  empty positions, so the same order drives Preview, Copy, and Save.
- The DOM order of blocks matches reading order after each commit so screen readers follow the
  same order as Preview/Save.
- There is no separate manual reading-order control in this feature.
- Moving a block never rewrites or reorders text in place; it only changes the sequence order.

## Preview

- Preview opens as a live pane on the right side of the workspace; the editor canvas remains
  visible on the left. It is not a dialog or a new window.
- The preview icon at the right edge of the tab bar toggles the pane and uses `aria-pressed="true"` while open.
- Only while the preview pane is open, the active document name with a file icon appears
  immediately to the left of the preview icon as a tab-styled label matching the active document
  tab's colors and shape. Its left edge aligns with the preview pane's left boundary, so the tab
  bar visibly splits into editor and preview sections. It includes a small `×` that closes
  preview. When preview is closed, the tab bar shows only the preview icon. The pane itself has no
  separate `即時預覽` heading.
- Renders the canonical Markdown for the active document, including unsaved edits, and refreshes
  after edits and tab switches.
- Supports headings, bullet lists, ordered lists with literal values, blockquotes, images,
  plain text, fenced code, basic pipe tables, and KaTeX math using `$...$`, `$$...$$`,
  `\(...\)`, and `\[...\]` delimiters. Math inside fenced code stays literal.
- Raw HTML is shown as text; other unsupported constructs remain literal.
- Local images render from local assets. Missing images show alt text or a placeholder plus a
  warning. Remote images are not fetched.
- Closing the pane keeps the editor unchanged and focus on the preview toggle; the editor selection,
  composer, and scroll position are preserved.
- Preview never modifies the document or marks it dirty.
- If rendering fails, show an error and the raw Markdown in a selectable `<pre>` block.

## Copy Feedback

- Success: toast `已複製 Markdown` or `已複製 Markdown 與圖片`.
- Images omitted: toast/banner `已複製 Markdown，但圖片無法包含。`
- Manual fallback: dialog labeled `手動複製` with exact Markdown, a `選取全部` button, and
  instructions.
- Failure: persistent alert with a retry action; never a false success.
- Copy is disabled when the document is empty, with an accessible explanation.

## Settings Dialog

Label: `設定`. Contains at minimum:

- `預設標記` select with all Marker options.
- `顯示對齊格線` checkbox/toggle.
- `跟隨系統明暗` reset action (sets theme to system).
- `清除本機資料庫` button with confirmation.
- Version information: app version and storage schema version.
- Close control labeled `關閉設定`.

Clear-library confirmation:

- Explains that local documents, layouts, and images will be removed.
- States that Markdown and image files already saved on disk are not deleted.
- Offers `取消` and `清除` (destructive style).
- On confirm, closes the current document, clears records, keeps preferences, and shows the
  empty state.
- If clearing partially fails, reports the storage error and keeps the session usable.

Settings changes apply immediately and persist; there is no Apply button.

## Save/Discard/Cancel Flow

Triggered by closing a dirty document tab, or another action that would discard that tab's
changes. New, Open, and tab switching preserve open tabs and do not prompt.

Dialog title: `尚未儲存的變更`.

- `儲存`: attempts Save; if it succeeds, continue the pending action. If it fails, keep the
  dialog/current document open and show the error.
- `捨棄`: discard changes and continue the pending action.
- `取消`: close the dialog and stay on the current document.

Closing a dirty document tab uses the in-app three-way dialog. Closing or reloading the browser
tab uses the native confirmation when any open document is dirty, because browsers do not permit
a custom unload dialog. This limitation is recorded in `../plan.md`.

## States and Feedback

| State | UI |
|-------|----|
| No documents | Directory empty state with `新增文件`; canvas empty state `建立第一個提示詞區塊`. |
| Blank document | One composer at top-left; Save enabled; Copy disabled; Preview shows empty state. |
| Document open | Blocks in reading order; tab title populated; Copy enabled when non-empty. |
| Preview active | Editor canvas remains visible; live rendered Markdown appears in the right pane; preview toggle is pressed. |
| Dirty | Unsaved indicator in the header status area and on the tab; no modal until tab close/reload. |
| Saving | Save/Save As disabled with busy label; no duplicate writes. |
| Storage warning | Non-blocking banner in the directory with details and a dismiss action. |
| Missing images | Block/preview placeholder plus a warning listing the missing files. |
| Search no results | Message and clear-search action. |
| Mobile directory | Off-canvas drawer with overlay; Escape closes; focus returns to the toggle. |

## Responsive Behavior

- 1280×720: header, tab bar, canvas, and optional right preview are visible without horizontal
  scrolling; the directory starts collapsed, and the body rail opens it as a left column.
- 1100 px and below: the header keeps the actions reachable while the document title stays in
  the tab bar.
- 768 px and below: directory becomes a labeled off-canvas drawer beside the rail; header
  actions remain reachable, and the preview pane overlays the editor when opened.
- 360×800: compact icon buttons for File, Preview, Copy, Style, Theme, Settings and the body
  rail toggle; product name and non-essential labels hidden; 44 px touch targets where possible;
  no horizontal page scrolling; tab bar scrolls horizontally; canvas width fits the viewport.
- Blocks clamp to the current canvas width; long text wraps; images scale down.
- The header may wrap to two rows if needed at 360 px, but all actions must remain reachable
  without horizontal scrolling.

## Keyboard Map

| Context | Keys | Action |
|---------|------|--------|
| Global | Tab / Shift+Tab | Move focus through controls in visual order; while focus is in the editor, cycle only within the current block or composer's controls and wrap. |
| File menu | Enter/Space, Arrow Up/Down, Home/End, Escape | Open/navigate/close. |
| Directory | Tab, Enter/Space | Focus/open a document. |
| Preview | Enter/Space | Toggle the live right-side preview pane. |
| Block | Tab | Focus block in reading order. |
| Block | Cmd/Ctrl + click | Toggle the block in the current multi-selection. |
| Block/canvas | Up/Down | Select the previous/next sequence item, including the composer at its slot; wraps from first to last and last to first. |
| Block/canvas | Delete / Backspace | Remove every selected block; ignored while typing in the composer or block editor. |
| Block | Enter/F2 | Enter edit mode. |
| Title/Marker | Space/Enter | Open the Marker menu; Up/Down choose an option; Enter/Space apply it. |
| Drag handle | Up/Down | Move the focused block one sequence position earlier or later; focus stays on the handle. |
| Block | Alt+Arrow | Move one sequence position earlier or later. |
| Block | `+` button | Insert composer below. |
| Editing | Enter | Commit and exit. |
| Editing | Escape | Cancel edit. |
| Composer title/input | Up/Down | Select the item before/after the composer slot; wraps at the ends and leaves the composer open. |
| Composer drag handle | Up/Down | Move the composer one sequence slot earlier/later; focus stays on the handle. |
| Composer | Enter | Create block (non-empty). |
| Composer | Escape | Dismiss inserted composer. |
| Dialog | Escape | Close (native dialog). |
| Drawer | Escape | Close and return focus. |

## Accessibility Requirements

- Every control has an accessible name; icon-only buttons use `aria-label` and a tooltip.
- Visible focus indicator with at least 3:1 contrast against the background.
- Color contrast meets WCAG AA for text and controls in both themes and styles.
- Status toasts use `role="status"`; errors use `role="alert"`.
- The selected block, dirty state, busy state, and storage warning are exposed programmatically.
- Image blocks use meaningful alt text; decorative icons use `aria-hidden="true"`.
- Native `<dialog>` provides focus containment for settings and confirmation dialogs; the
  right-side preview keeps focus on its toggle.
- Reduced-motion preference disables non-essential transitions.
- A keyboard-only user can create, edit, add, move, preview, copy, and save without a pointer.

## Non-goals

- Touch pinch-zoom, multi-select, grouping, layers panel, or undo history.
- A separate reading-order control.
- Inline images inside a text line, a table editor, or full CommonMark WYSIWYG.
- Editing image alt text, resizing, cropping, or rotating.
- Nested folders, tags, favorites, or bulk document management.
