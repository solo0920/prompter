# Implementation Plan: Markdown Block Editor

**Branch**: `002-markdown-block-editor` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-markdown-block-editor/spec.md`

## Summary

Prompter's homepage is a static, `file://`-openable Markdown block editor. Users author a
prompt as free-positioned text and image blocks, drag them on a 2D canvas, and the app derives
a deterministic Markdown document (24 px row bands top-to-bottom, then left-to-right within
each band). A searchable local library, File menu (New, Open, Save, Save As, Insert Image),
rendered Preview, mixed text-and-image Copy, themes, settings, and local persistence complete
the workspace.

Technical approach: HTML, CSS, and ES2020 classic scripts with no server, build step, or
network. KaTeX 0.19.1 is vendored locally for math rendering. One canonical serializer feeds
Preview, Save, and Copy. File I/O uses a multi-file `<input type="file">` for Open and the File System Access API when available for
directory writes, with per-file downloads as the fallback. Persistence uses IndexedDB for
documents and image Blobs, localStorage for preferences and as a fallback, and memory as the
last resort. Clipboard uses the async Clipboard API with an `execCommand('copy')` fallback.
Testing uses Node's built-in test runner for pure logic plus a `file://` browser harness and a
manual browser matrix.

## Technical Context

**Language/Version**: HTML5, CSS3, ES2020 JavaScript delivered as classic scripts (no ES modules)

**Primary Dependencies**: None at runtime except the locally vendored KaTeX 0.19.1
distribution (MIT) used for Preview math. Development-only: Node.js 26 built-in test runner
(`node:test`) and installed system browsers. No npm install, bundler, build step, or network.

**Storage**: Browser-local only. IndexedDB database `prompter-v1` (stores `documents`,
`assets`, `meta`) for documents and image Blobs; localStorage for preferences and as a
document fallback; in-memory fallback when both are unavailable. No remote persistence.

**Testing**: `node --test tests/unit/*.test.js` for pure model, serializer, ordering, search,
renderer, clipboard payload, file-helper, and preference logic; `tests/browser/harness.html`
opened from `file://` for DOM, storage, and renderer checks; manual core-flow matrix in
Chrome as the required release gate, with Firefox as the optional compatibility check.
Safari is outside the test scope.

**Target Platform**: Static web app opened directly from `file://` on desktop, responsive down
to 360 px. Chrome is the primary supported browser; Firefox is the secondary compatibility
target.

**Project Type**: Single-project static web application.

**Performance Goals**: Search results in under 300 ms for 500 documents; Preview in under 1 s
for 500 blocks; inserted or pasted image visible in under 1 s; drag updates at 60 fps; initial
directory render in under 1 s for 500 documents on a mid-range laptop.

**Constraints**: No server, build step, package installation, network, CDN, remote font, ES
module, service worker, or local `fetch()` at runtime. UTF-8 everywhere; Traditional Chinese
UI. File System Access and async Clipboard are progressive enhancements and every flow needs
a `file://`-safe fallback. Browser storage on `file://` is implementation-defined, so
capability probing, quota handling, and non-blocking warnings are mandatory.

**Scale/Scope**: Single user and device; up to 500 documents; up to 500 blocks per document;
image volume bounded by browser storage quota; one open document at a time; flat library;
desktop-first with a 360 px responsive layout.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
|-----------|------|--------|
| I. Static-First, File-Openable Delivery | Entry page runs from `file://` with no server, build step, package install, or network; all runtime assets are local; classic scripts only; no ES modules, service worker, or local `fetch()`. | PASS |
| II. Standardized Prompt Contract | This feature adds no prompt template or generator and changes no contract; see the spec's `Prompt Contract Impact & Verification` section. It is a verbatim authoring and export surface: the canonical serializer adds no filler, rewrites, or invented sections. Future generation/template features must add and version the contract. | PASS (authoring-only scope) |
| III. AI-Legible, Copy-Ready Output | `text/plain` Copy is byte-identical to Save; output is deterministic for identical blocks; missing images produce explicit placeholders or warnings instead of invented content. | PASS |
| IV. Offline and Self-Contained | Zero runtime dependencies, system font stacks, no network calls; browser storage only with graceful degradation; core flow verified offline in at least two supported browsers. | PASS |
| V. Minimal, Testable Implementation | Vanilla HTML/CSS/JS; a small in-house line-oriented serializer and renderer instead of a runtime library; dependency-free Node tests; every flow verifiable from `file://` by documented steps. | PASS |

