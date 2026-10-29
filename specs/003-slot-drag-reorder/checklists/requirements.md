# Specification Quality Checklist: Sequential Block Reordering and Tech-Site Styles

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

## Reordering Requirements Quality

- [x] The shift direction is unambiguous in both forward and backward drags, including the
  resulting source, target, and intervening positions.
- [x] Dragging beyond the last block and dragging over the block's own position are defined.
- [x] Canceled, interrupted, no-movement, and out-of-bounds drags restore the pre-drag sequence.
- [x] Insertion, removal, and blank-document behavior preserve a contiguous sequence with no
  unexplained gaps.
- [x] Preview, Copy, and Save use the same sequence-derived order; persistence and migration
  preserve it.
- [x] Keyboard, touch, reduced-motion, focus retention, and announcement behavior are defined.
- [x] Responsive layout and drag-feedback performance are measurable.

## Style Requirements Quality

- [x] The ten-style set and the ten technology references are enumerated.
- [x] Light and dark variants, immediate application, and persistence are defined.
- [x] Offline delivery is explicit: no remote fonts, images, logos, stylesheets, runtime
  network requests, or bundled brand assets.
- [x] Contrast and focus-visibility requirements are measurable against WCAG 2.1 AA.
- [x] Brand independence, system-font typography, and Traditional Chinese naming are explicit.
- [x] Style switching cannot change content, order, Markdown, clipboard output, or saved files.
- [x] Removal of the legacy Paper and Graphite options, their fallback to Apple, and the Apple default are defined.
- [x] Style-selector usability at 360 px is covered.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria.
- [x] User scenarios cover primary flows.
- [x] Feature meets measurable outcomes defined in Success Criteria.
- [x] No implementation details leak into specification.

## Constitution Alignment

- [x] Static-first, `file://`-openable delivery is preserved: no server, build step, module
  import, or local `fetch()` is required.
- [x] Offline and self-contained: all runtime assets remain local and fonts remain system stacks.
- [x] The standardized prompt contract is unaffected: reordering and styling never rewrite
  prompt content or add filler.
- [x] Copy fidelity is preserved: Copy and Save use the same canonical Markdown.
- [x] Minimal, testable implementation: each requirement is verifiable by opening the page from
  disk and following documented steps.
- [x] Browser support and the clipboard fallback behavior from feature 002 remain in force.
- [x] Storage remains browser-local and degrades gracefully when unavailable.

## Validation Notes

- The core interpretation is a **sequential insertion shift**, not a two-block swap. With blocks
  A, B, C, D in reading order, dragging A onto C produces B, C, A, D. The source position is
  filled by the intervening block nearest the source, and the dragged block takes the target
  position.
- The ordered sequence is contiguous. There are no intentionally empty positions between
  blocks; deleting a block closes its gap, and inserting a block shifts later blocks later.
- Reading order is row-major: rows from top to bottom, then columns from left to right.
  Markdown contains only block content in sequence order.
- The ordered layout is stored in the document's browser-local record. The Markdown file contains
  content and source order only; opening a Markdown file from disk starts a contiguous layout.
- Documents saved under the free-position model migrate on open to consecutive positions in
  their previous reading order, with no content loss. Legacy coordinates are discarded; content,
  Markers, images, and block identity are preserved. Migration alone does not mark the document
  as changed.
- The ten new style references were checked against the getdesign.md catalog: Apple, NVIDIA,
  Meta, IBM, Stripe, Vercel, Notion, Figma, SpaceX, and Spotify. This is a curated set inspired
  by those analyses, not an official getdesign.md ranking. Linear was excluded because the
  catalog does not currently provide a design analysis for it.
- The spec replaces only the free-position drag model and row-band reading order from feature
  002, and expands the appearance set. All other feature 002 behavior remains in force.
- The new styles are independent interpretations: no brand logos, official assets, proprietary
  font files, or implied affiliation.
- Apple (`apple`, 簡約留白) is the default for new users. Stored Paper or Graphite preferences
  fall back to Apple without changing the other preferences.
- As implemented, committed blocks occupy a contiguous vertical sequence. Dragging previews the
  sequential shift, Escape/blur/out-of-bounds drops cancel it, and legacy documents migrate on
  their first render without being marked dirty. A multi-selected group drags as one contiguous
  group and stays selected after the drop. A marquee dragged on empty canvas selects the blocks
  it intersects, including additive Cmd/Ctrl selection. Delete/Backspace removes every selected
  block and closes the resulting gaps. Up/Down moves through blocks and the composer at its
  sequence slot with first/last wrap, including while a block is being edited: the current edit
  commits and navigation continues with the destination text block in edit mode and all text
  selected. Tab cycles within the current block or composer item; and Up/Down on a drag handle
  reorders the block while retaining focus.
- Verification: **105 unit tests** and **103 browser tests** pass in Chrome and Firefox,
  online and offline.

## Notes

- All checklist items pass.
- No open clarifications remain; the sequential-shift interpretation is recorded in the spec's
  Assumptions section.
- Reviewed against Prompter Constitution version 1.0.0 (2026-10-28).
- Implemented and verified.
- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`.
