# Tasks: Markdown Block Editor

**Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

**Input**: Design documents from `/specs/002-markdown-block-editor/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), and [quickstart.md](./quickstart.md)

**Tests**: Included. The implementation plan and quickstart require dependency-free Node tests
for pure logic and a `file://` browser harness for DOM, storage, and renderer checks. Clipboard
and file-picker paths that need real user gestures remain manual.

**Organization**: Tasks are grouped by user story so each increment can be verified on its own
after its stated dependencies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: `[US1]` through `[US5]`, mapping to the priorities in `spec.md`.
- Every task includes an exact file path.

## Path Conventions

Single static project at the repository root: `index.html`, `assets/css/`, `assets/js/`,
`tests/unit/`, `tests/fixtures/`, and `tests/browser/`. No `src/`, backend, package manifest, or
build output is created.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the static shell, local styles, and test fixture corpus. No runtime
dependency, server, build step, or network asset is introduced.

- [x] T001 Create the static page shell in `index.html` with header (File menu left; Preview and Copy centered; style, theme, and settings right), document title/status row, directory aside, canvas main, dialogs, toast region, and polite/assertive live regions.
- [x] T002 [P] Create `assets/css/base.css` with the reset, app grid, typography using system font stacks, visible focus rings, reduced-motion handling, and 360 px-safe layout rules.
- [x] T003 [P] Create `assets/css/themes.css` with 紙張 (`paper`) and 石墨 (`graphite`) tokens for light and dark themes, including `prefers-color-scheme` defaults and WCAG AA text/control contrast.
- [x] T004 [P] Create `assets/css/app.css` with component styles for the header, File menu, directory, canvas, text/image blocks, composer, Marker menu, dialogs, toasts, warnings, and narrow-width drawer/compact header.
- [x] T005 [P] Create 1×1 PNG, JPEG, GIF, and WebP fixtures under `tests/fixtures/images/` for image validation and storage tests.
- [x] T006 [P] Create the Markdown round-trip corpus under `tests/fixtures/` covering markers, marker-only lines, leading/middle/trailing blank lines, CRLF, BOM, no final newline, Traditional Chinese/English/emoji, trailing spaces, fenced code, pipe tables, data-URL images, unmatched relative images, and raw HTML-looking text, with `.expected.md` outputs.
- [x] T007 Wire all local CSS and classic `<script defer>` files into `index.html` in dependency order; add the inline `localStorage` theme preflight script; confirm there are no ES modules, remote URLs, fonts, scripts, or local `fetch()` calls.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure document logic, storage adapters, shared image validation, and application
bootstrap required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 [P] Implement `assets/js/utils.js`: `crypto.randomUUID()` with a `getRandomValues` fallback, debounce, HTML escaping, safe filename sanitization (no `/ \ : * ? " < > |`, no leading/trailing dot or space, no `.`/`..`), date formatting, MIME helpers, and guarded CommonJS export for Node tests.
- [x] T009 [P] Implement `assets/js/markdown.js`: Marker detection for exactly `none`, `#`, `##`, `###`, `-`, `1.`, `>`, `.` plus one space; Markdown line parsing; the canonical serializer; and reading order by `row = Math.round(y / 24)`, then `x`, then `seq`, then `id`, including same-band blocks whose `y` differs by less than 24 px. Preserve `leadingBlankLines`, `blankLinesAfter`, `trailingBlankLines`, and `trailingNewline`; normalize BOM/CRLF/CR to LF; emit no coordinates, title, or metadata.
- [x] T010 [P] Implement `assets/js/model.js`: `Library`, `PromptDocument`, `TextBlock`, `ImageBlock`, `ImageAsset`, `WorkspacePreferences`, and `Composer` factories; schema validation (title max 200, safe `.md` file name, unique ids, `x/y >= 0`, `blankLinesAfter >= 0`, supported markers/MIME types); dirty tracking; and the blank-line transfer rule when an emptied block is removed.
- [x] T011 [P] Implement `assets/js/storage.js`: IndexedDB `prompter-v1` stores `documents`, `assets`, `meta`; Blob write/read probe; localStorage fallback with data-URL images and quota checks; memory fallback; schema version `1`; corrupt-data isolation under `prompter.corrupt.<timestamp>`; last-document metadata; and a clear-library operation that removes documents/assets/file targets but keeps preferences.
- [x] T012 [P] Implement image helpers in `assets/js/files.js`: allow only `image/png`, `image/jpeg`, `image/gif`, and `image/webp`; decode and read natural dimensions; preserve original bytes; assign unique relative basenames with `-2`, `-3`, ... suffixes; default `alt` to the original file name; reject SVG, corrupt files, and storage failures without mutating the document.
- [x] T013 [P] Add `tests/unit/markdown.test.js` covering Marker extraction with/without the required space, marker-only lines, exact serialization, row bucketing (including same-band blocks with different `y`), tie-breaks, blank-line counts, final-newline behavior, BOM/CRLF normalization, and code/table lines; run with `node --test tests/unit/*.test.js`.
- [x] T014 [P] Add `tests/unit/model.test.js` covering every factory default, validation boundary (200-character title, `x/y`, blank counts, invalid markers/MIME types), unique ids, dirty transitions, blank-line transfer, and empty-document behavior.
- [x] T015 [P] Add `tests/unit/file-helpers.test.js` covering filename sanitization, traversal rejection, unique image naming, MIME allowlist, alt fallback, and relative-reference matching.
- [x] T016 Implement `assets/js/app.js` bootstrap: `window.Prompter` namespace, ordered module initialization, storage probe, empty workspace, dirty/status state, toast and live-region helpers, global error handling, and a non-blocking storage-warning banner in the directory with details and a dismiss action. Add hooks that later stories extend without a router or framework.
- [x] T017 Create `tests/browser/harness.html` and `tests/browser/harness.js` to load the same classic scripts from `file://`, run assertions, and render a visible `PASS`/`FAIL` summary with counts; include the initial bootstrap smoke check.

