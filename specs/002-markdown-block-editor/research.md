# Research: Markdown Block Editor

**Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This document records the technical decisions needed to satisfy the specification under the
project constitution. All runtime choices are constrained by direct `file://` opening, no
build step, no network, and no third-party runtime dependencies.

## D1. Runtime architecture: dependency-free classic scripts

**Decision**: Ship one `index.html`, local CSS, and ES2020 classic scripts loaded with
`<script defer>`. Each script attached to a `window.Prompter` namespace. Pure modules use a
guarded CommonJS export so Node's built-in test runner can load the same source.

**Rationale**: Classic scripts work under `file://` with no CORS or module-resolution issues.
`defer` preserves execution order. The constitution prohibits ES module imports, local
`fetch()`, servers, and required build steps. A namespace keeps the code modular without a
bundler.

**Alternatives considered**:

- ES modules: blocked by CORS/file-origin restrictions in several browsers under `file://`.
- Bundler or framework: adds a build step, package installation, and runtime complexity,
  violating Principles I and V.
- One giant inline script: harder to test and maintain; separate classic scripts are still
  file-openable.

## D2. Canonical Markdown serializer plus a small in-house renderer

**Decision**: Implement a line-oriented parser/serializer in `markdown.js` and use it as the
only source of Markdown for Save, Preview, and Copy. Implement a small renderer for Preview
supporting headings, bullet and ordered lists, blockquotes, images, plain text, fenced code,
basic pipe tables, and escaped raw text.

**Rationale**: The specification supports a deliberately small Marker set and line-oriented
blocks. A full CommonMark library would add a runtime dependency, increase the payload, and
still need custom marker extraction and spatial ordering. A single serializer guarantees the
three output paths cannot drift. A small renderer gives full control over escaping and missing-
image behavior.

**Alternatives considered**:

- Vendored Markdown library (marked, markdown-it): runtime dependency, larger payload, module
  or bundler friction, and extra work to preserve line-oriented block boundaries.
- Browser-native rendering: no native Markdown renderer; converting to HTML manually is still
  a renderer.
- Render raw text only: fails Preview requirements for headings, lists, quotes, and images.

## D3. Open via a multi-file `<input type="file">`

**Decision**: Use a hidden `<input type="file" multiple accept=".md,.markdown,text/markdown,
image/png,image/jpeg,image/gif,image/webp">`. Require exactly one Markdown file and treat the
remaining selected files as candidate image assets.

**Rationale**: File inputs are available in every supported browser and work under `file://`
without permissions or API-specific behavior. Multi-select lets the user choose the Markdown
file and its related images in one action, matching the clarified image workflow.

**Alternatives considered**:

- `showOpenFilePicker()`: not available in Firefox/Safari and may be restricted under
  `file://`; it also does not naturally return a set of related images.
- Directory input (`webkitdirectory`): not uniformly supported and changes the user's
  selection model.
- Drag-and-drop files onto the page: useful as an enhancement but not sufficient as the only
  path; file input remains the reliable baseline.

## D4. Save via File System Access when available, downloads otherwise

**Decision**: On Chromium browsers, use a directory picker plus a filename dialog for direct
multi-file writes. Write images first and the Markdown file last. On any failure or when the
API is unavailable, download each file separately.

**Rationale**: Direct multi-file writing is the only way to keep a Markdown file and its
relative image references together without a server. The spec explicitly allows a download
fallback. Writing the Markdown last prevents a saved document from referencing images that
were not written. A directory handle is needed because a file handle does not expose its parent
directory.

**Alternatives considered**:

- `showSaveFilePicker()` for the Markdown plus guesses about sibling images: no parent handle,
  multiple picker prompts, and fragile path handling.
- ZIP packaging: requires a ZIP implementation or dependency and changes the expected file
  layout; the spec requires ordinary Markdown plus image files.
- Embedding images as data URLs: rejected during clarification; the chosen behavior is
  relative image files.

## D5. Persistence: IndexedDB first, localStorage fallback, memory last resort

**Decision**: Store documents, image Blobs, and metadata in IndexedDB database `prompter-v1`
when a small Blob write/read probe succeeds. Fall back to a versioned localStorage snapshot
with images as data URLs and quota checks. Fall back to memory with a non-blocking warning when
neither is usable. Store preferences in localStorage first for synchronous theme application
and mirror them into IndexedDB metadata when available.

