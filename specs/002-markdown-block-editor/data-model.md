# Data Model: Markdown Block Editor

**Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

The model separates the logical document (what the user authored), the derived Markdown
document (what Save/Preview/Copy consume), and the on-device storage representation (records
and image Blobs). The same logical model is used by the editor, the search index, and all
output paths.

## Conventions

- All ids are UUID v4 strings generated with `crypto.randomUUID()` when available, otherwise a
  `crypto.getRandomValues()` fallback. Ids are unique within the library.
- Coordinates are CSS pixels relative to the canvas origin, with the top-left at `(0, 0)`.
- Timestamps are ISO 8601 strings with milliseconds, stored in UTC and displayed in local time.
- Marker values are stored as one of the literal tokens `"none"`, `"#"`, `"##"`, `"###"`,
  `"-"`, `"1."`, `">"`, or `"."`.
- Line endings are normalized to LF in the model and on output. A UTF-8 BOM is stripped on
  Open and is not re-emitted.
- The logical model does not include the transient composer, selection, drag state, search
  query, or clipboard payload. Those are session state only.

## Entities

### Library

The complete local collection.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `schemaVersion` | integer | yes | Currently `1`; validated on load. |
| `documents` | `PromptDocument[]` | yes | May be empty. Unique document ids. |
| `updatedAt` | ISO string | yes | Updated whenever the snapshot is written. |

Derived view: documents sorted by `updatedAt` descending for the directory. The directory
order is not stored separately.

### PromptDocument

A saved prompt. A new, unsaved document exists only in session state until Save or Save As.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | string | yes | UUID, immutable. |
| `title` | string | yes | Trimmed; fallback `Untitled`; maximum 200 characters; used by directory search. |
| `fileName` | string | yes | Safe basename ending in `.md`; no path separators; default derived from title. |
| `blocks` | `Block[]` | yes | Unique block ids; no committed empty text blocks. |
| `leadingBlankLines` | integer | yes | `>= 0`; blank lines before the first block in source order. |
| `trailingBlankLines` | integer | yes | `>= 0`; blank lines after the last block. |
| `trailingNewline` | boolean | yes | `true` if the source ended with a newline; new documents default to `true`. |
| `createdAt` | ISO string | yes | Creation time. |
| `updatedAt` | ISO string | yes | Last successful save time; directory sort key. Session edits update the in-memory copy until saved. |

Relationships:

- One document owns zero or more blocks.
- One document owns zero or more image assets; image blocks reference an asset by `assetId`.
- An asset is owned by exactly one document for lifecycle and clear/delete purposes. Save As
  duplicates assets with new ids and the new `documentId`; cross-document asset references are
  not part of this feature.

Validation:

- `title` is never rendered into Markdown; it is document metadata and directory text.
- `fileName` is sanitized; reserved names `.` and `..` are rejected; `.md` is appended once.
- Save As creates a new `id`, `createdAt`, and `updatedAt`; it does not mutate the original
  document.
- Opening an external Markdown file creates a new document id even if the title matches an
  existing document. Duplicate titles are allowed and distinguished by last-modified time.
- A document with no blocks is valid but Copy is disabled and Preview shows an empty state.

### Block (base)

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | string | yes | UUID, unique within the document. |
| `type` | `"text"` \| `"image"` | yes | Discriminator. |
| `x` | number | yes | Finite; `>= 0`; clamped to the canvas at render/drag time. |
| `y` | number | yes | Finite; `>= 0`; clamped to the canvas at render/drag time. |
| `z` | integer | yes | Stacking order for overlap; higher is in front. Not used for reading order. |
| `seq` | integer | yes | Creation/source sequence; stable tie-break for equal rows and x positions. |
| `blankLinesAfter` | integer | yes | `>= 0`; blank lines between this block and the next block in source order. |

The base fields are stored on both text and image blocks. The transient drag delta is not
stored; only the committed `x`/`y` are persisted.

### TextBlock

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `type` | `"text"` | yes | Discriminator. |
| `text` | string | yes | Committed text is non-empty after whitespace trimming; may contain leading/trailing spaces and Traditional Chinese/English/emoji; one logical line. |
| `marker` | Marker | yes | One of the supported marker values; `"none"` means no prefix. |