**Checkpoint**: `node --test tests/unit/*.test.js` passes, and the `file://` harness reports PASS.

---

## Phase 3: User Story 1 - Author prompts as draggable Markdown blocks (Priority: P1) 🎯 MVP

**Goal**: A blank document opened from the visible File > New action supports one composer,
Marker selection/detection, block creation, "+" insertion, edit/cancel/remove, free 2D dragging
with clamping, keyboard movement, image insertion/paste/removal, and in-session retention of
layout and images.

**Independent Test**: From the File menu, choose New to open a blank document; create several
text blocks with different Markers, insert and paste images, move blocks, and edit one block;
confirm content, images, positions, and derived reading order are retained in the current
session. Separately reload without saving and confirm the unsaved draft is not restored.

### Tests for User Story 1

> Write these checks first and confirm they fail before the editor implementation.

- [x] T018 [US1] Extend `tests/browser/harness.js` with US1 checks for the visible File > New action, the initial composer, typed/selected Markers, "+" insertion and image insertion/paste (including overlap shift), Enter/Escape editing, empty-block removal, 24 px row-band reading order (including near-aligned blocks), drag clamping, and keyboard movement announcements.

### Implementation for User Story 1

- [x] T019 [US1] Implement `assets/js/editor.js` canvas rendering for text and image blocks, selection state, z-order, DOM order matching reading order, and scrollable canvas sizing; add the blank-document workspace path in `assets/js/app.js` and wire the minimal visible File > New action needed for US1 to create an unsaved `Untitled` document with one composer. The remaining File-menu items (Open, Save, Save As) and full menu behavior are completed in US2; Insert Image is added in T026.
- [x] T020 [US1] Implement the initial and "+"-inserted composer in `assets/js/editor.js`: one active composer, Marker control on the left, default Marker from preferences, live detection label, typed-prefix precedence, Enter commit, empty Enter no-op, Escape behavior, and one-composer rule.
- [x] T021 [US1] Implement block editing in `assets/js/editor.js`: double-click/double-tap or Enter/F2 to edit, Enter commits, Escape restores, outside click commits, Marker extraction happens once, empty text removes the block with blank-line transfer, and removing the last block restores the initial composer.
- [x] T022 [US1] Implement the lower-left "+" control on every text and image block in `assets/js/editor.js`, inserting one composer directly below the source at the source `x`, shifting lower overlapping blocks down by the minimum amount needed to preserve reading order, and selecting the committed block. Expose the placement rule as the shared insertion helper used by T026 and T027.
- [x] T023 [US1] Implement pointer dragging in `assets/js/editor.js` with Pointer Events, pointer capture, `requestAnimationFrame`, transform during drag, commit on pointerup, full-box clamping, raised selected block, and dirty marking only when the position changes.
- [x] T024 [US1] Implement keyboard movement in `assets/js/editor.js`: Alt+Arrow by 24 px, Alt+Shift+Arrow by 1 px, clamping, and polite live-region announcements of row/column.
- [x] T025 [US1] Implement image block display in `assets/js/editor.js`: object-URL rendering from stored Blobs, aspect-ratio scaling to canvas width, original bytes untouched, alt text from the file name, remove control, missing-image placeholder, and the same select/drag/"+" behavior.
- [x] T026 [US1] Implement the Insert Image action in `assets/js/files.js` and expose a single `insertImagesFromPicker()` handler in `assets/js/app.js`: multi-select picker, all-or-nothing validation and storage, insertion below the selected/edited block or after the last block, shifting lower overlapping blocks down as needed via the T022 placement helper, and rollback on any failure. Add the minimal File > Insert Image menu item needed by US1; T042 integrates it into the complete File menu.
- [x] T027 [US1] Implement paste handling in `assets/js/clipboard.js`: read `clipboardData.items` (fallback to files), all-or-nothing image validation, text lines before images in reading order, image insertion below the edited block without leaving edit mode, shifting lower overlapping blocks down as needed via the T022 placement helper, ignore clipboard text in edit mode, and ignore paste while a modal is open.
- [x] T028 [US1] Implement local persistence plumbing through `assets/js/storage.js` for documents, block geometry, markers, text, blank-line fields, and assets; expose save/load APIs used by US2 Save and US4 last-document restore. Keep unsaved session state in memory only; do not promise draft recovery across reloads. Keep the session usable when storage is in localStorage or memory mode, and surface the active storage mode and reason to the warning banner.
- [x] T029 [US1] Add editor, composer, block, image, touch-handle, and canvas styles to `assets/css/app.css`, including `touch-action: none` only on drag handles, long-line wrapping, block clamping at narrow widths, and no horizontal page scrolling at 360 px.
- [x] T030 [US1] Add editor accessibility in `assets/js/editor.js`: blocks focusable in reading order, accessible labels, selected/editing state exposed, labeled Marker and "+" controls, visible focus, and arrow/Enter/Escape operation without a pointer.
- [x] T031 [US1] Run `tests/browser/harness.js` and quickstart scenarios 1–4 and 7; fix defects in `assets/js/editor.js` until block authoring, markers, edit/remove, drag/keyboard movement, in-session layout retention, images, and unsaved-draft non-restoration pass independently.