**Post-Design Re-check**: PASS. The design in `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md` introduces no server, build requirement, remote asset, module import, local
`fetch()`, or runtime dependency. The browser tab-close limitation below is documented and
does not violate the constitution.

**Final Implementation Re-check (2026-10-29)**: PASS. The shipped app remains classic scripts
only, opens from `file://`, and uses no server, build step, package install, ES module,
service worker, local `fetch()`, telemetry, remote asset, or runtime dependency downloaded at
runtime. KaTeX 0.19.1 is vendored locally as a static asset for math rendering. Storage is
browser-local and degrades through IndexedDB, localStorage, and session memory; preferences
survive clear-library while disk files are untouched. Copy `text/plain` is byte-identical to
Save via the shared canonical serializer; output is deterministic. Automated static checks
reject network and dynamic-code primitives, and offline harness runs pass in Chrome and
Firefox. The documented manual-only exceptions (external rich-text destinations, physical
touch, screen reader, and OS pickers) do not violate a principle; the required fallbacks
exist. Safari is outside the automated and manual acceptance scope.

## Platform Constraints and Deviations

- **Tab-close confirmation**: browsers only permit a native Stay/Leave confirmation from
  `beforeunload`; a custom Save/Discard/Cancel dialog is impossible when the tab is closed or
  reloaded. In-app actions (New, Open, document switch) use the required three-way dialog.
  On tab close the native prompt is used, and the last explicit save remains intact.
  FR-015 and SC-009 already scope the three-way choice to in-app navigation and retain the
  native prompt for page unload. This is a browser limitation, not a constitution violation.
- **File System Access API**: available in Chromium browsers but not Firefox, and the picker
  may still fail under `file://`. Every save path catches that failure and falls back to one
  download per file. The browser may ask the user to allow multiple downloads.
- **Clipboard**: async Clipboard writes require a secure context and user activation and may
  be denied. `file://` is a secure context in Chrome, but the app always provides an
  `execCommand('copy')` fallback and a manual-copy dialog as the final fallback.
- **Browser storage on `file://`**: IndexedDB and localStorage behavior is not guaranteed and
  can be restricted by browser policy. The app probes both, handles quota errors, and warns
  without blocking the current session. Save-to-disk remains the durable path.
- **Rich image paste fidelity**: rich Copy embeds local images as data URLs in `text/html`.
  Some destination applications strip them. The app always places exact Markdown as
  `text/plain` and reports when images were omitted.

## Design Overview

### Runtime architecture

The app is one static page, `index.html`, with local CSS and classic JavaScript files loaded in
dependency order using `<script defer>`. Each file attaches a namespace to
`window.Prompter`; pure modules also export through a guarded CommonJS wrapper so the same
source can be unit-tested in Node without a build step. There is no router, no framework, and
no network access.

Layers:

- `utils.js`: UUID fallback, debounce, DOM helpers, date formatting, sanitization, MIME and
  file helpers, escaping.
- `markdown.js`: line parser, canonical serializer, reading-order helper, minimal renderer.
- `model.js`: document, block, image-asset, and preference factories, validation, dirty
  tracking, and document state transitions.
- `storage.js`: IndexedDB adapter, localStorage fallback, memory fallback, capability
  probes, quota handling, schema migration, corrupt-data isolation.
- `search.js`: normalized search index and literal partial matching.
- `files.js`: Open, Insert Image, Save, Save As, directory handles, download fallback, image
  naming, conflict handling.
- `clipboard.js`: Paste handler, `text/plain` Markdown plus `text/html` rich copy when images
  are present, async and fallback copy paths, manual-copy dialog.
- `preview.js`: live right-side preview, rendered Markdown including local KaTeX math,
  image resolution, refresh scheduling, and placeholder handling.
- `assets/vendor/katex/`: vendored KaTeX 0.19.1 JavaScript, stylesheet, fonts, and MIT
  license, loaded locally so Preview math works from `file://` with no network.
- `editor.js`: composer, marker detection, block editing, dragging, keyboard movement,
  selection, and canvas rendering.
- `settings.js`: appearance, default Marker, grid, clear-library confirmation, version info.
- `app.js`: bootstrap, document tabs and per-tab session state, right-preview coordination,
  header actions, directory, unsaved-changes coordination, toasts, warnings, and focus
  management.

### Authoring model

- A document is an ordered set of absolutely positioned text and image blocks. Text blocks
  hold one or more lines, a Marker, `x`, `y`, stacking order, creation sequence, and blank-line
  count after the block; image blocks hold an asset reference, alternative text, and the same
  layout fields.