Rules:

- A text block holds one Markdown line. Enter commits rather than inserting a newline.
- The serialized line is `markerPrefix + text`, where `markerPrefix` is empty for `"none"` and
  otherwise the marker token plus one space.
- A recognized marker prefix typed at the start of a composer or edit is extracted into
  `marker` and removed from `text`; it is never duplicated.
- If a commit would leave the text empty after trimming, the block is removed instead of
  persisted. Its `blankLinesAfter` is transferred to the previous block, or to
  `leadingBlankLines` if it was first.
- Marker-only lines read from an opened file are preserved as text blocks whose text is the
  literal line (for example `"- "`), with marker `"none"`, rather than creating an invalid empty
  block. This preserves round trips without treating the line as an editable marker block.
- Long text wraps visually but remains one Markdown line and one block.

### ImageBlock

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `type` | `"image"` | yes | Discriminator. |
| `assetId` | string | yes | References an `ImageAsset` owned by the same document. |
| `alt` | string | yes | Defaults to the image's original file name; escaped when serialized; never empty (fallback to `fileName`). |

Rules:

- The serialized line is `![alt](asset.fileName)`.
- The image is displayed scaled to fit the available canvas width, preserving aspect ratio.
- The original bytes are preserved; the app never re-encodes, crops, or resizes the stored
  asset.
- Removing the block removes its Markdown line and the asset when no other block references it.
- If the asset bytes are missing at read time, the block remains and Preview shows a
  placeholder; Copy's text output still contains the image reference and warns.
- Image blocks support the same `+`, drag, selection, and delete/remove behavior as text
  blocks.

### ImageAsset

Logical metadata is stored with the document; bytes are stored separately.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | string | yes | UUID, unique within the library. |
| `documentId` | string | yes | Owning document; used for cleanup and clear-library. |
| `fileName` | string | yes | Unique within the document; safe relative basename; no `/`, `\`, `..`, or leading `/`; used in Markdown and on disk. |
| `originalName` | string | yes | Original selected/pasted file name; default alternative text; may contain Unicode and spaces. |
| `mimeType` | string | yes | `image/png`, `image/jpeg`, `image/gif`, or `image/webp`. |
| `width` | integer | yes | Natural width in pixels, `> 0`. |
| `height` | integer | yes | Natural height in pixels, `> 0`. |
| `size` | integer | yes | Original byte length, `>= 0`. |
| `createdAt` | ISO string | yes | Insertion/import time. |

Storage representation:

- IndexedDB: the record includes a `Blob` in the `assets` store, plus the metadata above.
- localStorage fallback: the record includes a `dataUrl` instead of a `Blob`.
- Memory fallback: the record keeps a Blob for the session only.

Validation:

- The MIME type must be supported and the image must decode successfully.
- Unsupported formats (including SVG), corrupt images, and images that cannot be persisted when
  storage is full are rejected without adding a block or changing the document.
- `fileName` collisions within a document are resolved by appending `-2`, `-3`, and so on
  before the extension. `alt` remains the original name unless the Markdown source supplied a
  different alt.
- Data-URL images from an opened Markdown file are decoded into assets and receive a unique
  `fileName`; the next save writes them as ordinary relative image files.
- Remote `http(s)` image references are never fetched and are not converted to assets; they
  remain literal text and are flagged by Preview.

### Marker

A closed enumeration:

| Value | Serialized prefix | Preview treatment |
|-------|-------------------|-------------------|
| `none` | none | Paragraph |
| `#` | `# ` | Heading level 1 |
| `##` | `## ` | Heading level 2 |
| `###` | `### ` | Heading level 3 |
| `-` | `- ` | Bullet list item |
| `1.` | `1. ` | Ordered list item; literal value 1 |
| `>` | `> ` | Blockquote |
| `.` | `. ` | Literal text prefix, no special Markdown semantics |

Marker detection uses exactly one space after the token. `#Heading` without a space is
ordinary text. `####` is not a supported marker and remains text. Other ordered numbers such as
`2.` are not extracted as markers; they remain literal text so the source is preserved, but the
Preview renderer may display them with their literal value.