**Checkpoint**: US1 is the MVP and must work from `file://` before starting US2.

---

## Phase 4: User Story 2 - Manage Markdown files from the header (Priority: P1)

**Goal**: New, Open, Save, Save As, and Insert Image work from the File menu; Markdown and
related images round-trip; unsaved changes are protected; failures never discard content.

**Independent Test**: Open a Markdown fixture with its images, edit a block, choose Save, and
Save As a second document; reopen both and confirm content, Markers, and images are preserved.
Layout restoration after reload is verified in US4.

**Dependency**: Requires US1, which supplies the editor and image blocks.

### Tests for User Story 2

- [x] T032 [US2] Add `tests/unit/file-io.test.js` for Markdown parsing into blocks, source-order placement, relative/`./`/URL-encoded image matching, data-URL decoding, remote/absolute references staying literal, and safe Markdown/image filenames; confirm the new checks fail before implementation.

### Implementation for User Story 2

- [x] T033 [US2] Implement File > Open in `assets/js/files.js`: hidden multi-file input accepting one `.md`/`.markdown` plus PNG/JPEG/GIF/WebP; reject zero or multiple Markdown files; read UTF-8; preserve picker cancel; and leave the current document unchanged on every error.
- [x] T034 [US2] Implement Open conversion in `assets/js/files.js` and `assets/js/model.js`: every non-empty line becomes a text or image block, recognized Markers are extracted, blank-line separators are retained, blocks start in one source-order column, the title is derived from the file name, and the document is added to the directory clean.
- [x] T035 [US2] Resolve Open images in `assets/js/files.js`: match relative references case-insensitively by normalized path then basename, decode data-URL images into assets, keep unmatched/remote/absolute/SVG references as literal text, warn in Preview, and keep parsed content when image storage is session-only.
- [x] T036 [US2] Implement direct-write Save in `assets/js/files.js`: request/retain a directory handle, ask for a Markdown basename, detect conflicts against files not owned by the document, write images first and Markdown last, keep the document dirty on any failure, and report the exact failed file.
- [x] T037 [US2] Implement the download fallback in `assets/js/files.js`: download images first and Markdown last using document file names, warn that files must stay together and keep their names, explain multiple-download blocking, and keep the local library record as the editable copy.
- [x] T038 [US2] Implement Save As in `assets/js/files.js`: ask for a new name/location, create a new document id plus directory entry, duplicate assets and file ownership, write new files, leave the original document/files unchanged, and make the new document current and clean.
- [x] T039 [US2] Implement file naming and overwrite rules in `assets/js/files.js` and `assets/js/utils.js`: sanitize Markdown basenames, append `.md` once, fall back to `untitled.md`, prevent path traversal, preserve Unicode, and never silently overwrite a file the document does not own.
- [x] T040 [US2] Implement the Save/Discard/Cancel coordinator in `assets/js/app.js` for New, Open, and document switching; Save must complete before continuing, Discard continues, Cancel preserves the current document, and failures keep the dialog/current content intact.
- [x] T041 [US2] Implement dirty/status feedback and the `beforeunload` native confirmation in `assets/js/app.js`; in-app navigation uses the three-way dialog, while tab close/reload uses the browser's native leave prompt as clarified.
- [x] T042 [US2] Complete the File menu in `assets/js/app.js`: add Open, Save, and Save As; keep the US1 New action and the T026 Insert Image handler; disable Save/Save As/Insert Image when no document exists; keep New/Open available; handle menu keyboard navigation, focus return, busy states, picker cancel, and all file errors. Do not duplicate the T026 picker/storage/insertion logic.
- [x] T043 [US2] Run the Open/Save/Save As round trip against `tests/fixtures/` and quickstart scenario 8; fix defects in `assets/js/files.js` until no non-empty line, Marker, blank-line separation, or associated image is lost.