- A blank document shows one composer at the top-left with the Marker control on its left.
  Enter commits a non-empty composer into a block and removes the composer; Shift+Enter
  inserts a line break. The composer grows wider with its content up to a maximum and grows
  taller as text wraps. The new block's "+" control creates the next composer directly below
  it. Escape dismisses a composer opened with "+" and leaves the initial blank-document
  composer in place.
- The Marker menu offers None, `#`, `##`, `###`, `-`, `1.`, `>`, and `.`. Typing a recognised
  Marker followed by one space shows a live detection label; on commit the prefix is stored
  once as the Marker and removed from the text. A typed prefix wins over a menu selection.
- Double-click or Enter/F2 on a selected text block enters edit mode. Enter commits,
  Shift+Enter inserts a line break, Escape cancels, and clicking outside commits. The editor
  grows with its content like the composer. Clearing the text removes the block and transfers
  its blank-line separation to the preceding block or document leading blanks. If the last
  block is removed, the blank-document composer reappears.
- Every block exposes a small lower-left "+" control. Image blocks also expose their image,
  a file-name-based alternative text, a remove control, and the same "+" and drag behavior.
- Dragging uses Pointer Events and `requestAnimationFrame`, clamps the block inside the canvas,
  and raises the selected block. Alt+Arrow moves the selected block by one grid step;
  Alt+Shift+Arrow moves it by one pixel. Moves are announced through a polite live region.

### Canonical Markdown pipeline

`blocks -> readingOrder -> generateMarkdown -> { Preview, Save, Copy }`

There is exactly one serializer. Preview renders the generated Markdown string, Save writes it,
and `text/plain` Copy places the same string on the clipboard. This guarantees Save, Preview,
and Copy cannot drift.

Reading order is derived, never manually edited:

1. Compute `row = Math.round(y / 24)` for each block.
2. Sort by `row`, then `x`, then creation sequence, then id for exact ties.
3. The same order is used for DOM order, Preview, Save, Copy, and directory search content.

This 24 px row-band definition is normative and matches spec FR-026; blocks within one band are
ordered by `x` even when their `y` values differ by less than 24 px.

The serializer preserves leading blank lines, inter-block blank-line counts, trailing blank
lines, and the source trailing-newline state. It normalizes UTF-8 BOM away and uses LF line
endings. Recognised markers are emitted once; image blocks emit one
`![alt](relative-file-name)` line. Unmatched image references stay literal text lines. Marker-
only lines from an opened file are preserved as literal text blocks so a round trip never
silently deletes a line.

### Canvas and interaction

The center area is a vertically scrollable workspace with an absolutely positioned canvas.
Text block width is content-driven with a maximum, so long lines grow the input and wrap
visually; explicit Shift+Enter line breaks within a block serialize as consecutive Markdown
lines. Image blocks scale to fit the available width while preserving aspect ratio
and original bytes. The canvas height is the viewport height or the lowest block bottom plus a
working margin.

Drag uses pointer capture and a transform during the gesture; committed `x`/`y` values update
on pointerup. Blocks stay within `0..canvasWidth-blockWidth` and
`0..canvasHeight-blockHeight`. Overlap is allowed; the selected block gets the highest `z`.
A light 24 px alignment grid can be shown from settings and is off by default.

Insertion places a new composer below its source block and shifts lower overlapping blocks
only when necessary. Image insertion from a file or paste is placed below the selected or
edited block, with lower overlapping blocks shifted down to keep text-before-image reading
order. If no block is selected, insertion follows the last block in reading order.

### Library and persistence

The startup sequence applies preferences synchronously to avoid a theme flash, probes storage,
loads the library, and reopens the last opened document when it still exists. The directory is
sorted by `updatedAt` descending, shows title and localized last-modified time, and supports
literal case-insensitive search over title, block text, image alternative text, and image file
names. Search is debounced, pre-indexed in memory, and restores the full list when cleared.

Storage modes:

- **IndexedDB**: preferred. Stores document JSON, image Blobs, and metadata. A small Blob
  write/read probe confirms asset support before selecting this mode.
- **localStorage**: fallback. Documents are stored as a versioned JSON snapshot, images as
  data URLs, with quota checks. Preferences always use localStorage first for synchronous
  theme application, mirrored to IndexedDB metadata when available.
- **Memory**: last resort. The session remains usable, and a non-blocking warning explains that
  reload persistence is unavailable.