### WorkspacePreferences

Stored per browser/device, not per document.

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| `schemaVersion` | integer | `1` | Preferences schema. |
| `style` | style ID | `"apple"` | Ten styles; independent of theme. Feature 003 defines the set, and stored `paper`/`graphite` values normalize to `apple`. |
| `theme` | `"system"` \| `"light"` \| `"dark"` | `"system"` | System follows `prefers-color-scheme` until changed. |
| `defaultMarker` | Marker | `"none"` | Used by new composers. |
| `showGrid` | boolean | `false` | Shows the 24 px alignment grid. |
| `lastDocumentId` | string \| null | `null` | Reopens the last document when it still exists; not a document save. |

Unknown or invalid values fall back to defaults. Preferences are not cleared by Clear Library.

### Session State

Not persisted across reloads (except `lastDocumentId` inside preferences). An unsaved document,
including a new `Untitled` document, is session-only; only an explicit Save persists it. An
attempt to reload after unsaved changes triggers the native leave confirmation; if the user
leaves, the draft is not restored.

| Field | Type | Purpose |
|-------|------|---------|
| `currentDocumentId` | string \| null | Open document; `null` for the empty workspace. |
| `selectedBlockId` | string \| null | Front-most selected block. |
| `editingBlockId` | string \| null | Text block in edit mode. |
| `composer` | `Composer` \| null | The one active input box. |
| `searchQuery` | string | Transient directory filter. |
| `dirty` | boolean | Unsaved content/layout changes in the current document. |
| `storageMode` | `"idb"` \| `"local"` \| `"memory"` | Detected persistence mode. |
| `fileTarget` | `FileTarget` \| null | Runtime directory handle and owned file names for Save. |
| `clipboardCapabilities` | object | Detected async clipboard, ClipboardItem, and execCommand support. |

### Composer

The transient input box shown for a blank document or after activating "+".

| Field | Type | Rules |
|-------|------|-------|
| `mode` | `"initial"` \| `"inserted"` | Initial is the blank-document composer; inserted is opened by "+". |
| `anchorBlockId` | string \| null | Source block for inserted mode; `null` for initial. |
| `x`, `y` | number | Insertion position, below the source block or at the canvas start. |
| `marker` | Marker | Default Marker from settings, or live detected marker. |
| `text` | string | Current input text; not persisted until committed. |

Transitions:

- `absent -> initial` when a blank document opens.
- `absent -> inserted` when "+" is activated.
- `initial`/`inserted -> absent` when Enter commits non-empty text, creating a text block at the
  composer position with the next sequence number.
- Enter with empty text does nothing.
- Escape dismisses an inserted composer; the initial composer remains.
- If the composer text changes, the document is dirty.
- Only one composer exists at a time.

Insertion uses one shared placement rule: place the new block below its source block, the
selected block, or the edited block; when none applies, place it after the last block in reading
order; then shift lower overlapping blocks down by the minimum amount needed to preserve reading
order. The same rule applies to "+" insertion, file image insertion, and paste.

### FileTarget (runtime)

| Field | Type | Purpose |
|-------|------|---------|
| `directoryHandle` | FileSystemDirectoryHandle \| null | Chromium direct-write target; never required. |
| `fileName` | string | Current Markdown basename. |
| `ownedFileNames` | string[] | Files written by this app for this document; used to distinguish safe overwrites from conflicts. |
| `mode` | `"direct"` \| `"download"` | Active save strategy. |

A handle may be persisted in IndexedDB metadata as a progressive enhancement; on Save its
permission is queried and re-requested on a user gesture. If the handle is missing, denied, or
unsupported, Save uses the download strategy.

### ClipboardPayload (transient)

| Field | Type | Purpose |
|-------|------|---------|
| `markdown` | string | Exact canonical Markdown for `text/plain`. |
| `html` | string | Rendered Markdown for `text/html`, with local images as data URLs and placeholders for missing images. |
| `omittedImages` | string[] | File names of images that could not be embedded or were missing. |