**Checkpoint**: US1 and US2 both work independently; ordinary Markdown files remain portable.

---

## Phase 5: User Story 3 - Preview and copy rich prompt content (Priority: P2)

**Goal**: Preview renders the canonical Markdown without changing the document; Copy places
exact Markdown plus a rich HTML/image representation on the clipboard with reliable fallbacks.

**Independent Test**: Create a document with headings, lists, a quote, an image, a code block,
and a table; open/close Preview; copy into a rich-text target and a plain-text target; verify
the preview matches and the plain text is byte-identical to Save.

**Dependency**: Requires US1 for content and images; can proceed in parallel with US4 after
US2.

### Tests for User Story 3

- [x] T044 [P] [US3] Add `tests/unit/renderer.test.js` for headings, grouped lists with literal `<li value="N">`, quotes, images, fenced code, basic pipe tables, paragraphs, and escaped raw HTML; confirm it fails before implementation.
- [x] T045 [P] [US3] Add `tests/unit/clipboard.test.js` for `text/plain` byte equality with Save, HTML escaping, data-URL embedding, missing/remote image placeholders, omitted-image reporting, and empty-document rejection.

### Implementation for User Story 3

- [x] T046 [US3] Implement the Markdown renderer in `assets/js/preview.js` for the documented subset, using escaped text and local asset URLs; never render user HTML, never fetch remote images, and leave unsupported constructs literal.
- [x] T047 [US3] Implement the Preview `<dialog>` in `assets/js/preview.js` and `assets/js/app.js`: render current unsaved content, show missing-image warnings and an empty state, close by control/Escape, restore focus to Preview, and fall back to selectable raw Markdown on render failure.
- [x] T048 [US3] Implement the copy payload builder in `assets/js/clipboard.js`: canonical Markdown for `text/plain`, rendered HTML for `text/html` only when the document contains images, local images as data URLs, escaped text/alt text, and an `omittedImages` list; optionally add `text/markdown` only when supported.
- [x] T049 [US3] Implement Copy in `assets/js/clipboard.js`: async Clipboard with `ClipboardItem`, `execCommand('copy')` fallback with a one-time `copy` listener, and a manual-copy dialog with exact Markdown; clean up hidden DOM/listeners and never report false success.
- [x] T050 [US3] Wire Copy in `assets/js/app.js`: disable for an empty document, show success/omission/failure feedback, list missing images, and preserve exact Markdown text even when rich images are omitted.
- [x] T051 [US3] Create `tests/browser/paste-target.html` with plain-text and contenteditable targets for manual clipboard verification without third-party apps.
- [x] T052 [US3] Run quickstart scenarios 5–6 using `tests/browser/paste-target.html` plus a rich-text destination and a plain-text destination; fix preview rendering, clipboard fallbacks, focus return, and omission messaging in `assets/js/clipboard.js`.

