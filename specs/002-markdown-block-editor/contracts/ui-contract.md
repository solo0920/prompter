# Contract: User Interface

**Version**: 1.0.0 | **Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This contract describes the observable interface behavior for the homepage workspace. It is
implementation-neutral but fixes labels, keyboard behavior, focus, states, and responsive
behavior so tests can be written against it.

## Layout

```text
+--------------------------------------------------------------------------------+
| File | [directory toggle] |        Preview   Copy        | Style Theme Settings |
+--------------------------------------------------------------------------------+
| Document title                                                       [status]  |
+----------------------+---------------------------------------------------------+
| Search documents     |                                                         |
| [................]   |                  Editor canvas                          |
| N results            |      +----------------+    +------------------+         |
|                      |      | # Heading      |    |  image           |         |
| Document A           |      | +              |    |  +      [remove] |         |
| 2026-10-28 01:00     |      +----------------+    +------------------+         |
| Document B           |                                                         |
| ...                  |                                                         |
+----------------------+---------------------------------------------------------+
```

- Header: File menu far left; Preview and Copy centered; style selector, light/dark toggle, and
  settings on the right.
- Below the header: a document title field (metadata, not Markdown) and a status area.
- Left: directory with search, match count, and document list.
- Center: scrollable workspace containing the canvas with absolutely positioned blocks.
- The directory is hidden behind a labeled toggle below 768 px and becomes an off-canvas drawer.

## Header Controls

| Control | Accessible name | Behavior |
|---------|-----------------|----------|
| File | `檔案` | Opens the File menu. |
| File > New | `新增文件` | Unsaved-changes check, then a blank document titled `Untitled` with one composer. |
| File > Open | `開啟檔案` | Unsaved-changes check, then the multi-file picker. |
| File > Save | `儲存` | Disabled when no document. First save asks for a name/location; later saves target the current file when available. |
| File > Save As | `另存新檔` | Disabled when no document. Asks for a new name/location and creates a new document entry. |
| File > Insert Image | `插入圖片` | Opens the image picker; disabled when no document. |
| Preview | `預覽` | Opens the Preview dialog for the current content. |
| Copy | `複製` | Disabled when the document is empty. Copies Markdown plus rich content. |
| Style | `視覺風格` | Selects one of ten styles; 簡約留白 (`apple`) is the default. Independent of light/dark. Feature 003 defines the set and maps legacy values to Apple. |
| Theme | `切換明暗` | Toggles light/dark and stores an explicit choice. Tooltip reflects the next state. |
| Settings | `設定` | Opens the settings dialog. |
| Directory toggle | `文件目錄` | Shows/hides the directory drawer at narrow widths. `aria-expanded` reflects state. |

### File menu keyboard behavior

- Enter/Space on File opens the menu and focuses the first enabled item.
- Arrow Down/Up moves through items; Home/End jump to first/last; Escape closes and returns
  focus to File; Tab closes the menu.
- Clicking outside closes it.
- Disabled items remain in the menu with `disabled` and are skipped by focus.

## Directory

- Search input label: `搜尋提示詞文件`.
- Placeholder: `搜尋標題或內容…`.
- Results count: `N 個文件` or `N 個結果`.
- Clear search button label: `清除搜尋`.
- No results: message `找不到符合的文件。` plus a clear-search action.
- Empty library: message `尚未儲存任何文件。` plus a `新增文件` action.
- Each item shows the title and localized last-modified date/time; the selected item has
  `aria-current="true"` and a visible selected style.
- Selecting an item with unsaved changes runs the Save/Discard/Cancel flow before opening.
- Creating a new document clears an active search so the new document is visible after save.
- The list is sorted by `updatedAt` descending.
- Search matches title, block text, image alt text, and image file names, case-insensitively,
  with leading/trailing query whitespace ignored and punctuation treated literally.
- Results update without a page reload and within 300 ms for 500 documents.

## Document Title

- A single-line text input labeled `文件標題` above the canvas.
- Default `Untitled` for a new document; opened documents use the file name without extension.
- Editing the title marks the document dirty and updates its default save file name.
- Empty title falls back to `Untitled` on blur/save.
- The title is not included in Markdown output.
- Maximum 200 characters; longer input is truncated with a message.

## Composer

The composer is the only input box that creates a new block.

- A blank document opens with one composer at the top-left and the Marker control on its left.
- The composer shows the selected or detected Marker as a prefix pill.
- Enter:
  - With non-empty text: create a text block at the composer position, remove the composer,
    mark dirty, and select the new block.
  - With empty/whitespace-only text: no block, no error.
- Escape:
  - Inserted via "+": dismiss the composer; no block.
  - Initial blank-document composer: keep it (a blank document always has an input).
- The Marker control opens a menu with None, `#`, `##`, `###`, `-`, `1.`, `>`, and `.`.
  Each option has a visible label and accessible name. Enter/Space opens it, Arrow Up/Down
  navigates, Home/End jump to the first/last option, Escape closes and returns focus to the
  control, and selecting an option applies it and returns focus.
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
  the Marker.
- The text, wrapped visually but representing one Markdown line.
- A drag handle/affordance (the block body when not editing, plus a visible handle on touch).
- A small lower-left `+` button with accessible name `在此區塊下方新增`, revealed while the block
  is hovered or keyboard-focused, and always visible on touch devices.
- A selected/focus style with a visible outline.

Each image block shows:

- The image scaled to fit the canvas width, preserving aspect ratio.
- The alternative text as the image's alt text (visually hidden if the image loads).
- A remove button labeled `移除圖片`.
- The same `+`, drag, select, and focus behavior as text blocks.
- A missing-image placeholder with the alt text when the asset cannot be loaded.

## Editing a Block

- Double-click a text block (double-tap on touch), or focus it and press Enter/F2, to enter
  edit mode.
- Edit mode shows a text input containing the block text and the Marker button.
- Enter commits and exits edit mode; Escape cancels and restores the original text and marker;
  clicking outside commits.
- Marker detection applies on commit: a recognized prefix typed at the start is extracted once.
  If the block already has a marker, a second typed marker is treated as literal text.
- Committing empty/whitespace-only text removes the block. Its blank-line separation transfers
  to the previous block or document leading blanks. If the last block is removed, the
  blank-document composer reappears.
- A marker-only block is removed only when the user edits it to empty; marker-only lines from an
  opened file remain literal text until edited.
- Image blocks are not text-editable; their remove control is the deletion path.
- Editing does not disable Preview or Copy; both use committed blocks.

## "+" Insertion

- Every block has a "+" control at its lower-left, revealed on block hover or keyboard focus and
  kept visible on touch devices.
- Activating it creates one composer directly below the source block, aligned to the source x.
- The composer uses the default Marker from settings.
- Escape dismisses the inserted composer without creating a block.
- Enter commits it and removes the composer; the new block is selected.
- If the document has unsaved changes, adding a block marks it dirty; no save prompt is needed.

## Dragging and Keyboard Movement

- Pointer drag starts on the block body (not on an interactive control) or on the visible drag
  handle. A movement threshold prevents accidental drags on click.
- During drag, the dragged block follows the pointer while the intervening blocks shift live
  into their previewed sequence positions. Releasing commits the sequential shift; canceling
  restores the pre-drag sequence.
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

- Opens a modal `<dialog>` labeled `預覽`.
- Renders the canonical Markdown for the current document, including unsaved edits.
- Supports headings, bullet lists, ordered lists with literal values, blockquotes, images,
  plain text, fenced code, and basic pipe tables.
- Raw HTML is shown as text; other unsupported constructs remain literal.
- Local images render from local assets. Missing images show alt text or a placeholder plus a
  warning. Remote images are not fetched.
- Close control labeled `關閉預覽`; Escape also closes.
- Closing returns focus to the Preview button.
- Preview never modifies the document.
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

Triggered by New, Open, switching documents, or another action that would replace the current
document when `dirty` is true.

Dialog title: `尚未儲存的變更`.

- `儲存`: attempts Save; if it succeeds, continue the pending action. If it fails, keep the
  dialog/current document open and show the error.
- `捨棄`: discard changes and continue the pending action.
- `取消`: close the dialog and stay on the current document.

Tab close/reload uses the browser's native confirmation because browsers do not permit a custom
three-way unload dialog. This limitation is recorded in `../plan.md`.

## States and Feedback

| State | UI |
|-------|----|
| No documents | Directory empty state with `新增文件`; canvas empty state `建立第一個提示詞區塊`. |
| Blank document | One composer at top-left; Save enabled; Copy disabled; Preview shows empty state. |
| Document open | Blocks in reading order; title field populated; Copy enabled when non-empty. |
| Dirty | Unsaved indicator near the title/status area; no modal until navigation. |
| Saving | Save/Save As disabled with busy label; no duplicate writes. |
| Storage warning | Non-blocking banner in the directory with details and a dismiss action. |
| Missing images | Block/preview placeholder plus a warning listing the missing files. |
| Search no results | Message and clear-search action. |
| Mobile directory | Off-canvas drawer with overlay; Escape closes; focus returns to the toggle. |

## Responsive Behavior

- 1280×720: header, directory, and canvas visible without horizontal scrolling.
- 768 px and below: directory becomes a labeled drawer; header actions remain reachable.
- 360×800: compact icon buttons for File, drawer, Preview, Copy, Style, Theme, Settings; product
  name and non-essential labels hidden; 44 px touch targets where possible; no horizontal page
  scrolling; canvas width fits the viewport.
- Blocks clamp to the current canvas width; long text wraps; images scale down.
- The header may wrap to two rows if needed at 360 px, but all actions must remain reachable
  without horizontal scrolling.

## Keyboard Map

| Context | Keys | Action |
|---------|------|--------|
| Global | Tab / Shift+Tab | Move focus through controls in visual order. |
| File menu | Enter/Space, Arrow Up/Down, Home/End, Escape | Open/navigate/close. |
| Directory | Tab, Enter/Space | Focus/open a document. |
| Block | Tab | Focus block in reading order. |
| Block | Enter/F2 | Enter edit mode. |
| Block | Alt+Arrow | Move by 24 px. |
| Block | Alt+Shift+Arrow | Move by 1 px. |
| Block | `+` button | Insert composer below. |
| Editing | Enter | Commit and exit. |
| Editing | Escape | Cancel edit. |
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
- Native `<dialog>` provides focus containment and restores focus on close.
- Reduced-motion preference disables non-essential transitions.
- A keyboard-only user can create, edit, add, move, preview, copy, and save without a pointer.

## Non-goals

- Touch pinch-zoom, multi-select, grouping, layers panel, or undo history.
- A separate reading-order control.
- Inline images inside a text line, a table editor, or full CommonMark WYSIWYG.
- Editing image alt text, resizing, cropping, or rotating.
- Nested folders, tags, favorites, or bulk document management.