### SearchIndexEntry (runtime)

| Field | Type | Purpose |
|-------|------|---------|
| `documentId` | string | Document key. |
| `text` | string | Lowercased concatenation of title, text blocks, image alt text, and image file names. |
| `updatedAt` | ISO string | Rebuild trigger. |

The index is rebuilt on load and after any Save/Open/Clear that changes the library. It is not
persisted.

## Reading Order

Reading order is derived from geometry and is never stored as a separate manual order.

```text
row(block) = round(block.y / 24)
sort by:
  1. row ascending
  2. x ascending
  3. seq ascending
  4. id ascending (final deterministic tie-break)
```

The same ordered array is used for:

- DOM order within the canvas list
- Preview input
- Save output
- Copy `text/plain` and `text/html`
- Image-before/after decisions in mixed paste
- Search content generation (order does not affect matching, only generation)

The 24 px row height matches the optional alignment grid. Blocks whose `y` values fall in the
same 24 px band are ordered by `x`, even when their `y` values differ by less than 24 px; this
is intentional and normative. Dragging changes `x`/`y` and therefore can change reading order.
`z` only affects overlap and never reading order.

## Blank-Line and Newline Semantics

Given ordered blocks:

```text
lines = []
append leadingBlankLines empty strings
for each block i:
  lines.push(renderBlockLine(block))
  if i < blocks.length - 1:
    append block.blankLinesAfter empty strings
append trailingBlankLines empty strings
result = lines.join("\n")
if trailingNewline and result is non-empty and result does not end with "\n":
  result += "\n"
```

Consequences:

- `blankLinesAfter: 1` between two blocks produces one empty line (`\n\n`).
- `trailingBlankLines: 0` plus `trailingNewline: true` produces the usual single final newline.
- `trailingBlankLines: 1` plus `trailingNewline: true` produces one empty line after the last
  content line.
- A whitespace-only source line counts as a blank line; its spaces are not preserved.
- A source without a final newline sets `trailingNewline: false` and is reproduced without one.
- New documents use `leadingBlankLines: 0`, `trailingBlankLines: 0`, `trailingNewline: true`,
  and `blankLinesAfter: 0` for new blocks.

## State Transitions

### Document lifecycle

```text
empty workspace
  -> New: unsaved blank document (not in directory, dirty once content is entered)
  -> Open: parsed document (in directory, clean)
  -> Select directory item: opened document (clean)

unsaved blank document
  -> commit first block/title change: dirty
  -> Save: asks for a file name/location on first save; becomes saved, clean, in directory
  -> Save As: new saved document, clean, in directory; original unchanged

opened/saved document
  -> edit/move/add/remove images or title: dirty
  -> remove the last block: blank document with the initial composer
  -> Save: updated record, updatedAt refreshed, clean
  -> Save As: new document, clean, current target changes; original unchanged
  -> Clear Library: removed locally; workspace empty
```

### Block editing

```text
idle -> double-click/Enter/F2 -> editing
editing -> Enter -> committed (marker detection applied)
editing -> Escape -> cancelled (original text/marker restored)
editing -> click outside -> committed
editing -> empty text -> removed (blank-line transfer)
```

### Composer

```text
absent -> blank document opened -> initial composer
absent -> "+" activated -> inserted composer below source
composer -> Enter with text -> text block created, composer absent
composer -> Enter with empty text -> no change
inserted composer -> Escape -> absent
initial composer -> Escape -> remains (blank document still needs an input)
```

### Save

```text
clean/dirty -> Save/Save As -> validate -> write assets -> write Markdown
  -> success: mark clean (new doc becomes current), refresh directory, toast
  -> failure: report file and error, keep document open and dirty
  -> cancel picker: no change
```

### Storage degradation

```text
probe IndexedDB -> success: idb mode
  -> failure: probe localStorage -> success: local mode
    -> failure: memory mode + non-blocking warning
quota/write failure -> keep session state, show warning, do not silently discard edits
unreadable payload -> preserve backup if possible, empty library + warning
```

## Storage Layout

### IndexedDB: `prompter-v1` (version 1)