**Rationale**: Images need Blob storage and more quota than localStorage comfortably provides.
However, storage behavior on `file://` is not guaranteed and varies by browser and policy. A
layered adapter with probing and graceful degradation satisfies FR-036 while honoring FR-039
and FR-040.

**Evidence**: A Chrome 156 headless probe of a `file://` page reported
`isSecureContext: true`, working localStorage, working IndexedDB, and shared localStorage/
IndexedDB state between two different `file://` URLs. This is favorable but not a cross-browser
guarantee; Firefox and Safari still require fallback behavior. A headless clipboard
`writeText` call was denied without user activation, confirming that clipboard fallbacks are
mandatory.

**Alternatives considered**:

- localStorage only: small quota, base64 image bloat, and synchronous writes that can block.
- File System Access library file: requires repeated permission grants, cannot be read
  automatically on startup under `file://`, and would be a poor default for every edit.
- No local persistence: violates FR-036 and the directory/search workflows.
- Cookies: far too small and unsuited to documents or images.

## D6. Clipboard: text/plain plus rich text/html, async first, execCommand fallback

**Decision**: Copy always writes exact Markdown as `text/plain`. When the document contains
images, Copy also writes rendered Markdown as `text/html`, with local images embedded as data
URLs. Use `navigator.clipboard.write()` with a `ClipboardItem` when available; fall back to a
hidden contenteditable and `document.execCommand('copy')`; finally show a manual-copy dialog.
Always report omitted images.

**Rationale**: `text/plain` guarantees that AI tools and plain-text destinations receive the
exact Markdown, including Markers. `text/html` supports one-paste rich destinations with
formatted text and images when images make that necessary. Text-only documents omit
`text/html` so rich destinations cannot silently convert Markdown headings and lists into
formatted content that loses the Markers. Async Clipboard is not reliably available or
permitted under `file://`, so the fallback path is required by the constitution's clipboard
constraint.

**Alternatives considered**:

- Text-only copy: fails FR-030 and the mixed text/image requirement.
- Multiple `ClipboardItem`s, one per image: destinations commonly accept only one item; ordering
  and text association are unreliable.
- Remote image URLs: violates offline/self-contained delivery and requires a server.
- Native helper app: violates the static/file-openable constitution.

## D7. Paste images through the `paste` event

**Decision**: Listen for `paste` on the canvas, read `event.clipboardData.items`, split text
into blocks, and convert image files into image blocks. In edit mode, insert images below the
edited block and do not interrupt the edit.

**Rationale**: The `paste` event exposes clipboard files without a permission prompt and works
in all supported browsers under `file://`. It handles mixed text-and-image clipboard content.

**Alternatives considered**:

- `navigator.clipboard.read()`: requires permission, is not universally supported, and may be
  denied under `file://`.
- A paste target textarea: loses image data and adds a step.

## D8. Derived reading order with row bucketing

**Decision**: Sort blocks by `row = Math.round(y / 24)`, then `x`, then creation sequence,
then id. Use this order for DOM order, Preview, Save, Copy, and search content.

**Rationale**: The user chose a free 2D canvas with top-to-bottom, left-to-right Markdown.
Sorting by exact `y` interleaves visually aligned blocks when their tops differ by a few pixels.
Row bucketing treats near-aligned blocks as a row, is transitive, and is deterministic. The
creation sequence avoids unstable order for exact position ties. Positions are layout-only and
never written into Markdown.

**Alternatives considered**:

- Exact `y` then `x`: deterministic but visually surprising for near-aligned rows.
- A separate manual reading-order control (clarification Option C): rejected because it adds a
  second ordering model the user did not choose.
- Creation order only (clarification Option D): rejected because it ignores spatial layout.

## D9. Pointer-event dragging with keyboard movement

**Decision**: Use Pointer Events, pointer capture, `requestAnimationFrame`, and a CSS
transform during drag; commit `x`/`y` on pointerup and clamp to the canvas. Use Alt+Arrow for a
grid-step move and Alt+Shift+Arrow for one-pixel movement, with live-region announcements.

**Rationale**: Pointer Events cover mouse, touch, and pen. Transform-based movement avoids
layout thrashing and keeps drag at 60 fps. Clamping prevents blocks from becoming unreachable.
A keyboard path satisfies FR-025 and SC-011.