**Checkpoint**: Preview, Save, and Copy all consume the same canonical Markdown string.

---

## Phase 6: User Story 4 - Find and reopen prompt documents (Priority: P2)

**Goal**: The directory lists saved documents newest-first, searches title/content/image names
case-insensitively, shows counts and empty states, and reopens documents with unsaved-change
protection and their saved layout and reading order.

**Independent Test**: Save documents with distinct titles and content, move blocks in one
document, search by title and content terms, clear the search, open a result, reload, and
reopen the moved document from the directory; confirm correct filtering, selection, editor
content, block positions, and Markdown reading order.

**Dependency**: Requires US2 for saved documents; can proceed in parallel with US3 after US2.

### Tests for User Story 4

- [x] T053 [P] [US4] Add `tests/unit/search.test.js` for literal case-insensitive matching, leading/trailing whitespace trimming, Traditional Chinese/English/mixed text, punctuation, image file names, empty query, and no-match behavior; confirm it fails before implementation.

### Implementation for User Story 4

- [x] T054 [US4] Implement `assets/js/search.js`: lowercase in-memory index over title, text blocks, image alt text, and image file names; literal `includes` filtering; 80 ms debounce; rebuild on library changes; and a linear-scan fallback.
- [x] T055 [US4] Implement directory rendering in `assets/js/app.js`: newest-first by `updatedAt`, title plus localized last-modified time, localized match count, selected item with `aria-current`, empty-library state with `新增文件`, no-results message, clear-search action, and DocumentFragment updates.
- [x] T056 [US4] Implement directory selection and document switching in `assets/js/app.js`: run the Save/Discard/Cancel gate when dirty, load the selected document and assets, mark it selected, restore layout, and keep the current document on cancel.
- [x] T057 [US4] Implement New/search interactions in `assets/js/app.js`: New clears an active search, a saved new document becomes visible, and an unsaved new document is not added to the directory.
- [x] T058 [US4] Implement last-document restore in `assets/js/app.js` and `assets/js/storage.js`: reopen the last document only when it still exists and is readable, without marking it dirty or bypassing storage warnings.
- [x] T059 [US4] Add directory drawer and search styles to `assets/css/app.css` and wiring in `assets/js/app.js`: labeled toggle with `aria-expanded`, off-canvas drawer plus overlay below 768 px, Escape closes and returns focus, and no horizontal scrolling at 360 px.
- [x] T060 [US4] Run quickstart scenario 10 with 5, 50, and 500 documents using `tests/browser/harness.js`; fix sorting, initial 500-document render, search latency, no-results, clear-search, selection, last-document restore, and saved-layout/reading-order restore defects in `assets/js/search.js` and `assets/js/app.js`.