| Store | Key | Value |
|-------|-----|-------|
| `documents` | `id` | Full `PromptDocument` JSON (block fields, no Blob bytes). |
| `assets` | `id` | `{ ...ImageAsset metadata, blob: Blob }`. |
| `meta` | `key` | `{ key, value }`; keys include `schemaVersion`, `preferences`, `lastDocumentId`, and optional `fileTarget`. |

Indexes:

- `documents` by `updatedAt` (for directory ordering, optional; the library is small enough to
  sort in memory).
- `assets` by `documentId` (for cleanup and clear-library).

Access patterns:

- Load all documents and their asset metadata at startup; load image Blobs lazily on render.
- Save one document record and its new/changed assets in a single transaction where possible.
- Delete assets that no longer have any referencing image block.
- Clear Library deletes all `documents` and `assets` records, clears the local fallback snapshot,
  removes saved file-target metadata, and leaves `meta.preferences` intact.

### localStorage keys

| Key | Value | Purpose |
|-----|-------|---------|
| `prompter.prefs.v1` | JSON `WorkspacePreferences` | Synchronous theme/style preflight and settings. |
| `prompter.library.v1` | JSON `{schemaVersion, documents, assets}` with data URLs | Fallback snapshot when IndexedDB is unavailable. |
| `prompter.corrupt.<timestamp>` | Raw unreadable payload | Best-effort preservation before starting empty. |

All keys are namespaced to avoid collisions with other `file://` pages. Writes are wrapped in
try/catch; `QuotaExceededError` triggers a warning and, for image insertion, a rollback.

### Memory fallback

Documents and assets live in plain JavaScript structures for the session. The directory works,
Save/Copy/Preview work, and a persistent warning states that reload will not restore the
library.

### Schema and migration

- `schemaVersion: 1` is the baseline for this feature.
- On load, validate the version and shape. Known older versions may be migrated by pure
  functions; unknown newer versions are not overwritten and trigger the empty-library warning.
- Corrupt JSON, invalid block references, and unsupported asset records are treated as
  unreadable library data (FR-040), not as a fatal page error.
- The canonical serializer and renderer are version-independent; changing serialization rules
  later requires a contract version note and migration tests.

## Example

Logical document:

```json
{
  "id": "8c5f2d3e-6a4b-4c2d-9f1e-2b7a9c0d1e2f",
  "title": "Code review prompt",
  "fileName": "code-review-prompt.md",
  "leadingBlankLines": 0,
  "trailingBlankLines": 0,
  "trailingNewline": true,
  "createdAt": "2026-10-28T02:00:00.000Z",
  "updatedAt": "2026-10-28T02:10:00.000Z",
  "blocks": [
    {
      "id": "b1",
      "type": "text",
      "text": "Code reviewer",
      "marker": "#",
      "x": 24,
      "y": 24,
      "z": 1,
      "seq": 1,
      "blankLinesAfter": 1
    },
    {
      "id": "b2",
      "type": "text",
      "text": "Find correctness and security risks.",
      "marker": "-",
      "x": 24,
      "y": 96,
      "z": 2,
      "seq": 2,
      "blankLinesAfter": 1
    },
    {
      "id": "b3",
      "type": "text",
      "text": "Return a prioritized list.",
      "marker": ">",
      "x": 360,
      "y": 96,
      "z": 3,
      "seq": 3,
      "blankLinesAfter": 1
    },
    {
      "id": "b4",
      "type": "image",
      "assetId": "a1",
      "alt": "architecture.png",
      "x": 24,
      "y": 160,
      "z": 4,
      "seq": 4,
      "blankLinesAfter": 0
    }
  ]
}
```

Reading order: `b1` (row 1), then `b2` (row 4, x 24) before `b3` (row 4, x 360), then `b4`
(row 7). Generated Markdown:

```markdown
# Code reviewer

- Find correctness and security risks.

> Return a prioritized list.

![architecture.png](architecture.png)
```

If the source ended without a newline, `trailingNewline` is `false` and the output has no final
newline. If the source had two blank lines between the heading and the bullet,
`blankLinesAfter` would be `2` and the output would contain two empty lines at that point.
