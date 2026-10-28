# Contract: File Input and Output

**Version**: 1.0.0 | **Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This contract defines how Prompter reads and writes ordinary Markdown and image files under
`file://`. Every operation must work with no server and no network. File System Access is an
enhancement; downloads are the baseline.

## Supported Inputs

- Exactly one Markdown file with extension `.md` or `.markdown` (UTF-8, optional BOM).
- Any number of image files with MIME type `image/png`, `image/jpeg`, `image/gif`, or
  `image/webp`.
- The user selects them together in one multi-file picker. A selection without a Markdown file,
  or with more than one Markdown file, is rejected with a clear message and no document change.
- Files are read with the browser's File API. No `fetch()`, remote URL, or network access is
  used.
- A maximum size is not imposed by this contract; extremely large inputs are limited by
  available memory and browser storage, and failures are reported without losing the current
  document.

## Open

1. Open the multi-file input. If cancelled, the current document and tabs remain unchanged.
2. A successful Open creates a new document tab; other open tabs keep their unsaved state.
3. Read the Markdown file as UTF-8, strip a leading BOM, normalize CRLF/CR to LF, and split
   into lines.
4. For each line:
   - Count blank/whitespace-only lines into leading/inter-block/trailing blank counts.
   - Recognized marker plus one space becomes a text block with that marker and the remaining
     text. A marker-only line stays a literal text line (see `markdown-output.md`).
   - A Markdown image line becomes an image block when a matching selected image file or a
     data-URL image is available. Matching is by normalized relative path, then basename,
     case-insensitively.
   - Otherwise the line becomes a literal text block.
5. Decode matched images, validate their MIME type and dimensions, assign unique file names,
   and store original bytes. Duplicate basenames are disambiguated; if two references cannot be
   distinguished, the first match is used and the other is flagged.
6. Add the new document to the local library with a new id, title derived from the file name
   without its extension, and `updatedAt` set to now. Duplicate titles are allowed.
7. Arrange blocks in a single column in source order (the initial layout), mark the document
   clean, and activate its new tab. The previous document remains in the library and in its tab.
8. If image storage fails, keep the document open with session-only assets and show a
   non-blocking warning; do not discard the parsed content.

## Image References

- Relative references are matched against selected files. `./image.png` and `image.png` are
  equivalent; URL-encoded basenames are decoded before matching.
- `data:image/png;base64,...`, `data:image/jpeg`, `data:image/gif`, and `data:image/webp`
  references are decoded into image assets. On the next save they become relative image files.
- `http:`, `https:`, protocol-relative, absolute-path, and `file:` references are not fetched
  and do not become image assets. They remain literal text and are flagged by Preview.
- SVG, PDF, and other non-image or unsupported image types are ignored as assets and remain
  literal text (or are rejected when inserted directly).
- Missing image files do not abort Open. The reference remains text (or an image block with a
  missing asset if the model already had one) and Preview/Copy warn.

## Save

Save targets the current file when a direct-write target is known; otherwise it behaves like
Save As for a new document, or uses the download strategy for an existing document.

### Preconditions

- A document is open. Save and Save As are disabled when no document is open.
- The document has a valid title and at least zero blocks. An empty document may be saved.
- If the title is still the default `Untitled` on a first save, ask for a file name before
  writing.

### Direct-write strategy (File System Access API)

1. Ask for a directory with a read-write picker when no target exists. Ask for a file name in a
   dialog (default: sanitized title plus `.md`).
2. Validate the target directory and filename. Reject path separators, `.`/`..`, and empty
   names.
3. Determine the final image file names. Check the directory for conflicts:
   - Files recorded as owned by this document may be overwritten silently on Save.
   - Any other existing file triggers a conflict dialog listing the files. The user may cancel,
     choose another directory/name, or explicitly allow overwrite. Nothing is written before
     the choice.
4. Write each image file with its original bytes. Write the Markdown file last.
5. On success, mark the document clean, refresh `updatedAt`, update the directory, and show a
   confirmation. Keep the directory handle for subsequent Save operations.
6. On failure, report which file failed, keep the document open and dirty, and do not claim
   success. Files already written may remain; the user can retry or Save As elsewhere.
7. Save As creates a new document id and directory entry, writes new files, leaves the original
   document and its files unchanged, and makes the new document current.

