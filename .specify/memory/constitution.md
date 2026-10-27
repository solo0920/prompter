# Prompter Constitution

## Core Principles

### I. Static-First, File-Openable Delivery (NON-NEGOTIABLE)

Prompter MUST be delivered as static HTML, CSS, and JavaScript that runs when the entry
page is opened directly from the local filesystem (`file://`). The delivered application
MUST NOT require a web server, backend process, package installation, build step, or
network connection at runtime. Development tooling MAY be used, but it MUST remain
optional for end users; the committed deliverable MUST work as-is. Any feature that
cannot operate under `file://` MUST be redesigned or rejected.

Rationale: zero-setup portability keeps the tool usable on any machine, preserves
longevity, and removes operational surface area.

### II. Standardized Prompt Contract (NON-NEGOTIABLE)

Every generated prompt MUST follow a documented, versioned prompt contract. The contract
MUST define fixed sections in a stable order - role, objective, context, constraints,
output format, and optional examples - with explicit labels and delimiters. Generated
prompts MUST NOT contain conversational filler, apologies, or unexplained formatting.
Any change to the contract MUST be versioned and accompanied by migration notes.

Rationale: a stable contract is what makes output predictable for both humans and AI
consumers.

### III. AI-Legible, Copy-Ready Output

Generated prompts MUST be plain text or Markdown by default, and JSON only when a
machine-readable format is explicitly requested. Output MUST be self-contained,
unambiguous, and usable as AI input without post-editing. Generation MUST be
deterministic: identical inputs and template versions MUST produce identical output. A
single copy action MUST copy exactly the displayed prompt text. When required information
is missing, the tool MUST emit explicit placeholders or clarifying prompts instead of
inventing details.

### IV. Offline and Self-Contained

All runtime assets MUST be bundled with the application. The application MUST NOT depend
on CDNs, remote fonts, analytics, telemetry, or third-party runtime APIs. Fonts MUST use
system font stacks. Optional persistence MUST use browser storage only and MUST degrade
gracefully when storage is unavailable. The application MUST work with networking
disabled in the latest two major versions of Chrome, Edge, Firefox, and Safari.

### V. Minimal, Testable Implementation

Use semantic HTML, modern CSS, and vanilla JavaScript. UI frameworks, bundlers, and
runtime dependencies MUST NOT be introduced unless a documented justification proves the
static and `file://` constraints cannot otherwise be met. Every feature MUST be
verifiable by opening the page from disk and following documented steps. Prompt templates
MUST be data-driven so outputs can be tested with fixture inputs and golden expected
outputs. Prefer the smallest change that satisfies the specification (YAGNI).

## Additional Constraints

- **Runtime stack**: HTML5, CSS3, and ES2020+ JavaScript delivered as classic scripts or
  inline code. ES module imports and `fetch()` of local files are PROHIBITED in the
  runtime deliverable because they break under `file://`.
- **No backend**: no server code, accounts, authentication, or remote persistence.
- **Encoding**: UTF-8 everywhere. UI copy and generated prompts MUST support Traditional
  Chinese and English, and output formatting MUST NOT depend on the host locale.
- **Browser support**: latest two major versions of Chrome, Edge, Firefox, and Safari.
- **Assets**: local files only; system font stacks; no remote images or stylesheets.
- **Clipboard**: copy actions MUST provide a fallback path when the async Clipboard API
  is unavailable, so copying works under `file://`.

## Development Workflow and Quality Gates

1. **Specify first**: each feature spec MUST describe inputs, affected prompt contract
   sections, and the exact `file://` verification steps.
2. **Constitution check**: each implementation plan MUST include a static delivery gate
   confirming no server, build requirement, remote asset, module import, or local
   `fetch()` is introduced.
3. **Manual verification**: open the entry page from `file://` in at least two supported
   browsers and complete the core flow with networking disabled.
4. **Contract tests**: for every prompt template change, run fixture inputs through the
   generator and compare against golden outputs; update the contract documentation and
   version in the same change.
5. **Copy fidelity**: verify that the copy action reproduces the generated prompt exactly,
   including the fallback path.
6. **Review gate**: a change MUST NOT be merged if it adds a runtime dependency, a network
   call, or breaks `file://` operation.

## Governance

This constitution supersedes other development practices. When guidance conflicts, this
document wins.

**Amendments**: propose the change with its rationale, a Sync Impact Report, the version
bump, and migration notes. The project maintainer MUST approve the amendment before it
takes effect, and the approval date MUST be recorded in the version line.

**Versioning policy**: semantic versioning applies to governance. MAJOR for incompatible
changes, principle removals, or redefinitions; MINOR for new principles or sections, or
materially expanded guidance; PATCH for clarifications and non-semantic wording fixes.

**Compliance review**: every spec, plan, task list, and review MUST verify compliance with
these principles. Violations block completion. Exceptions require a documented,
time-bounded waiver approved by the project maintainer and recorded in the plan.

**Version**: 1.0.0 | **Ratified**: 2026-10-28 | **Last Amended**: 2026-10-28