**Checkpoint**: A returning user can find and reopen any locally saved document in under 10 seconds.

---

## Phase 7: User Story 5 - Personalize and configure the workspace (Priority: P3)

**Goal**: Style, light/dark mode, default Marker, alignment grid, clear-library, and version
information work and persist without affecting document content or disk files.

**Independent Test**: Change style, theme, default Marker, and grid; reload and confirm
retention; open settings, clear the library after confirming, and confirm the workspace is
empty, preferences remain, and saved files on disk are untouched.

**Dependency**: Requires only Phase 2; the header controls integrate with US1–US4 UI.

### Tests for User Story 5

- [x] T061 [P] [US5] Add `tests/unit/preferences.test.js` for defaults, valid/invalid values, system theme behavior, schema version, and persistence serialization.

### Implementation for User Story 5

- [x] T062 [US5] Implement the Settings dialog in `assets/js/settings.js`: default Marker, alignment-grid toggle, follow-system reset, clear-library action, version/storage-schema information, close control, immediate application, and persistence.
- [x] T063 [US5] Implement appearance controls in `assets/js/app.js` and `assets/js/settings.js`: 紙張/石墨 style selector, light/dark toggle, system-preference following via `matchMedia`, explicit-choice persistence, and independence of style and theme.
- [x] T064 [US5] Complete preference persistence in `assets/js/storage.js` and `assets/js/utils.js`: validate unknown/invalid values to defaults, apply theme/style preflight before first paint, and keep preferences out of clear-library.
- [x] T065 [US5] Implement Clear Library in `assets/js/settings.js`, `assets/js/storage.js`, and `assets/js/app.js`: explicit confirmation explaining local removal, destructive action styling, close the current document, clear IndexedDB/localStorage/memory records and file targets, keep preferences, never touch disk files, and report partial failures.
- [x] T066 [US5] Add the compact header at 360 px in `assets/css/app.css` and `assets/js/app.js`: compact icon buttons for File, directory, Preview, Copy, style, theme, and settings; hide non-essential labels; keep 44 px touch targets and all actions reachable without horizontal scrolling.
- [x] T067 [US5] Extend `tests/browser/harness.js` with settings persistence, default-Marker application, grid visibility, theme/style preflight, and clear-library checks that do not depend on real pickers.
- [x] T068 [US5] Run quickstart scenarios 11–12 and the settings checks in `tests/browser/harness.js`; fix persistence, preflight flash, grid, compact header, and clear-library defects in `assets/js/settings.js`.

**Checkpoint**: All five user stories work independently and together.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Harden correctness, security, accessibility, performance, and offline behavior
across all stories.