**Alternatives considered**:

- HTML5 drag-and-drop: poor control over free positioning and touch behavior.
- A drag library: runtime dependency prohibited by Principle V.
- Separate x/y inputs: accessible but cumbersome; keep as a fallback only if needed.

## D10. Image pipeline preserves original bytes

**Decision**: Validate PNG, JPEG, GIF, and WebP, decode for dimensions, store the original Blob
unchanged in IndexedDB (or a data URL in localStorage fallback), assign a unique relative file
name, and use the image's original file name as the default alternative text. No resizing,
cropping, re-encoding, or alternative-text editing.

**Rationale**: Preserving original bytes avoids quality loss and animation loss (GIF/WebP).
Unique file names prevent reference collisions. The mode and scope match the clarified image
workflow and FR-041..FR-045.

**Alternatives considered**:

- Base64 images inside document JSON: bloats every read/write and can exhaust localStorage.
- Canvas re-encoding to PNG: loses animation, may alter color profiles, and adds CPU cost.
- Remote image references: not offline/self-contained.
- SVG support: explicitly out of scope; SVG is active content and needs a separate security
  review.

## D11. Preview uses a modal `<dialog>` and the canonical serializer

**Decision**: Render `generateMarkdown(document)` in a native `<dialog>`. Support headings,
lists with literal ordered values, quotes, images, plain text, fenced code, and basic pipe
tables. Escape raw HTML, never fetch remote images, and show placeholders for missing images.

**Rationale**: The native dialog provides focus containment, Escape handling, and backdrop
behavior without a dependency. Rendering the canonical Markdown string guarantees Preview
matches Save and Copy. Escaping prevents user content from becoming executable HTML.

**Alternatives considered**:

- A custom modal: more code for focus trapping and accessibility.
- Rendering from the block model directly: risks diverging from the Markdown output.
- An iframe preview: extra complexity and `file://` restrictions; not needed for the supported
  subset.

## D12. Search index and debounce

**Decision**: Build an in-memory, lowercased search string per document containing title, text
block content, image alternative text, and image file names. Filter with literal
`String.prototype.includes` after trimming the query. Debounce input by 80 ms.

**Rationale**: The corpus is small (up to 500 documents) and search must update in under
300 ms. A precomputed index avoids walking every block on each keystroke. Literal matching
supports Traditional Chinese, English, punctuation, and spaces without regex escaping issues.

**Alternatives considered**:

- Full scan on every keystroke: likely adequate for 500 docs but needlessly costly with large
  blocks.
- Fuzzy or semantic search: out of scope per the spec.
- Browser search UI: does not provide match counts or a clear-search state.

## D13. Appearance preflight and styles

**Decision**: Apply `data-theme` and `data-style` from a small inline head script before first
paint using localStorage preferences. Use `matchMedia('(prefers-color-scheme: dark)')` while
the preference is system. Provide two styles, 紙張 (Paper) and 石墨 (Graphite), independent of
light/dark mode. Settings includes a follow-system reset.

**Rationale**: Reading storage after first paint causes a visible theme flash. Preferences are
small, so synchronous localStorage is appropriate. The header toggle remains a simple
light/dark control, while the settings reset restores system following.

**Alternatives considered**:

- Read preferences only from IndexedDB: asynchronous and causes a flash.
- CSS-only theme persistence: impossible without storage.
- A three-state header control: more complex at 360 px; a settings reset is sufficient.

## D14. Testing without installing a test framework

**Decision**: Use Node 26's built-in `node:test` and `node:assert` for pure modules. Provide a
`tests/browser/harness.html` page that loads the same classic scripts from `file://` and runs
DOM/storage checks. Use a documented manual matrix for clipboard, File System Access, and
cross-browser behavior.

**Rationale**: The constitution requires features to be verifiable by opening the page from
disk. Node's built-in runner avoids package installation and a build step. The browser harness
tests the actual `file://` environment, which jsdom cannot reproduce. Clipboard and picker
behavior require real user gestures, so manual verification is unavoidable.

**Alternatives considered**:

- Jest/Vitest + jsdom: development dependencies and an install step; jsdom does not model
  `file://` storage or clipboard behavior.
- Playwright: useful but adds a large dev dependency and browser download; not required for
  the core verification guide.
