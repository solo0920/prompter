# Feature Specification: Sequential Block Reordering and Tech-Site Styles

**Feature Branch**: `003-slot-drag-reorder`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User descriptions:

> 每個項目會佔一個預定位置，當被拖取的項目接近時會被擠開然後到被拖取的項目原來的位子

> 請作整排區塊依序推移，調整規格 https://getdesign.md/ 參考加入前十大科技網站的style

## Relationship to Existing Feature

This feature replaces the free-position drag behavior and row-band reading order defined in
[`002-markdown-block-editor`](../002-markdown-block-editor/spec.md). Blocks will no longer stop
at arbitrary two-dimensional coordinates or leave gaps between positions. Every block occupies
one position in a contiguous reading-order sequence, and dragging a block shifts the entire
range of blocks between the source and target one position at a time.

The feature also replaces the previous Paper and Graphite appearance options with a curated
set of ten styles inspired by the technology websites analyzed in the
[getdesign.md](https://getdesign.md/) catalog. Apple is the default style.

All other behavior from feature 002 remains in force: block content, Markers, image handling,
file operations, preview, copy, search, settings, storage degradation, and accessibility.

## Prompt Contract Impact & Verification

- **Inputs**: User-authored Markdown text and images, the order chosen by drag or keyboard
  movement, and a workspace appearance style. Neither reordering nor styling generates or
  rewrites prompt content.
- **Prompt contract sections affected**: None. Prompter remains a verbatim authoring and export
  surface. Reordering changes only the sequence of blocks in the exported document. Styles
  affect presentation only and never appear in Markdown.
- **`file://` verification**: Open `index.html` directly from disk with no server, build step,
  installation, or network, in at least two supported browsers. Create four blocks, drag the
  first onto the third, confirm the sequential shift, save, close, and reopen the document from
  the directory. Open the saved Markdown from disk and confirm source order. Switch through
  every style in light and dark mode with networking disabled and confirm there are no remote
  requests, missing assets, or content changes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reorder blocks with a sequential row shift (Priority: P1)

As a prompt author, I want dragging one block onto another to shift the intervening blocks one
position at a time, so that a prompt reads as a continuous ordered sequence and no block is
silently displaced from its place.

**Why this priority**: The sequential shift is the defining interaction of this feature. It
replaces the earlier swap model and determines the reading order of every exported prompt.

**Independent Test**: Create blocks A, B, C, and D in that reading order. Drag A onto C and
release. Confirm the resulting order is B, C, A, D: A occupies C's former position, B occupies
A's former position, C occupies B's former position, and D is unchanged. Repeat in the reverse
direction and cancel once before release.

**Acceptance Scenarios**:

1. **Given** blocks A, B, C, and D in that order, **When** A is dragged onto C and released,
   **Then** the order becomes B, C, A, D; A takes C's former position, B takes A's former
   position, C takes B's former position, and D does not move.
2. **Given** blocks A, B, C, and D in that order, **When** D is dragged onto B and released,
   **Then** the order becomes A, D, B, C; D takes B's former position, B takes C's former
   position, C takes D's former position, and A does not move.
3. **Given** a block is dragged over several blocks in sequence, **When** the pointer moves
   from one target to another before release, **Then** each preview is recalculated from the
   pre-drag order, not from the previous preview, and only the current target range shifts.
4. **Given** a block is dragged beyond the last block and released, **When** the drop is in the
   append area, **Then** the block becomes the last block in reading order and all blocks
   between its former position and the end shift one position toward its former position.
5. **Given** a block is dragged over its own position, **When** it is released, **Then** the
   order does not change.
6. **Given** a block is being dragged, **When** the drag is canceled with Escape, interrupted,
   or released outside every valid drop target, **Then** every block returns to its pre-drag
   position and the document is not marked as changed by the canceled drag.
7. **Given** a block is focused or selected, **When** the user clicks or taps it without
   moving beyond the drag threshold, **Then** no reorder occurs.
8. **Given** a block is dragged across rows, **When** the drop is committed, **Then** the
   reading-order shift is applied across the intervening blocks and the result is reflowed
   without overlap.
9. **Given** a reorder completes, **When** the layout settles, **Then** focus and selection
   remain on the moved block rather than moving to another block or to a position.
10. **Given** a drag is in progress, **When** the viewport is resized, **Then** the drag is
    canceled or recomputed safely and no block is lost, duplicated, or left between positions.
11. **Given** two or more blocks are selected, **When** the user drags any selected block,
    **Then** the whole selection moves as one contiguous group, its relative order is
    preserved, and the group remains selected.
12. **Given** an empty area of the canvas, **When** the user drags a selection rectangle over
    several blocks, **Then** every intersected block becomes selected and can be dragged as a
    group.

---

### User Story 2 - Insert, remove, and persist the ordered layout (Priority: P1)

As a prompt author, I want new blocks to be inserted in order, removed blocks to close their
gap, and the resulting layout to survive save and reopen, so that the document always has a
predictable sequence with no unexplained holes.

**Why this priority**: A sequential shift model is only coherent if insertion and removal use
the same ordered-sequence rules. Without persistence, reordering would be lost on reload.

**Independent Test**: Create four blocks, insert a new block after the second, remove the
first, save, reload from the directory, and confirm the remaining blocks occupy consecutive
positions in the expected order. Open the saved Markdown from disk and confirm the source order
matches.

**Acceptance Scenarios**:

1. **Given** blocks A, B, and C, **When** a new block X is created from A's "+" control,
   **Then** X appears after A, B shifts one position later, C shifts one position later, and
   the order becomes A, X, B, C.
2. **Given** blocks A, B, and C, **When** a new block X is created at the end of the document,
   **Then** the order becomes A, B, C, X.
3. **Given** blocks A, B, and C, **When** B is removed, **Then** the order becomes A, C with no
   gap between them.
4. **Given** a blank document, **When** the first block is created, **Then** it occupies the
   first position in the sequence.
5. **Given** a saved document with a reordered sequence, **When** it is reopened from the
   directory, **Then** every block returns to the same position and the same reading order.
6. **Given** a Markdown file is opened from disk, **When** its blocks are placed, **Then** they
   fill consecutive positions in source order with no gaps.
7. **Given** a document saved under the previous free-position model, **When** it is opened,
   **Then** its blocks are assigned consecutive positions in their previous reading order with
   no content lost or reordered.
8. **Given** a narrow viewport, **When** blocks occupy positions and the directory drawer is
   opened and closed, **Then** the layout remains usable and the page does not scroll
   horizontally.

---

### User Story 3 - Keep reading order, output, and saved documents consistent (Priority: P1)

As a prompt author, I want the visible sequence to be the same order used by Preview, Copy, and
Save so that rearranging blocks never changes what the exported prompt says beyond the intended
reorder.

**Why this priority**: An ordered editor is only trustworthy if the generated Markdown matches
the arrangement the user sees. Inconsistent order would silently corrupt prompts.

**Independent Test**: Place blocks in multiple rows, reorder across rows, save, reopen, open
Preview, copy the Markdown, and compare all results. Confirm the order follows rows from top to
bottom and columns from left to right, and the text is byte-identical between Copy and Save.

**Acceptance Scenarios**:

1. **Given** blocks in multiple rows and columns, **When** the reading order is calculated,
   **Then** blocks are ordered by row from top to bottom and, within a row, from left to right.
2. **Given** a completed reorder, **When** Preview is opened, **Then** blocks appear in the new
   sequence.
3. **Given** a completed reorder, **When** Copy is used, **Then** the Markdown matches the Save
   result exactly and uses the new sequence.
4. **Given** a document with a saved sequence, **When** it is reopened from the directory,
   **Then** every block returns to the same position and the same reading order.
5. **Given** a document saved under the previous free-position model, **When** it is opened,
   **Then** its previous reading order is preserved as a consecutive sequence.

---

### User Story 4 - Move blocks with keyboard, touch, or assistive input (Priority: P2)

As a keyboard, touch, or assistive-technology user, I want to move a block between positions
without a mouse so that I can reorder a prompt with the same result as a mouse user.

**Why this priority**: The existing editor already supports keyboard movement and touch
dragging. The new sequence model must preserve that access rather than making a mouse drag the
only way to reorder blocks.

**Independent Test**: Focus a block, move it one position with the keyboard, and confirm the
same sequential shift as a drag. Repeat across a row boundary, confirm the announcement, then
drag a block by touch and confirm the page does not scroll.

**Acceptance Scenarios**:

1. **Given** a focused block, **When** the user moves it one position forward or backward with
   the keyboard, **Then** the same sequential shift is applied as a drag to that position.
2. **Given** a keyboard move, **When** it completes, **Then** focus remains on the moved block
   and an announcement identifies the block, its new position, and the blocks that shifted.
3. **Given** the user has requested reduced motion, **When** blocks shift after a drag or
   keyboard move, **Then** the final arrangement is shown without animated movement while the
   target state remains understandable.
4. **Given** a touch device, **When** the user drags a block by its drag handle onto another
   position, **Then** the sequential shift occurs, the page does not scroll, and block editing
   does not start.

---

### User Story 5 - Choose a tech-site-inspired visual style (Priority: P2)

As a user, I want to choose from a curated set of technology-website-inspired visual styles so
that the workspace matches a visual mood I like without changing my content or workflow.

**Why this priority**: The previous two styles cover only two moods. The new style pack
replaces them and makes the workspace more personal while preserving the same structure and
behavior. It is secondary to correct reordering but part of the same release.

**Independent Test**: Open the style selector, apply each of the ten styles in light and dark
mode, reload, and confirm the chosen style is restored. Confirm that switching styles never
changes block text, order, Markdown, or saved files, and that no network request or remote asset
is introduced.

**Acceptance Scenarios**:

1. **Given** the header is visible, **When** the style selector is opened, **Then** it offers
   ten technology-inspired styles under clear Traditional Chinese labels.
2. **Given** a style is selected, **When** the selection is made, **Then** the entire interface
   updates immediately and the choice persists after reload.
3. **Given** any of the ten styles, **When** the user switches between light and dark mode,
   **Then** both variants remain legible, visually distinct, and consistent with that style's
   palette and typography.
4. **Given** a style is selected, **When** the user edits, reorders, previews, copies, or saves
   a document, **Then** content, ordering, Markdown, and file output are unchanged.
5. **Given** the user has an existing Paper or Graphite preference, **When** the new version
   loads, **Then** the workspace falls back to Apple without breaking other preferences, and
   Apple is the default for new users.
6. **Given** a narrow viewport, **When** the style selector is used at 360 px, **Then** every
   style can be reached and the header does not overflow horizontally.
7. **Given** any new style, **When** the interface is inspected with networking disabled,
   **Then** no remote font, image, logo, or stylesheet is requested and no brand asset is
   embedded.
8. **Given** a stored style value that is missing or unsupported, **When** the page loads,
   **Then** the workspace falls back to Apple without breaking the rest of the preferences.

---

### Edge Cases

- What happens when a dragged block crosses several positions quickly? Each preview is computed
  from the pre-drag order; only the current source-to-target range shifts.
- What happens when a block is dragged over its own position? No shift is previewed or
  committed.
- What happens when a block is dragged beyond the last block? It is appended, and the blocks
  between its former position and the end shift toward its former position.
- What happens when a drag is interrupted by window focus loss, a browser dialog, or a viewport
  resize? The drag is canceled or safely recomputed; no block is lost, duplicated, or left
  between positions.
- What happens when a target block is taller than the dragged block or contains a large image?
  The sequence remains a single ordered flow; rows expand as needed and neighboring blocks do
  not overlap or hide the drag handle.
- What happens when the layout is narrow or the viewport is resized? The number of columns may
  change, but the reading order and sequence are preserved.
- What happens when a block is removed while the document is being reordered? The reorder is
  canceled or recomputed from the current sequence; no stale target remains.
- What happens when two legacy blocks have the same previous reading-order position? Their
  previous tie-breakers determine a stable consecutive assignment, so no block is dropped.
- What happens when a document has only one block? Dragging it to the append area leaves it in
  the only position; no shift occurs.
- What happens when the clipboard, Preview, or Save is invoked during a drag? The drag ends
  first and the committed sequence is used; no intermediate preview state is exported.
- What happens when a style is applied while a document is open? Only the visual styling
  changes; block content, selection, sequence, and unsaved state are untouched. The grid may
  reflow, but the sequence is preserved.
- What happens when a system font in a style is unavailable? The style falls back through its
  system font stack without loading a remote font.
- What happens when a selected style has insufficient contrast on a particular surface? The
  style is rejected by validation and must be corrected before release.

## Requirements *(mandatory)*

### Functional Requirements: Ordered Layout and Reordering

- **FR-001**: Every committed text block and image block MUST occupy exactly one position in a
  contiguous reading-order sequence. The transient composer MUST indicate where the next block
  will appear.
- **FR-002**: Positions MUST be arranged in a two-dimensional grid filled in reading order.
  Every block position MUST be unique and non-overlapping.
- **FR-003**: Two blocks MUST NOT occupy the same position at the same time, and no two blocks
  may visually overlap because of position placement.
- **FR-004**: Dragging MUST begin from the block's drag handle and only after movement exceeds
  the drag threshold. A click or tap without movement MUST NOT reorder anything.
- **FR-005**: While a block is dragged over a different position, the system MUST preview a
  sequential shift: the dragged block takes the target position, and every block between the
  source and target in reading order shifts one position toward the source.
- **FR-006**: At most one source-to-target range may be previewed at a time. When the drag moves
  to a different target, the preview MUST be recalculated from the pre-drag sequence rather than
  accumulated from the previous preview.
- **FR-007**: Releasing a dragged block on a different position MUST commit the previewed
  sequential shift. The source position MUST be filled by the intervening block nearest the
  source, every other intervening block MUST shift one position toward the source, and the
  target position MUST be occupied by the dragged block. When the dragged block is part of a
  multi-selection, the entire selected group MUST move as one contiguous group, preserving the
  selected blocks' relative order and keeping unselected blocks outside the group.
- **FR-008**: Releasing a dragged block beyond the last block MUST append it to the end of the
  sequence, with every block between its former position and the end shifting one position
  toward its former position. Releasing over the original position, outside every valid drop
  target, or canceling the drag MUST restore the pre-drag sequence and selection and MUST NOT
  mark the document as changed.
- **FR-009**: A successful reorder MUST mark the document as changed and MUST persist in the
  document's local record when it is saved. The exported Markdown MUST contain only block
  content in sequence order, because Markdown has no layout positions.
- **FR-010**: Reading order MUST be rows from top to bottom, then columns from left to right.
  There MUST be no empty sequence positions between blocks. This requirement supersedes the
  previous row-band reading-order rule.
- **FR-011**: Preview, Copy, and Save MUST all use the same sequence-derived reading order. Copy
  and Save MUST produce the same canonical Markdown. Reordering MUST NOT alter block content or
  insert blank lines.
- **FR-012**: A document saved under the previous free-position model MUST open with its blocks
  assigned consecutive positions in the previous reading order, without content loss. The
  conversion MUST NOT mark the document as changed solely because of migration.
- **FR-013**: A Markdown file opened from disk MUST fill consecutive positions in source order.
- **FR-014**: A new block created through an existing block's "+" control MUST be inserted
  immediately after the anchor in reading order, with the anchor's following blocks shifting one
  position later. A new block created at the end MUST append.
- **FR-015**: Removing a block MUST close the gap by shifting every later block one position
  earlier.
- **FR-016**: A blank document MUST place its first composer and first block in the first
  position.
- **FR-017**: Keyboard users MUST be able to move a focused block one position forward or
  backward. The same sequential shift MUST apply, and the result MUST be announced.
- **FR-018**: Touch dragging MUST work from the drag handle without scrolling the page or
  entering edit mode. Touch and mouse input MUST produce the same sequential shift.
- **FR-019**: During a drag, the target position MUST be visibly highlighted and the shifted
  blocks MUST visibly move to their previewed positions. With reduced motion enabled, position
  changes MUST be immediate rather than animated.
- **FR-020**: If the viewport changes during a drag, the drag MUST be canceled or recomputed
  without losing or duplicating blocks and without leaving any block between positions.
- **FR-021**: The ordered layout and drag controls MUST remain usable at 1280×720, 768 px, and
  360×800 without horizontal page scrolling.
- **FR-022**: After a reorder, selection and focus MUST remain on the moved block, not on
  another block or on a position. When a multi-selected group is moved, every block in the
  group MUST remain selected and focus MUST stay on the block used to start the drag. A
  selection rectangle dragged on empty canvas MUST select every text or image block it
  intersects; Cmd/Ctrl MUST add to the selection, Escape MUST restore the pre-marquee selection,
  and a plain empty-canvas click MUST clear it.

### Functional Requirements: Tech-Site Visual Styles

- **FR-023**: The style selector MUST offer exactly ten technology-site-inspired styles and
  MUST NOT offer the legacy Paper or Graphite options.
- **FR-024**: The ten styles MUST be inspired by the following references from the
  getdesign.md catalog: Apple, NVIDIA, Meta, IBM, Stripe, Vercel, Notion, Figma, SpaceX, and
  Spotify. The set MUST span consumer hardware, AI computing, social, enterprise software,
  payments, developer platforms, productivity, design tools, space technology, and music
  streaming.
- **FR-025**: Each of the ten styles MUST provide both a light and a dark variant, and the
  existing light/dark toggle MUST apply to all ten styles.
- **FR-026**: Each style MUST define a complete visual treatment for the workspace, including
  background, surfaces, text, muted text, borders, accent, focus, danger, canvas, blocks,
  preview, menus, overlays, shadows, and toast surfaces.
- **FR-027**: The ten styles MUST be visually distinct from one another through a distinct
  combination of palette, typography treatment, surface hierarchy, corner shape, and elevation.
  They MUST be recognizable as the referenced moods without copying brand logos, proprietary
  artwork, or brand font files.
- **FR-028**: The style pack MUST NOT introduce remote fonts, images, logos, stylesheets, or
  runtime network requests. Typography MUST use system font stacks, and all colors and shapes
  MUST be defined locally.
- **FR-029**: Text and interactive controls in every style and mode MUST meet WCAG 2.1 AA
  contrast: at least 4.5:1 for normal text and at least 3:1 for large text and user-interface
  components. Focus indicators MUST remain visible on every surface.
- **FR-030**: The selected style MUST persist across reloads and MUST survive clearing the
  local document library, consistent with existing appearance preferences. An unsupported
  stored value MUST fall back to Apple.
- **FR-031**: Switching styles MUST NOT change document content, sequence, selection, unsaved
  state, Markdown, clipboard payloads, or saved files.
- **FR-032**: Style names MUST be presented in Traditional Chinese and MUST clearly describe
  the visual direction. Any user-visible descriptions MUST also be in Traditional Chinese.
  Names and descriptions MUST NOT imply affiliation with, sponsorship by, or endorsement by the
  referenced companies.
- **FR-033**: The style selector MUST remain reachable and usable at 360 px without horizontal
  scrolling or clipped options.
- **FR-034**: The legacy Paper and Graphite options MUST be removed from the selector. A stored
  legacy value MUST fall back to Apple without losing the other preferences, and Apple MUST be
  the default for users without a preference.

### Style Direction

The ten curated references and their intended visual directions are:

| Reference | Intended visual direction |
|-----------|---------------------------|
| Apple | Generous white space, restrained neutral palette, soft depth, minimal borders, calm hierarchy. |
| NVIDIA | Near-black technical surfaces, energetic green accent, precise compact typography, high-contrast edges. |
| Meta | Editorial composition, crisp binary light/dark surfaces, confident blue accent, clean geometric spacing. |
| IBM | Structured grid, enterprise blue palette, utilitarian typography, restrained ornament and sharp alignment. |
| Stripe | Refined gradients, elegant purple accent, airy typography, precise spacing and soft elevation. |
| Vercel | High-contrast black and white, geometric precision, thin borders, minimal chrome and tight typography. |
| Notion | Warm paper-like surfaces, serif display accents, soft corners, quiet hierarchy and generous line height. |
| Figma | Vibrant multi-color accents, playful geometric shapes, confident contrast, rounded and energetic surfaces. |
| SpaceX | Stark monochrome, dramatic scale, futuristic restraint, sharp edges and minimal decoration. |
| Spotify | Immersive dark canvas, vivid green accent, bold display type, energetic contrast and rounded controls. |

These directions are independent interpretations. User-facing style names are descriptive
Traditional Chinese labels, not brand names. Each direction must be achieved with locally
defined visual treatments and system font stacks; no reference photography, logo, proprietary
font, or remote asset is bundled.

### Key Entities

- **Prompt Document**: A saved or unsaved prompt containing text blocks, image blocks, and an
  ordered sequence. Its Markdown reading order is the sequence order.
- **Block**: A text or image item that occupies exactly one position in the sequence. A block
  retains its content, Marker, image asset, and identity when it moves.
- **Position**: A row-and-column position in the ordered grid. Positions are always filled in
  reading order with no gaps.
- **Composer**: The transient input used to create a block. It previews the position where the
  next block will appear and becomes a block when committed.
- **Visual Style**: A named appearance preset containing palette, typography, surface,
  border, radius, shadow, and state styling for both light and dark modes.
- **Workspace Preference**: A per-device setting containing the selected style, light/dark
  choice, default Marker, and grid visibility.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of forward and backward reorder operations, every block between the
  source and target shifts exactly one position toward the source, the dragged block occupies
  the target position, and no block is lost, duplicated, or left with a gap.
- **SC-002**: In 100% of canceled, out-of-bounds, or no-movement drags, the document returns to
  its pre-drag sequence.
- **SC-003**: Clicking or tapping without dragging produces zero unintended reorders.
- **SC-004**: After inserting a block, removing a block, saving, and reopening, 100% of blocks
  occupy the expected consecutive positions in the expected order.
- **SC-005**: Preview, Copy, and Save present the same block sequence and content; Copy and Save
  produce byte-identical Markdown in 100% of reorder scenarios.
- **SC-006**: A keyboard-only user can move a block forward or backward through the sequence and
  complete a cross-row reorder without using a mouse.
- **SC-007**: Drag target feedback appears within 100 ms for a document containing 500 blocks,
  and the drag remains responsive throughout the gesture.
- **SC-008**: The editor has no horizontal page scrolling at 1280×720, 768 px, and 360×800 while
  blocks occupy positions and the directory drawer is opened and closed.
- **SC-009**: 100% of documents saved under the previous free-position model open with their
  former reading order preserved.
- **SC-010**: Every keyboard reorder announces the moved block and its new position, and every
  drag provides a visible target state before release.
- **SC-011**: In a document with at least four blocks, a user can complete a two-position
  reorder in under 5 seconds without opening a menu or dialog.
- **SC-012**: The style selector offers ten distinct styles, and 100% of them persist after
  reload in both light and dark mode.
- **SC-013**: 100% of new style combinations pass the defined WCAG 2.1 AA contrast checks for
  text, controls, and focus indicators.
- **SC-014**: 100% of style switches leave document content, sequence, Markdown, clipboard
  output, and saved files unchanged.
- **SC-015**: The application makes zero remote requests or asset loads when any new style is
  active with networking disabled.
- **SC-016**: All ten styles remain selectable at 360 px with no horizontal page scrolling.
- **SC-017**: A stored legacy Paper or Graphite preference falls back to Apple while all other
  preferences survive, and new users see Apple as the default.
- **SC-018**: 100% of user-visible style names and any descriptions are in Traditional Chinese
  and contain no claim of affiliation with or endorsement by a referenced company.
- **SC-019**: The delivered application bundles zero brand logos, official brand artwork, or
  proprietary font files; every style uses system fonts and locally defined visuals.

## Assumptions

- "整排區塊依序推移" is interpreted as a **sequential insertion shift**, not a two-block swap.
  When block A is dragged onto block C, the blocks between A and C shift one position toward
  A's former position; A takes C's former position. In a four-block example, A, B, C, D
  becomes B, C, A, D.
- The feature directory and branch name retain `003-slot-drag-reorder` for continuity even
  though the behavior is sequential reordering with no empty positions.
- The source position is filled by the intervening block nearest the source, not necessarily by
  the target block. The target block moves one position closer to the source.
- The ordered sequence is contiguous. There are no intentionally empty positions between
  blocks. Deleting a block closes its gap, and inserting a block opens a gap that is
  immediately filled by shifting later blocks.
- The layout is a two-dimensional grid filled row by row. Exact column counts, position
  dimensions, gutters, and responsive reflow rules are design details for planning.
- Free-position coordinates from the previous model are not preserved as coordinates. Migration
  assigns consecutive positions in the previous reading order while preserving content,
  Markers, images, and block identity.
- "Top ten tech websites" is a curated selection from the getdesign.md catalog: Apple, NVIDIA,
  Meta, IBM, Stripe, Vercel, Notion, Figma, SpaceX, and Spotify. It is not an official ranking
  by getdesign.md. Apple (`apple`, 簡約留白) is the default visual style. The selection
  favors recognizable technology brands with distinct design analyses and broad coverage of
  technology categories. Linear was considered but excluded
  because the catalog does not currently provide a design analysis for it.
- The new styles are independent, inspired interpretations. They do not use brand logos,
  proprietary fonts, official assets, or claims of affiliation.
- Exact color values, type scales, radii, and shadows are design details for planning and must
  still satisfy the contrast and offline requirements.
- The style selector remains a global per-device preference, not a per-document property.
- Existing document content, Markdown serialization, file operations, search, settings,
  clipboard behavior, and storage degradation remain unchanged except where this feature
  explicitly replaces position handling, reading order, and the appearance style set.
- The feature applies to text and image blocks. The composer is transient and does not appear
  in saved Markdown.
- Users may drag with a mouse or touch and may move blocks with the keyboard. Multi-block
  selection is defined by the block-selection requirements; dragging any selected block moves
  the selection as a group.
- Automatic sorting by Marker, content, creation time, or image type is out of scope.

## Out of Scope

- Changing Markdown syntax, Markers, block editing, or image processing.
- Changing file open, save, download, or directory-location behavior.
- Changing Preview, Copy, or clipboard payload formats.
- Free pixel-level positioning, intentionally empty layout gaps, or arbitrary canvas placement.
- Automatic grouping beyond explicit Cmd/Ctrl selection or marquee range selection.
- Automatic layout compaction by block type or automatic sorting.
- Importing or fetching DESIGN.md files at runtime from getdesign.md or any other site.
- A custom theme editor, color picker, or user-uploaded style files.
- Brand logos, brand font files, proprietary artwork, or official brand assets.
- Per-document styles or synchronization between devices.
