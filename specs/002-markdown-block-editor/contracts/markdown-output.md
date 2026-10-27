# Contract: Canonical Markdown Output

**Version**: 1.0.0 | **Feature**: `002-markdown-block-editor` | **Date**: 2026-10-28

This contract defines the Markdown produced by Prompter. Save, Preview, and Copy consume the
same generated string; no path may add, remove, reorder, or reformat content independently.

## Inputs

- A `PromptDocument` with text and image blocks (see `../data-model.md`).
- Block geometry (`x`, `y`), creation sequence (`seq`), and blank-line fields.
- Image asset metadata (`fileName`, `alt`).

## Reading Order

```text
row = round(y / 24)
sort blocks by row ascending, then x ascending, then seq ascending, then id ascending
```

The row height matches the optional alignment grid. The sort is stable and deterministic for
identical inputs. `z` (stacking order) is ignored. Reading order is layout-only and is never
written into Markdown as coordinates, indices, or metadata.

Blocks whose `y` values fall in the same 24 px band are ordered by `x`, even when their `y`
values differ by less than 24 px; this is the normative interpretation of top-to-bottom, then
left-to-right.

## Line Serialization

### Text blocks

| Marker | Output line |
|--------|-------------|
| `none` | `text` |
| `#` | `# ` + `text` |
| `##` | `## ` + `text` |
| `###` | `### ` + `text` |
| `-` | `- ` + `text` |
| `1.` | `1. ` + `text` |
| `>` | `> ` + `text` |
| `.` | `. ` + `text` |

Rules:

- The marker prefix is emitted exactly once. If the user typed a recognized marker in the
  composer or during editing, it is stored as the marker and removed from the text.
- Only one space is inserted between the marker and the text. Existing leading spaces in the
  text are preserved, so `#  indented` is possible.
- Text is otherwise emitted verbatim: Traditional Chinese, English, emoji, punctuation, and
  trailing spaces are preserved. No Markdown escaping is added for ordinary prose.
- A text block whose committed text is empty after trimming is not allowed; it is removed.
- A source line that contains only a marker token (for example `- ` or `#`) is preserved as a
  text block containing the literal line, with marker `none`. This avoids silently deleting
  content and prevents invalid empty blocks.
- The block marker detection recognizes exactly one space after the token. `#Heading`,
  `#### Heading`, `2. item`, and indented `- item` are ordinary text at the model level.
- `.` has no special Markdown meaning; it is a literal visible prefix and is emitted as `. `.

### Image blocks

Output line:

```markdown
![alt](fileName)
```

Rules:

- `fileName` is a safe relative basename: no leading `/`, no `\`, no `..` path segment, no
  scheme, no query string, and no fragment. It may contain Unicode but generated names are
  sanitized and unique within the document.
- `alt` defaults to the image's original file name. It is escaped for Markdown image alt text:
  `\` becomes `\\`, `[` becomes `\[`, and `]` becomes `\]`. Newlines are not possible in alt.
- One image block produces exactly one image line. There is no HTML `<img>` in Markdown output.
- If an image asset is missing, the line is still emitted with the asset's last known
  `fileName` and `alt`; Preview and Copy report the missing image. The serializer never invents
  a replacement file name.
- Remote image references are not emitted as image blocks. They remain literal text lines when
  they came from an opened file.

### Unchanged literal lines

A non-empty Markdown line that is not a recognized marker or a matched image block becomes a
text block whose text is the line content and whose marker is `none`. Examples:

- `#### Fourth level` stays `#### Fourth level`.
- `2. Second item` stays `2. Second item`.
- `-not a list` stays `-not a list`.
- `![missing](not-selected.png)` stays exactly as written if no matching image was selected.
- Fenced code and table lines stay literal lines in the model; the line-oriented model does
  not restructure them. Preview may group consecutive fence or table lines for display.

## Blank Lines and Final Newline

A document stores:

- `leadingBlankLines`: blank lines before the first block.
- `blankLinesAfter` on each block: blank lines between that block and the next block.
- `trailingBlankLines`: blank lines after the last block.
- `trailingNewline`: whether the source ended with a newline.

Generation:

```text
lines = []
repeat leadingBlankLines times: lines.push("")
for i = 0 .. blocks.length - 1:
  lines.push(serialize(blocks[i]))
  if i < blocks.length - 1:
    repeat blocks[i].blankLinesAfter times: lines.push("")
repeat trailingBlankLines times: lines.push("")
result = lines.join("\n")
if trailingNewline and result is not empty and result does not end with "\n":
  result += "\n"
```

Rules:

- One blank line between blocks is `\n\n` and is represented by `blankLinesAfter: 1`.
- A whitespace-only source line counts as a blank line; its spaces are not preserved.
- New documents default to no leading/trailing blank lines, `trailingNewline: true`, and
  `blankLinesAfter: 0` on new blocks.
- Opening and saving preserves blank-line separation, not the exact whitespace characters on
  blank lines.
- CRLF and lone CR are normalized to LF. A UTF-8 BOM is stripped. Output is UTF-8 and
  locale-independent.
- Copy uses the exact generated string, including the final-newline decision.
- If the document has no blocks, the generated string is empty (or only blank lines if the
  source consisted of blank lines). Copy is disabled for an empty document.

## Determinism

For identical block content, geometry, `seq`, and image metadata, the generated Markdown is
byte-identical across browsers, locales, light/dark modes, and save/copy/preview paths. No
timestamps, ids, titles, file paths, or UI state are included in the Markdown.

## Examples

### Marker matrix

Model:

```text
none: "Plain line"
#:    "Role"
##:   "Objective"
###:  "Detail"
-:    "First constraint"
1.:   "First step"
>:    "Quoted instruction"
.:    "Literal dot"
```

Output:

```markdown
Plain line
# Role
## Objective
### Detail
- First constraint
1. First step
> Quoted instruction
. Literal dot
```

### Spatial ordering

Blocks:

```text
A: y=100, x=400, seq=1
B: y=104, x=24,  seq=2
C: y=200, x=24,  seq=3
```

Rows: A and B both round to row 4; C rounds to row 8. Output order: B, A, C.

### Complete document

Model with a heading, a bullet, a quote, and an image:

```text
# "Code reviewer"       y=24
- "Find risks"          y=96,  blankLinesAfter=1
> "Return a list"       y=96,  blankLinesAfter=1
image "architecture.png" y=160
```

Output:

```markdown
# Code reviewer

- Find risks

> Return a list

![architecture.png](architecture.png)
```

### Round-trip fixtures

The implementation MUST pass these fixture classes:

- Markers with one space and no space.
- Marker-only lines.
- Blank lines at the start, middle, and end.
- Files with and without a final newline.
- CRLF and BOM input.
- Traditional Chinese, English, emoji, punctuation, and trailing spaces.
- Headings, bullets, ordered lines (`1.`, `2.`, `10.`), quotes, images, fenced code, tables,
  and raw HTML-looking text.
- Data-URL image references and unmatched relative/remote image references.
- Duplicate image basenames and special characters in alt text.

## Preview Subset

The Preview renderer consumes the canonical Markdown string and supports:

- Headings `#`, `##`, `###`.
- Bullet lists, grouped from consecutive `- ` lines.
- Ordered lists, grouped from consecutive numeric lines, with the literal number preserved in
  `<li value="N">`.
- Blockquotes, grouped from consecutive `> ` lines.
- Images, with local assets resolved and missing/remote images shown as placeholders.
- Fenced code blocks, rendered as escaped `<pre><code>`.
- Basic pipe tables with a header row and a `---` separator row.
- Plain text lines rendered as paragraphs.
- Escaped raw HTML-looking text; no user HTML is rendered.

All other constructs remain literal text. Preview output is not written to disk; Save and Copy
always use the canonical Markdown above.

## Non-goals

- Rendering full CommonMark or GFM. Preview supports a documented subset; Save preserves
  literal lines.
- Reflowing, renumbering, or normalizing user prose.
- Embedding images as data URLs in saved Markdown; the chosen save format is relative image
  files.
- Adding a title, front matter, or metadata to the Markdown output.
- Enforcing the constitution's six-section prompt contract. This feature is a verbatim
  authoring surface; future generation features must add a versioned contract.