Writes validate the document first, use a schema version, and isolate unreadable payloads
instead of overwriting them blindly. If stored data cannot be read, the app opens with an empty
library and a warning. Clear-library removes local documents, layouts, assets, and saved file
targets but never files already saved to disk and never preferences.

### File I/O

- **Open**: a hidden multi-file input accepts one `.md`/`.markdown` file plus optional PNG,
  JPEG, GIF, and WebP files. Exactly one Markdown file is required. Unsupported, remote, or
  unresolved image references remain literal text and are flagged by Preview. Data-URL images
  become image assets and are written as relative files on the next save.
- **Save**: writes images first and the Markdown file last when using the File System Access
  API, so a saved Markdown file never points at images that were not written. Failures report
  the exact file and leave the document open and editable. Without direct writing, each file
  is downloaded separately and the user is told to keep the files together without renaming.
- **Save As**: asks for a new file name, then a directory when available. A conflict dialog
  prevents overwriting unrelated files. The original document and its files remain unchanged;
  the new document becomes current and is added to the directory.
- **Insert Image**: opens a picker for PNG, JPEG, GIF, and WebP, validates that the image
  decodes, stores the original Blob, and assigns a unique relative file name. SVG and other
  formats are rejected without changing the document.
- **Downloads**: when direct multi-file writing is unavailable, the Markdown and each image are
  downloaded separately. Browser-renamed downloads may break relative references; the user is
  warned and can use Save As again after allowing downloads.

### Preview and Copy

Preview is a live right-side pane that renders the canonical Markdown, including headings,
lists, quotes, images, plain text, fenced code, basic pipe tables, and KaTeX math. While the
composer has text or a block is being edited, the uncommitted draft is substituted at its
sequence position so Preview updates as the user types; dismissing or canceling restores the
committed content. Math supports `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` delimiters,
including multi-line display math and common AMS environments; math inside fenced code stays
literal. Raw HTML is escaped, other unsupported constructs remain literal text, and remote
images are never fetched. Missing images show their alternative text or a placeholder plus a
warning. Closing the pane returns focus to the preview toggle.

Copy builds:

- `text/plain`: the canonical Markdown, byte-for-byte identical to Save.
- `text/html`: the rendered Markdown with local images embedded as data URLs, plus escaped
  text and alternative text for missing images.

The async Clipboard API is tried first. On failure or unavailability, a hidden contenteditable
plus `document.execCommand('copy')` writes both flavors. If that also fails, a manual-copy
dialog shows the exact Markdown for selection. If images cannot be included, the Markdown text
is still copied and the user is told that images were omitted. Copy is disabled for an empty
document.

Paste uses the `paste` event's `clipboardData` so it works without a permission prompt. Text is
split into one block per non-empty line and images become image blocks. Mixed content creates
text blocks before image blocks in reading order. Pasting while editing a text block inserts
images directly below that block without leaving edit mode; clipboard text is ignored in that
case to avoid interrupting the edit.

### Appearance, settings, and accessibility

Two visual styles, 紙張 (Paper) and 石墨 (Graphite), work independently of light/dark mode.
The device preference is used until the user toggles light/dark; settings includes a
follow-system reset. The theme and style are applied by an inline preflight script from
localStorage before first paint, then kept in sync with `matchMedia` when following the system.
The settings panel provides default Marker, grid visibility, clear-local-library with
confirmation, and version information (app version and storage schema version).

All controls are native buttons, inputs, menus, and dialogs with accessible names, visible
focus rings, and keyboard operation. The directory is a navigation landmark; the canvas is a
list with blocks in reading order; status and errors use polite/assertive live regions. Native
`<dialog>` supplies focus containment and Escape handling. At 360 px the directory becomes a
labeled off-canvas drawer and header actions use compact icons, with no horizontal page
scrolling. Touch dragging uses a visible handle so vertical scrolling remains usable.

### Failure handling, security, and performance

- Storage quota, corrupt data, unsupported images, decode failures, file write failures, and
  clipboard failures all produce clear messages and leave the document unchanged or editable.
- All user content is escaped; raw HTML is never rendered; no network requests are made;
  image references are relative and cannot traverse directories; filenames are sanitized.
- The pure Markdown, ordering, search, and model layers are dependency-free and tested in Node.
  DOM behavior, storage adapters, and clipboard fallbacks are checked from the `file://` browser
  harness and the manual matrix.

## Project Structure

### Documentation (this feature)