- [x] T069 Run the full golden-fixture round trip from `tests/fixtures/`: markers, marker-only lines, blank lines, CRLF/BOM, no final newline, unicode, trailing spaces, code, tables, data-URL images, unmatched images, and duplicate image basenames; fix any loss.
- [x] T070 Run `tests/browser/harness.html` from `file://` and require a full PASS; fix all DOM, storage, renderer, settings, search, and storage-warning banner failures.
- [x] T071 Audit security in `assets/js/`: escape all user text, never render raw HTML, never fetch remote images, sanitize filenames, reject traversal/absolute paths, avoid `eval`/`new Function`, and ensure no network requests.
- [x] T072 Verify performance targets in `assets/js/` and `assets/css/`: 500-document search under 300 ms, 500-document initial directory render under 1 s, 500-block preview under 1 s, image visibility under 1 s, and drag updates near 60 fps; optimize indexing, rendering, and object-URL caching as needed.
- [x] T073 Audit accessibility across `index.html` and `assets/js/`: accessible names, visible focus, keyboard-only create/edit/add/move/preview/copy/save, screen-reader order, live-region announcements, dialog focus, and reduced-motion behavior.
- [x] T074 Verify responsive layouts at 1280×720, 768 px, and 360×800 in `assets/css/`: no horizontal page scrolling, reachable header actions, directory drawer behavior, wrapped text, and scaled images.
- [x] T075 Verify offline operation in at least two supported browsers with networking disabled: open `index.html` from `file://`, author, insert/paste images, preview, copy, save, reopen, search, and change settings.
- [x] T076 Verify storage degradation in `assets/js/storage.js` and the quickstart steps: IndexedDB blocked (localStorage fallback), both blocked (memory mode with warning), quota failure (rollback with no document change), and corrupt payload (empty library with warning); confirm the non-blocking banner shows the active mode/reason, can be dismissed, and that unsaved edits are never silently discarded.
- [x] T077 Verify clipboard degradation in `assets/js/clipboard.js` and `tests/browser/paste-target.html`: async clipboard denied, `execCommand` path, manual-copy dialog, missing images, destination that strips images, and exact Markdown equality with Save.
- [x] T078 Update `specs/002-markdown-block-editor/checklists/requirements.md` and the quickstart acceptance checklist with final verification results and any recorded exceptions, including the native tab-close prompt limitation.
- [x] T079 Re-run the Constitution Check against `.specify/memory/constitution.md`: no server/build/install/network, classic scripts only, no ES modules/local `fetch()`, local storage only, deterministic copy-ready output, and no runtime dependencies.
- [x] T080 Complete the manual browser matrix in `quickstart.md` with Chrome as the required release gate and Firefox as the supplementary compatibility check, recording exact versions and pass/fail notes; Safari is outside the test scope.
- [x] T081 Add offline KaTeX 0.19.1 math rendering to Preview for `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`, including local fonts, multi-line display math, fenced-code exclusion, and automated coverage.
- [x] T082 Make composer and block-edit inputs auto-growing multi-line text areas: Shift+Enter inserts a line break, Enter commits, width grows up to the maximum before wrapping, and height grows to keep all lines visible.
- [x] T083 Include uncommitted composer and block-editor drafts in live Preview, refresh on input and Marker changes, and restore committed content on dismiss or cancel.
- [x] T084 Make Tab into a block's text area start editing directly, and make Tab to the title/Marker control open the Marker menu while keeping the Tab cycle and Escape behavior intact.
- [x] T085 Make Up/Down into an adjacent text block start editing and select all text on every edit entry path.
- [x] T086 Give plain Up/Down top priority while editing: commit the current block, continue to the adjacent item, and reopen a text destination in edit mode with all text selected.
- [x] T087 Open the live preview pane by default for new, opened, and restored documents, keep it closed after an explicit close, and preserve the state across tab switches.
- [x] T088 Split obvious Markdown lines into separate blocks when Enter commits a multi-line composer value: detect `#`, `##`, `###`, `-`, `1.`, `>`, and `.` at line starts, keep unmarked prose grouped, preserve blank-line separators, leave fenced code and plain multi-line text intact, and focus the next composer after the last block.
- [x] T089 Add collapsible sections ranked `#` > `##` > `###` > `-` > `1.` > `>` > `.` > unmarked content: show a chevron before the Marker for blocks with lower-ranked descendants, hide the section from the canvas without changing Save, Preview, Copy, or Markdown, restore nested states on expansion, skip hidden blocks in keyboard navigation, move the composer after a collapsed section, and move hidden descendants with the section when dragging or using the drag handle's Up/Down keys.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational; MVP.
- **US2 (Phase 4)**: Depends on US1 because opened documents are displayed and edited in the US1 canvas.
- **US3 (Phase 5)**: Depends on US1 for content/images and can run in parallel with US4 after US2.
- **US4 (Phase 6)**: Depends on US2 for saved documents and can run in parallel with US3.
- **US5 (Phase 7)**: Depends on Foundational and can be developed in parallel, but its final verification uses the US1–US4 UI.
- **Polish (Phase 8)**: Depends on all desired stories being complete.