- Manual-only testing: too easy to regress the pure serializer and ordering logic.

## D15. Atomic-ish multi-file save and filename collisions

**Decision**: Generate safe, unique relative file names per document. On directory save, check
for existing files, show a conflict dialog before overwriting anything not owned by the current
document, write images first, and write Markdown last. On failure, identify the failed file and
leave the document editable. On download fallback, download images first, then Markdown, and
warn that renaming breaks references.

**Rationale**: FR-016 requires failures to preserve content and report errors. FR-013 requires
Save As to leave the original unchanged. Writing Markdown last prevents dangling references.
A conflict dialog respects "unrelated files on disk are not modified."

**Alternatives considered**:

- Silently overwrite: could destroy unrelated files.
- UUID-only file names: safe but poor alternative text and readability; use sanitized names
  with suffixes instead.
- Write Markdown first: a failure could leave a document referencing missing images.

## D16. Corrupt data and schema migration

**Decision**: Version the storage schema (`schemaVersion: 1`). Validate on load. If parsing or
validation fails, preserve the unreadable payload under a timestamped backup key when possible,
open an empty library, and show a warning. Migrate known older versions in code; never
overwrite an unknown newer version during startup.

**Rationale**: FR-040 requires an empty library with a warning instead of a failed load.
Preserving the corrupt payload avoids destroying a user's only copy while they decide what to
do. A version field makes future changes safe.

**Alternatives considered**:

- Throw and show a blank page: violates FR-040.
- Silently reset: risks data loss.
- No version field: makes migrations guesswork.

## D17. Security boundary

**Decision**: Escape all user text in Preview and clipboard HTML; never render raw HTML;
sanitize file names; reject path traversal and absolute paths in generated image references;
never fetch remote images; use only local Blobs/data URLs; no `eval`, `new Function`, or remote
scripts.

**Rationale**: Documents may contain untrusted Markdown from other tools. The app is local and
offline, but XSS would still expose local data and could corrupt the library. The supported
Markdown subset does not need raw HTML.

**Alternatives considered**:

- Sanitize a full HTML renderer: requires a sanitizer dependency or a complex allowlist.
- Trust local files: still unsafe when a user opens a downloaded prompt.

## D18. Browser tab-close limitation

**Decision**: Use a three-way Save/Discard/Cancel dialog for in-app navigation. For actual page
close or reload, set `beforeunload` and let the browser show its native Stay/Leave prompt. Do
not claim a custom three-way dialog for tab close.

**Rationale**: Browsers deliberately prevent custom unload UI. This is a platform limitation,
not an implementation shortcut. The spec's FR-015 and SC-009 should distinguish in-app
navigation from page unload.

**Alternatives considered**:

- Autosaving every change to the local library: changes the meaning of "saved" and the
  directory contents; not required by the spec.
- Blocking unload with a custom modal: impossible.
- Ignoring the unload case: risks silent data loss.

## D19. Browser capability evidence

A Chrome 156 headless probe opened from `file://` reported:

- `isSecureContext: true`
- `location.origin: file://`
- `showOpenFilePicker`, `showSaveFilePicker`, and `showDirectoryPicker` present as functions
- `navigator.clipboard` and `ClipboardItem` present
- localStorage read/write successful
- IndexedDB open successful
- localStorage and IndexedDB values written by one `file://` URL were readable by a different
  `file://` URL in the same profile
- `navigator.clipboard.writeText()` denied without user activation

These results justify using Chromium's File System Access API as a progressive enhancement and
confirm that clipboard and storage fallbacks must remain first-class paths. They are not
treated as guarantees for Firefox, Safari, private windows, or future browser versions.

## D20. Summary of fallback matrix

| Capability | Preferred path | Fallback |
|------------|----------------|----------|
| Open | Multi-file file input | None needed |
| Save | File System Access directory handle | Per-file downloads |
| Document storage | IndexedDB | localStorage JSON snapshot, then memory |
| Image storage | IndexedDB Blob | localStorage data URL, then session memory |
| Rich copy | Async Clipboard `text/plain` + `text/html` | `execCommand('copy')`, then manual-copy dialog |
| Image paste | `paste` event files | None needed |
| Preview | Native `<dialog>` renderer | Text-only preview if rendering fails |
| Theme | localStorage preflight | System preference |
| Search | In-memory index | Linear scan if index unavailable |
