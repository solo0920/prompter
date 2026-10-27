# Feature Specification: Homepage Prompt Library

**Feature Branch**: `001-homepage-prompt-library`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "首頁header具備主要功能 右側有風格選項及light dark 按鈕
body 左方有目錄系統可以查詢之前使用的提示詞文件系統"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and search saved prompts (Priority: P1)

As a returning user, I want to browse and search my previously saved prompt documents in
the left-hand directory so that I can quickly find and reopen a prompt without remembering
where I stored it.

**Why this priority**: Reusing past prompts is the primary value of the homepage. Without
a searchable directory, users would have to remember and recreate previous work.

**Independent Test**: Preload several prompt documents with distinct titles and body text,
open the homepage, search by a title keyword and by a content keyword, clear the search,
and open a document. The story is complete when the correct documents are filtered and
the selected document is readable in the main area.

**Acceptance Scenarios**:

1. **Given** a library with saved prompt documents, **When** the homepage loads, **Then**
   the sidebar lists every document in reverse last-modified order with its title and
   last-modified date/time.
2. **Given** a library with saved prompt documents, **When** the user types a query that
   matches a document title or body, **Then** the sidebar filters to matching documents
   without reloading the page and shows the number of matches.
3. **Given** a search query with no matches, **When** the query is entered, **Then** the
   sidebar shows a no-results message and a clear-search action.
4. **Given** filtered results, **When** the user selects a result, **Then** the full title
   and content appear in the main area and the selected item is visibly marked.
5. **Given** an empty library, **When** the homepage loads, **Then** the sidebar shows an
   empty state with a New Prompt action.

---

### User Story 2 - Use primary actions from the header (Priority: P2)

As a user, I want the main prompt actions in the header so that I can create, save, and
copy prompts from one consistent place while working on the homepage.

**Why this priority**: The header is the persistent action surface. Users need a reliable
way to start a prompt, preserve edits, and copy the finished text without leaving the page.

**Independent Test**: From an empty homepage, create a prompt, enter a title and content,
save it, and copy it. The story is complete when the new document appears in the sidebar,
survives a reload, and the copied text matches the displayed content.

**Acceptance Scenarios**:

1. **Given** the homepage is open, **When** the user activates New Prompt, **Then** a new
   document with the default title "Untitled prompt" and empty content is created, added
   to the top of the sidebar, opened in the main area, and the title is focused.
2. **Given** an active document with edits, **When** the user activates Save, **Then** the
   title and content are persisted, the last-modified time and sidebar order update, and a
   confirmation is shown.
3. **Given** an active document with content, **When** the user activates Copy, **Then**
   the content text is copied exactly as displayed and a confirmation is shown.
4. **Given** no document is active, **When** the homepage is displayed, **Then** Save and
   Copy are disabled while New Prompt remains available.
5. **Given** automatic copying is unavailable, **When** the user activates Copy, **Then**
   the system offers a manual copy fallback instead of failing silently.

---

### User Story 3 - Personalize the homepage appearance (Priority: P3)

As a user, I want to choose a visual style and switch between light and dark modes so that
the homepage suits my preferences and viewing environment.

**Why this priority**: Appearance settings improve comfort and readability but do not block
the core prompt library workflow.

**Independent Test**: Open the homepage, switch between light and dark modes, choose each
available visual style, reload the page, and confirm both choices are retained.

**Acceptance Scenarios**:

1. **Given** the homepage is open, **When** the user activates the light/dark toggle,
   **Then** the interface switches immediately and the control reflects the current mode.
2. **Given** no explicit appearance choice has been made, **When** the homepage loads,
   **Then** it follows the device's current light/dark preference.
3. **Given** the user has chosen a mode or style, **When** the page is reloaded, **Then**
   the explicit choices are restored.
4. **Given** the user selects a visual style, **When** the selection is made, **Then** the
   style applies immediately without changing the light/dark mode.
5. **Given** the style selector is used, **Then** at least two distinct visual style
   presets are available.

---

### Edge Cases

- When the library is empty, the sidebar explains how to create the first prompt and the
  New Prompt action remains available.
- When a search returns no matches, the query remains editable and can be cleared in one
  action.
- When the currently open document no longer matches an active search, it remains open in
  the main area and the sidebar simply excludes it from the results.
- When two documents share the same title, both are distinguishable by last-modified time
  and each opens the correct content.
- When a title or prompt body is very long, the layout remains stable, content is scrollable,
  and the full title is available to assistive technology.
- When local persistence is unavailable or full, the homepage shows a non-blocking warning
  and keeps the current session usable without silently discarding edits.
- When stored library data cannot be read, the homepage loads with an empty library and a
  warning instead of failing entirely.
- When automatic clipboard access is unavailable, a manual copy fallback is provided.
- When the device is 360px wide, the sidebar is hidden behind a labeled toggle and all
  primary actions remain reachable without horizontal page scrolling.
- When the user has not overridden the appearance, a change to the device light/dark
  preference is followed.
- When a search term contains punctuation or symbols, the characters are treated as
  literal text rather than wildcard operators.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The homepage MUST provide three persistent regions: a top header, a left
  sidebar directory, and a main content area.
- **FR-002**: The header MUST display the product name as a home action and MUST expose the
  primary actions New Prompt, Save, and Copy.
- **FR-003**: Save MUST be disabled when no document is active; Copy MUST be disabled when
  no document is active or its content is empty; New Prompt MUST always be available.
