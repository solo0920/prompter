# Feature Specification: Start Screen and Recent Documents

**Feature Branch**: `004-start-screen`

**Created**: 2026-10-30

**Status**: Implemented

**Input**: User description: "重新整理後改成左方顯示近期編輯的十個檔案，點選後可開啟，右方則有新增文件，開啟目錄等選項"

## Summary

A full page load now opens a start screen instead of automatically reopening the last document.
The left side lists up to ten recently edited files from the local library, newest first. Each
row opens that document in a new tab. The right side offers New document, Open directory, and
Open file actions, plus a bundled `example.md` that demonstrates seven Markdown syntaxes. The
start screen remains the empty state after the last tab is closed.

## User Scenarios & Testing

### User Story 1 - Resume from recent files (Priority: P1)

As a returning user, I want the first screen after a refresh to show my most recently edited
files so that I can reopen one without searching the directory.

**Why this priority**: Reopening recent work is the fastest path back into the app and replaces
the previous behavior of implicitly restoring one document.

**Independent Test**: Save twelve documents with different update times, reload the page, and
confirm that the ten newest appear in order. Select one and confirm it opens in a tab.

**Acceptance Scenarios**:

1. **Given** a saved library and any previous `lastDocumentId`, **When** the page loads or is
   refreshed, **Then** the start screen is visible, no document is opened automatically, and the
   left side lists at most ten documents sorted by `updatedAt` descending.
2. **Given** the recent list, **When** the user selects an entry, **Then** that document opens in
   a tab, the start screen is hidden, and the editor is restored.
3. **Given** an empty library, **When** the start screen loads, **Then** the left side shows an
   empty-state message instead of a recent list.

### User Story 2 - Start from a primary action (Priority: P2)

As a user, I want the start screen to offer the common entry actions so that I can begin without
opening a menu first.

**Independent Test**: From the start screen, create a document, open the document directory, and
confirm each action leaves the app in the expected state.

**Acceptance Scenarios**:

1. **Given** the start screen, **When** the user activates New document, **Then** an unsaved
   `Untitled` document opens, the composer receives focus, and the start screen is hidden.
2. **Given** the start screen, **When** the user activates Open directory, **Then** the document
   directory opens and its search field receives focus.
3. **Given** the start screen, **When** the user activates Open file, **Then** the existing
   Markdown file picker opens.

### User Story 3 - Return to the start screen (Priority: P3)

As a user, I want closing my last tab to return me to the start screen rather than an empty
canvas.

**Independent Test**: Open a recent document, close its last tab, and confirm the start screen
returns with the recent list intact.

**Acceptance Scenarios**:

1. **Given** a document is open, **When** its last tab closes, **Then** the start screen returns,
   the recent list refreshes, and focus moves to the first recent file or New document.
2. **Given** the start screen is visible, **When** a recent file is saved or its title changes,
   **Then** the list order and labels update from the refreshed local library.

### User Story 4 - Explore the bundled Markdown example (Priority: P3)

As a new user, I want a ready-made Markdown file on the start screen so that I can see the
editor and preview in action without preparing a file first.

**Independent Test**: From the start screen, open the `example.md` card and confirm that all
seven sample sections appear in the editor and preview, and that the file can be downloaded.

**Acceptance Scenarios**:

1. **Given** the start screen, **When** it is visible, **Then** the right column shows a
   downloadable `example.md` card for the seven-syntax sample.
2. **Given** the example card, **When** the user activates it, **Then** an unsaved document opens
   with the sample content, the start screen hides, and the preview shows its code, table, and
   math.
3. **Given** the example is open, **When** the user returns to the start screen, **Then** the
   library still contains only the user's saved documents.

## Requirements

- **FR-001**: The application MUST show the start screen after every full load or refresh,
  regardless of the stored `lastDocumentId`.
- **FR-002**: The start screen MUST list at most ten documents, sorted by `updatedAt` descending,
  with one compact row per document showing only the file name and last-modified time.
- **FR-003**: Selecting a recent document MUST open it in a tab using the existing saved-document
  path, including its stored file target.
- **FR-004**: The start screen MUST provide New document, Open directory, and Open file actions.
- **FR-005**: Open directory MUST reveal the existing document directory and focus its search
  input without dismissing the start screen.
- **FR-006**: The start screen MUST show a clear empty state when the library has no documents.
- **FR-007**: Closing the last open tab MUST return to the start screen.
- **FR-008**: The start screen MUST hide the editor and preview surfaces while visible and restore
  them when a document opens.
- **FR-009**: The start screen MUST remain usable from `file://`, offline, without a build step or
  network request, consistent with the rest of the application.
- **FR-010**: On narrow viewports the actions MUST stack above the recent list and the page MUST
  not scroll horizontally.
- **FR-011**: The start screen right column MUST surface the bundled `example.md`, including a
  direct download link, without fetching it over the network.
- **FR-012**: Opening the example MUST create an unsaved document from the bundled Markdown and
  MUST NOT add it to the local library until the user explicitly saves it.
- **FR-013**: The bundled example MUST contain headings, unordered lists, ordered lists,
  blockquotes, inline and fenced code, inline and display LaTeX, and a table.

## Success Criteria

- **SC-001**: With twelve saved documents and a stale `lastDocumentId`, a refresh shows exactly
  the ten newest entries in descending update order and opens no document.
- **SC-002**: Clicking a recent entry opens the correct document and restores the editor and tabs.
- **SC-003**: New document focuses the composer; Open directory focuses the search field; both
  leave the start screen in the expected state.
- **SC-004**: The empty library, 390 px, 768 px, and 1440 px layouts have no horizontal overflow
  and keep all start actions reachable.
- **SC-005**: The `example.md` card is visible in the right column, downloads the real file,
  opens the same content without a network request, and leaves the stored library unchanged.

## Verification (2026-10-31)

- 108 unit tests pass, including confirmation that the bundled script matches `example.md`
  byte-for-byte and that the sample parses into a valid document.
- 113 browser tests pass in Chrome, Firefox, and Edge, online and offline from `file://`. The
  example check covers the right-column card, the download link, opening the unsaved document,
  every source line, and the preview's code, table, and KaTeX output.
- Manual Chrome checks at 1440×900, 768×900, and 390×844 confirmed the two-column desktop
  layout, the stacked mobile layout, the absence of horizontal scrolling, and the refresh
  behavior with a stale `lastDocumentId`.
- Safari testing remains paused at the user's request.

## Notes

- `restoreLastDocument()` remains available as an API for explicit callers and historical tests,
  but application startup no longer calls it.
- Recents are based on persisted `updatedAt` values, so unsaved edits do not reorder the list
  until the document is saved.
- The existing document directory remains the full-library browser; the start screen is a
  shortcut surface, not a replacement.
