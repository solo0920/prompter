# Requirements Checklist: Start Screen and Recent Documents

**Feature**: `004-start-screen` | **Date**: 2026-10-30

## Functional

- [x] Startup and every full refresh show the start screen; no document is auto-opened from
  `lastDocumentId`.
- [x] The left side lists at most ten documents sorted by `updatedAt` descending.
- [x] Each recent row shows the document title, file name, and last-modified time.
- [x] Selecting a recent row opens that saved document in a tab and hides the start screen.
- [x] New document creates an unsaved `Untitled` document and focuses the composer.
- [x] Open directory reveals the existing directory drawer and focuses its search input.
- [x] Open file delegates to the existing Markdown file picker.
- [x] An empty library shows the recent-list empty state and hides the list.
- [x] Closing the last tab returns to the start screen and refreshes the recent list.
- [x] Saving or renaming a document refreshes the recent labels and order.

## Layout and Accessibility

- [x] Desktop uses a two-column layout with recents on the left and actions on the right.
- [x] At 900 px and narrower the actions move above the recents; the primary action spans the
  available width.
- [x] At 560 px and narrower the actions and recent rows use a single column.
- [x] The editor and preview are removed from layout while the start screen is visible.
- [x] The start screen has no horizontal overflow at 390 px, 768 px, or 1440 px.
- [x] Recent items expose an accessible open label; action buttons use native buttons with
  visible focus.
- [x] The skip link targets the workspace rather than the hidden canvas.

## Constraints

- [x] No build step, server, network request, or new dependency is introduced.
- [x] `file://` and offline operation remain supported.
- [x] Existing directory search, tabs, preview, save, and unsaved-change flows are unchanged.

## Verification

- **105** unit tests pass.
- **110** browser tests pass in Chrome 156, Firefox 159, and Edge 156, online and offline.
- Manual Chrome verification covered 1440×900, 768×900, and 390×844, including a refresh with a
  stale `lastDocumentId`, opening a recent file, New document, Open directory, and the empty
  library state.
- Safari testing is paused at the user's request and was not launched.