### User Story Dependencies

| Story | Depends on | Can run in parallel with |
|-------|------------|--------------------------|
| US1 | Foundational | — |
| US2 | US1 | — |
| US3 | US1, US2 | US4 |
| US4 | US1, US2 | US3 |
| US5 | Foundational | US1–US4 development; final check after integration |

### Within Each User Story

- Story-specific checks are written before implementation where listed.
- Core model/render logic precedes UI wiring.
- Editor rendering precedes composer, editing, insertion, and dragging.
- File parsing precedes Save/Save As and directory integration.
- Renderer precedes Preview and Copy payloads.
- Search precedes directory filtering and last-document restore.
- Settings logic precedes clear-library and appearance verification.

### Parallel Opportunities

- Setup: T002–T006 touch independent style and fixture files.
- Foundational: T008–T012 touch independent modules; T013–T015 touch independent test files after their modules exist.
- US1: no parallel implementation tasks because `assets/js/editor.js` is the shared surface; CSS (T029) can be prepared alongside editor work.
- US2: T032 can start while US1 verification finishes; file I/O tasks are sequential because they share `assets/js/files.js`.
- US3: T044 and T045 are parallel; renderer (T046) and payload builder (T048) touch different files and can be parallel.
- US4: search implementation and tests touch distinct files; directory UI is sequential in `assets/js/app.js`.
- US5: preferences tests (T061) and settings markup/logic can proceed in parallel with CSS (T066) preparation.
- Polish: T071, T073, T074, and T075 touch different concerns and can be assigned in parallel after T070.

---

## Parallel Example: Foundational Phase

```bash
# Independent modules:
Task: "T008 Implement assets/js/utils.js"
Task: "T009 Implement assets/js/markdown.js"
Task: "T010 Implement assets/js/model.js"
Task: "T011 Implement assets/js/storage.js"
Task: "T012 Implement image helpers in assets/js/files.js"

# Independent tests after the modules exist:
Task: "T013 Add tests/unit/markdown.test.js"
Task: "T014 Add tests/unit/model.test.js"
Task: "T015 Add tests/unit/file-helpers.test.js"
```

## Parallel Example: US3 and US4

```bash
# After US2, the preview/copy and directory/search tracks can run concurrently.
Task: "T044 Add tests/unit/renderer.test.js"
Task: "T053 Add tests/unit/search.test.js"

# Different implementation files:
Task: "T046 Implement the renderer in assets/js/preview.js"
Task: "T054 Implement assets/js/search.js"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: US1.
4. **STOP and VALIDATE**: Run the US1 harness and quickstart scenarios 1–4 and 7.
5. Open `index.html` from `file://` and confirm authoring, images, drag, keyboard movement, and reload restoration.

### Incremental Delivery

1. Setup + Foundational → static shell and pure logic ready.
2. US1 → block authoring MVP.
3. US2 → portable Markdown file ownership.
4. US3 and US4 → preview/copy and reusable library, in parallel if staffed.
5. US5 → appearance and workspace controls.
6. Polish → security, accessibility, performance, offline, and browser matrix.

### Parallel Team Strategy

1. One developer completes Setup + Foundational.
2. After Foundational:
   - Developer A: US1, then US2 (required chain).
   - Developer B: US5 appearance/settings, then help with US3.
3. After US2:
   - Developer A: US4 directory/search.
   - Developer B: US3 preview/copy.
4. Join for Phase 8 polish and the browser matrix.

---

## Notes

- `[P]` applies only when tasks touch different files and have no incomplete dependency.
- All runtime paths are local and classic-script based; tests are development-only.
- Tests must pass before moving past a story checkpoint.
- Clipboard and File System Access picker verification requires real user gestures; use the
  manual steps in `quickstart.md`.
- Commit after each task or logical group only when the user requests a commit.
- Do not add npm packages, a bundler, a server, a service worker, ES modules, or remote assets.