```text
specs/002-markdown-block-editor/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities and storage layout
├── quickstart.md        # Phase 1 validation guide
├── contracts/
│   ├── markdown-output.md
│   ├── file-io.md
│   ├── clipboard.md
│   └── ui-contract.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
index.html
assets/
├── css/
│   ├── base.css
│   ├── themes.css
│   └── app.css
└── js/
    ├── utils.js
    ├── markdown.js
    ├── model.js
    ├── storage.js
    ├── search.js
    ├── files.js
    ├── clipboard.js
    ├── preview.js
    ├── editor.js
    ├── settings.js
    └── app.js
tests/
├── unit/
│   ├── markdown.test.js
│   ├── model.test.js
│   ├── search.test.js
│   ├── renderer.test.js
│   ├── clipboard.test.js
│   ├── file-io.test.js
│   ├── file-helpers.test.js
│   └── preferences.test.js
├── fixtures/
│   ├── *.md
│   ├── *.expected.md
│   └── images/          # tiny 1×1 PNG/JPEG/GIF/WebP fixtures
└── browser/
    ├── harness.html
    ├── harness.js
    └── paste-target.html
```

**Structure Decision**: Single static project at the repository root. `index.html` is the
deliverable entry point and loads only local classic scripts and CSS. `tests/` is development
only and is never required at runtime. No backend, package manifest, or build output is
introduced.

## Complexity Tracking

No constitution violations. The browser tab-close limitation is a platform constraint recorded
above and is recommended for a small spec clarification; it does not require a constitution
waiver.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `file://` storage is blocked or evicted | Probe IndexedDB and localStorage, warn non-blockingly, keep the session usable, and treat Save-to-disk as the durable path. |
| Clipboard image paste is stripped by a destination | Always include exact Markdown as `text/plain`, report omitted images, test two rich destinations plus a plain-text destination. |
| Multi-file downloads are blocked or renamed | Attempt directory writes first, download images before Markdown, and warn that files must stay together and keep their names. |
| Round-trip data loss | Golden fixtures cover blank lines, CRLF/BOM, marker-only lines, trailing spaces, unicode, images, code fences, and basic tables; unmatched lines stay literal text. |
| Ambiguous 2D reading order | Deterministic row bucketing with `x`, creation sequence, and id tie-breaks; the same function feeds DOM, Preview, Save, and Copy. |
| Large libraries or documents | In-memory search index, debounced filtering, DocumentFragment rendering, transform-based drag, and object-URL caching. |
| Raw HTML or filename injection | Escape all text, never render user HTML, sanitize filenames, reject path traversal, and never fetch remote images. |
| Browser API drift | Capability probes at runtime, feature detection rather than user-agent checks, and a documented fallback for every optional API. |

## Implementation Sequence

1. Static shell, header, responsive layout, themes, dialogs, and toast/live-region plumbing.
2. Model, Marker detection, canonical serializer, reading-order algorithm, and unit tests.
3. Storage adapters, library directory, search, last-document restore, and clear-library.
4. Composer, block editing, "+" insertion, drag/keyboard movement, and canvas rendering.
5. Image insertion, paste, Open, Save, Save As, download fallback, and conflict handling.
6. Preview dialog, rich Copy, clipboard fallbacks, and image resolution.
7. Settings, appearance persistence, accessibility pass, 360 px pass, and browser matrix.
8. Golden fixtures, browser harness, offline verification, and final spec checklist update.

## Traceability

| Spec area | Primary artifacts |
|-----------|-------------------|
| US1 authoring, markers, "+", edit, drag, images | `contracts/ui-contract.md`, `contracts/markdown-output.md`, `data-model.md` |
| US2 New/Open/Save/Save As, unsaved changes | `contracts/file-io.md`, `data-model.md` |
| US3 Preview and rich Copy | `contracts/clipboard.md`, `contracts/markdown-output.md` |
| US4 directory and search | `data-model.md`, `quickstart.md` |
| US5 appearance, settings, clear library | `contracts/ui-contract.md`, `data-model.md` |
| FR-001..FR-045 and SC-001..SC-016 | `quickstart.md` verification matrix and unit/browser tests |

## Phase Outputs

- Phase 0: [`research.md`](./research.md)
- Phase 1: [`data-model.md`](./data-model.md), [`contracts/`](./contracts/), and
  [`quickstart.md`](./quickstart.md)

**Completion**: Planning ends after Phase 1. `tasks.md` is created by `/speckit.tasks`.