### Download strategy (baseline)

1. Generate the Markdown and image files with their final names.
2. Trigger downloads for images first, then the Markdown, so the Markdown is the last file
   produced.
3. Show a message that the files must remain together and must not be renamed; relative image
   references depend on their names.
4. Browsers may block multiple downloads or rename duplicates with `(1)`. The app reports the
   limitation; the user can allow downloads and retry or use a Chromium browser for direct
   writes.
5. Save As on a new document adds it to the local directory even when the download is the only
   write path. The local record is the editable copy; the downloaded files are the durable
   copy.

### File naming

- Markdown: sanitize the title by removing control characters, `/ \ : * ? " < > |`, leading/
  trailing dots and spaces, and limiting length; append `.md` once; fall back to `untitled.md`.
- Images: prefer a sanitized original basename; if empty or reserved, use `image-01.<ext>`.
  Ensure uniqueness within the document with `-2`, `-3`, ... suffixes. Preserve the original
  name for alternative text.
- Generated references are relative basenames with no directory traversal. Names may contain
  Unicode but not spaces from generated sanitization; original names with spaces are preserved
  only in alt text.
- If a file name collides with an unrelated file on disk, resolve it through the conflict flow;
  never silently overwrite unrelated files.

## Insert Image

1. Open a picker accepting PNG, JPEG, GIF, and WebP. Multiple selection is allowed.
2. For each selected file: validate MIME type and decode. Validate and persist every selected
   image as one all-or-nothing batch. If any file is unsupported, corrupt, or cannot be stored,
   reject the whole insertion with a clear message and leave the document unchanged.
3. Store the original bytes and metadata. Assign a unique `fileName` and default `alt` from the
   original name.
4. Insert an image block at the insertion point: below the selected block, below the edited
   block, or below the last block in reading order when nothing is selected. Shift lower
   overlapping blocks down by the minimum amount needed to preserve the resulting order.
5. If storage fails, roll back any new assets and leave the document unchanged. If storage is in
   memory mode, insert for the session and warn that reload will lose the image.
6. Cancelling the picker leaves the document unchanged.

## Paste Images

- `paste` reads `clipboardData.items`. Image files are validated and stored like Insert Image.
- In canvas mode, text lines become text blocks before image blocks in reading order.
- In text-edit mode, images are inserted directly below the edited block without ending the
  edit; clipboard text is ignored in this case.
- Unsupported formats are rejected without changing the document.
- Pasting does not require clipboard read permission.

## Clear Library

- Removes local document records, layouts, image assets, and saved file-target handles from
  IndexedDB/localStorage memory.
- Does not delete any Markdown or image files already saved on disk.
- Does not clear workspace preferences.
- Requires explicit confirmation. The current document closes and the workspace shows the
  empty state.
- If some records cannot be removed, report which storage layer failed and keep the session
  usable.

## Error Handling

| Failure | Required behavior |
|---------|-------------------|
| Picker cancelled | No change; current document and dirty state intact. |
| No Markdown file selected | Clear message; no change. |
| More than one Markdown file | Clear message; no change. |
| Markdown decode/read error | Clear error; no change. |
| Unsupported image during Open | Ignore that file, keep its reference as literal text, warn; other valid files may proceed. |
| Unsupported image during Insert Image or Paste | Reject the whole image batch, add no blocks or assets, and leave the document unchanged. |
| Image decode failure during Open | Ignore that file, keep its reference as literal text, warn. |
| Image decode failure during Insert Image or Paste | Reject the whole batch; no document change. |
| Storage quota exceeded | Reject insertion, roll back, document unchanged; warn on save. |
| Directory permission denied | Fall back to downloads, or report and keep document dirty. |
| Conflict with unrelated file | Show conflict dialog; write nothing until resolved. |
| Image write failure | Report file, do not write Markdown, keep document editable. |
| Markdown write failure | Report file, keep document editable; note images may remain. |
| Multiple-download block | Explain and offer retry/Save As; local library remains intact. |

## Non-goals

- Writing a ZIP archive, embedding images in Markdown, or managing a proprietary project file.
- Watching the file system for external edits.
- Deleting unrelated files or orphaned images during normal Save.
- Network sync, cloud storage, or collaboration.