- **FR-004**: New Prompt MUST create a document with the default title "Untitled prompt"
  and empty content, add it to the top of the sidebar, open it in the main area, and place
  focus on the title.
- **FR-005**: The main area MUST allow the user to edit the active document's title and
  plain-text content.
- **FR-006**: Save MUST persist the title and content, update the document's last-modified
  time, reorder the sidebar, and show a confirmation.
- **FR-007**: Copy MUST place the active document's content on the clipboard exactly as
  displayed, show a confirmation, and provide a manual fallback when automatic copying is
  unavailable.
- **FR-008**: The sidebar MUST list all saved documents in reverse last-modified order,
  showing each document's title and last-modified date/time.
- **FR-009**: The sidebar MUST provide a search field that filters documents by title and
  content using case-insensitive partial matching, ignores leading and trailing whitespace,
  and supports Traditional Chinese and English text.
- **FR-010**: Search results MUST update without a page reload as the user types, show the
  number of matching documents, and show a no-results message with a clear-search action
  when nothing matches.
- **FR-011**: Clearing the search MUST restore the complete document list.
- **FR-012**: Selecting a directory item or search result MUST open the full document in the
  main area and visibly mark it as selected.
- **FR-013**: The sidebar MUST show an empty state with a New Prompt action when no
  documents are saved.
- **FR-014**: The right side of the header MUST contain a visual style selector and a
  light/dark toggle.
- **FR-015**: The light/dark toggle MUST change the interface immediately, follow the device
  preference until the user makes an explicit choice, and persist the explicit choice.
- **FR-016**: The style selector MUST offer at least two visual style presets, apply the
  chosen style immediately, persist it, and operate independently of the light/dark setting.
- **FR-017**: Saved documents and appearance preferences MUST remain available after the
  page is reloaded in the same browser on the same device.
- **FR-018**: All header, sidebar, and main-area controls MUST be operable by keyboard
  alone, expose accessible names, and show a visible focus indicator.
- **FR-019**: At a 360px-wide viewport, the sidebar MUST be hidden by default behind a
  labeled toggle, all primary actions and search MUST remain reachable, and the page MUST
  NOT require horizontal scrolling.
- **FR-020**: If local persistence is unavailable or full, the system MUST show a
  non-blocking warning, keep the current session usable, and MUST NOT silently discard
  unsaved edits.
- **FR-021**: If stored library data cannot be read, the system MUST open with an empty
  library and a warning instead of failing to load.
- **FR-022**: Creating a new prompt while a search filter is active MUST clear the filter so
  that the new document is visible in the sidebar.

### Key Entities *(include if feature involves data)*

- **Prompt Document**: A saved prompt with a unique identifier, title, plain-text content,
  creation time, and last-modified time. It appears in the sidebar and can be opened in the
  main area.
- **Appearance Preference**: A per-device setting containing the selected visual style and
  color mode (light, dark, or device default). It applies to the entire homepage.
- **Search Query**: Transient text entered in the sidebar search field. It filters Prompt
  Documents and is not stored as part of the library.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a library of 50 prompts, 90% of representative returning users can
  locate a known prompt using search in 10 seconds or less.
- **SC-002**: Search results update within 300 ms for libraries of up to 500 prompts on a
  mid-range laptop.
- **SC-003**: 100% of saved prompt titles, content, and appearance preferences survive a
  page reload in the same browser on the same device.
- **SC-004**: Copied prompt content matches the displayed content 100% of the time,
  including Traditional Chinese characters and line breaks.
- **SC-005**: A user can start a new prompt with one action from any homepage state, and
  the new document appears in the sidebar immediately.
- **SC-006**: 95% of first-time users can switch between light and dark modes and choose a
  visual style without assistance.
- **SC-007**: A keyboard-only user can reach and operate search, appearance controls, and
  all header actions, with a visible focus indicator on every control.
- **SC-008**: The homepage remains usable without horizontal page scrolling at both
  1280×720 and 360×800; at 360px the sidebar is reachable through its toggle.
- **SC-009**: In storage-failure tests, the system shows a warning and preserves 100% of the
  current session's unsaved text.
- **SC-010**: Search returns correct results for a test corpus containing Traditional
  Chinese, English, mixed-language, punctuation, and space-containing prompts.

## Assumptions

- The product is a single-user, local-first application. Accounts, cloud sync, sharing, and
  collaboration are out of scope.
- "Previously used prompts" means documents the user saved in this application. Automatically
  capturing every generated prompt and maintaining version history are out of scope.
- The header's primary actions are New Prompt, Save, and Copy. Import, export, sharing, and
  settings beyond appearance are out of scope for this feature.
- The requested "style options" are visual interface themes, not prompt-writing styles.
- The directory is a flat list sorted by last modified. Nested folders, tags, favorites, and
  bulk management are out of scope.
- The main area supports plain-text title and content editing. Rich text, Markdown preview,
  and advanced formatting are out of scope.
- Search uses literal partial matching. Fuzzy matching and semantic search are out of scope.
- The default color mode follows the device preference; an explicit user choice overrides it
  until changed.
- Documents and preferences are stored locally per browser and device. Clearing browser data
  removes them, and they are not available on another device.
- The interface is desktop-first. On narrow screens, the sidebar collapses behind a toggle
  while all core actions remain reachable.
- The primary interface language is Traditional Chinese, and prompt content may mix
  Traditional Chinese and English.
