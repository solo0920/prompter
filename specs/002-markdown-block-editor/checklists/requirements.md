# Specification Quality Checklist: Markdown Block Editor

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validation passed on 2026-10-28.
- No `[NEEDS CLARIFICATION]` markers remain.
- Clarification session 2026-10-28 resolved 3 questions; checklist remains 16/16.
- 45 functional requirements and 16 measurable outcomes are defined.
- The specification is ready for `/speckit.plan`.

## Post-Implementation Verification (2026-10-29)

- Unit and contract tests: **105 passing, 0 failing** (`node --test tests/unit/*.test.js`).
  Coverage includes model defaults, Marker detection and rank ordering, blank-line/newline
  round-trips, reading order, search, renderer escaping, clipboard payloads, preferences,
  storage degradation, file-name/path safety, composer Markdown splitting, and static
  no-network guards.
- Browser harness: **102 passing, 0 failing** in Chrome 156.0.8078.49, the required release
  gate. Firefox 159.0 also passes as the supplementary check. Chrome and Firefox pass with
  browser networking disabled.
- Math: local KaTeX 0.19.1 renders `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` delimiters in
  headings, lists, quotes, tables, and paragraphs, including multi-line display math and AMS
  environments; fenced code stays literal and unsafe commands are not trusted. Rich HTML copy
  uses self-contained MathML so it does not depend on the Preview stylesheet.
- Multi-line input: the composer and block editor are auto-growing text areas; Shift+Enter
  inserts a line break, Enter commits, width grows up to the maximum before wrapping, and
  height grows so every line remains visible.
- Composer Markdown splitting: pressing Enter on a pasted multi-line Markdown value creates one
  block per obvious marker line in source order, keeps contiguous unmarked prose grouped,
  preserves blank-line separation, leaves plain multi-line text and fenced code intact, and
  focuses the next composer after the last block.
- Collapsible sections: blocks with lower-ranked content show a text-sized chevron icon before
  the Marker; `#` > `##` > `###` > `-` > `1.` > `>` > `.` > unmarked content. Collapsing hides
  the section from the canvas but not from Save, Preview, or Copy; expanding preserves nested
  states; hidden blocks are skipped by keyboard navigation; the composer moves after a collapsed
  section; and dragging or moving a collapsed section with the keyboard carries its hidden
  descendants.
- Heading indentation: `#` stays at the base column, `##` under an open `#` steps right once,
  `###` steps right twice, and content aligns with the next nesting step. New same/higher-level
  headings restore shallower columns; composers align with their section; Markdown order and
  text stay unchanged; indented blocks remain inside the canvas at 360 px.
- Preview drafts: composer and block-editor drafts appear in Preview while typing, update on
  Marker changes, and revert when the composer is dismissed or the edit is canceled.
- Tab focus: tabbing into a text block starts editing directly with all text selected, and
  tabbing into its title/Marker opens the Marker menu without leaving the Tab cycle.
- Arrow focus: Up/Down into an adjacent text block starts editing with all text selected; while
  editing, plain Up/Down commit the current edit and continue to the next item, staying in edit
  mode when the destination is text.
- Golden fixtures: markers, marker-only lines, blank lines, CRLF/BOM, no final newline,
  unicode, trailing spaces, code, tables, data-URL images, unmatched images, and duplicate
  image basenames all round-trip.
- Performance: 500-document render under 1 s; 500-document search under 300 ms; 500-block
  Preview under 1 s; inserted image visible under 1 s.
- Responsive checks: 1280×720, 768 px, and 360×800 have no horizontal page scrolling; the
  drawer and compact header remain reachable.
- Accessibility checks: unique IDs, accessible names, dialog labels, live regions, skip link,
  focus return, keyboard movement announcements, and reduced-motion CSS.
- Storage checks: IndexedDB-blocked localStorage fallback, both-blocked memory mode, quota
  rollback, corrupt-payload isolation with recovery, and the dismissible storage banner.
- Clipboard checks: exact Markdown equals the Save plan; async path, `execCommand` fallback,
  manual-copy dialog, missing/oversized image warnings, text-only Markdown-only flavors, and
  rich HTML when images are present are covered.
- Selection checks: Cmd-click multi-selection, bright orange highlighting, batch Marker updates,
  marquee range selection with additive Cmd/Ctrl behavior, whole-group pointer dragging with
  relative-order preservation, and Escape restoration are covered.
- Hover checks: the left border-to-Marker hover zone opens the flyout without a grab cursor,
  while the right side retains the grab cursor and add control; the flyout sits above the title
  row, is horizontally centered there, and shows `× 1. > .` over `- # ## ###`; hover flyouts
  stay open while the pointer is over the Marker or flyout, then close after leaving both,
  selecting, Escape/Tab, or an outside click.
- Workspace checks: the right-side live preview opens by default for new, opened, and restored
  documents, refreshes after edits and tab switches without hiding the canvas, and stays closed
  after the user closes it; document tabs open, switch, keep their active title editable, close
  with an `×`, prompt on dirty close, and restore the empty workspace after the last tab. While
  preview is open, the active filename and file icon appear as a tab-styled label aligned with the
  preview pane boundary, with its own `×` next to the preview toggle; closing preview by either
  control leaves only the preview icon.
- Deletion checks: Delete/Backspace removes multi-selected text and image blocks, closes gaps,
  clears selection, adjusts the composer, focuses the canvas or composer, and is ignored while
  typing in the composer or block editor.
- Keyboard navigation checks: Up/Down sequence-item selection including the composer at its slot
  with first/last wrap, focus-zone preservation across items, text-zone entry into edit mode with
  all text selected, priority Up/Down navigation that commits the current edit and continues in
  the adjacent block, Tab/Shift+Tab cycling confined to the current block or composer with
  text → title → drag handle → actions → root order, Tab-started editing, Tab-opened Marker menu,
  Enter/F2 editing, composer-handle Up/Down slot movement, Space-opened Marker menu with arrow
  selection, and drag-handle Up/Down reordering with retained handle focus.
- Recorded exceptions: real rich-text destination paste, a physical touch device, screen-reader
  spot checks, and real OS pickers remain manual. Safari is outside the automated and manual
  acceptance scope; Chrome is the required release gate.
- The native tab-close Stay/Leave limitation remains accepted as documented in `plan.md`.

Final status: implementation and automated verification are complete; the remaining items are
manual environment checks with documented fallbacks.
