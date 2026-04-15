# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@uniweb/press` is a frontend document generation library for Uniweb foundations. Section components emit ordinary JSX using builder components (`<Paragraph>`, `<H1>`, `<TextRun>`, etc.); the same JSX renders as the browser preview AND is walked to produce a downloadable file — entirely in the browser, no backend, no intermediate upload. docx is the initial target; xlsx and PDF are on the roadmap.

## Status

Phase 1.6 restructure landed. 133 tests passing across 15 files. The registration architecture, builder components, IR layer, section templates, and docx adapter are stable. The public surface is expected to hold through 1.0. xlsx and PDF adapters are not yet implemented — adding one is a new file under `src/adapters/` plus an entry in the `ADAPTERS` map inside `src/useDocumentCompile.js`.

**Press is unpublished.** No external consumers yet, so there is no migration burden and no deprecation shims — changes that affect the public surface just change it.

Design and decisions are in `docs/design/restructure-2026-04.md` (in this directory). **Read it before making non-trivial changes** — the restructure is opinionated about which things belong at the root, which at `/docx`, which at `/sections`, which at `/ir`, and which stay internal. The revision history next to it (`restructure-2026-04-revision-history.md`) has the eight rounds of review that produced those decisions.

The data-attribute vocabulary is inherited verbatim from the legacy `@uniwebcms/report-sdk` — ~30 attributes covering layout, borders, headings, numbering, positional tabs, image transforms, hyperlinks, and floating positioning. The legacy pointers live in `kb/framework/reference/documents-legacy-references.md`. Do not redesign the vocabulary without good reason — foundation porting from the legacy SDK depends on exact names.

## No Build Step

Like `@uniweb/kit`, this package ships **raw source files** — no bundler, no `dist/`. The `exports` field in `package.json` points directly at `./src/...`. Consumers (foundations) bundle via Vite themselves. Edits to `src/` are immediately effective in any linked workspace package; no build before tests or publish.

## Public Subpaths

```
@uniweb/press                FORMAT-AGNOSTIC CORE
  ├─ DocumentProvider          context holding WeakMap<Block, Output>
  ├─ useDocumentOutput         registration hook (called by section components)
  ├─ useDocumentCompile        returns { compile, isCompiling }; compile(fmt) → Promise<Blob>
  └─ triggerDownload           utility: Blob → browser file download

@uniweb/press/docx           DOCX REACT PRIMITIVES (atoms)
  ├─ Paragraph, Paragraphs
  ├─ TextRun
  ├─ H1, H2, H3, H4
  ├─ Image, Images
  ├─ Link, Links
  └─ List, Lists

@uniweb/press/sections       SECTION TEMPLATES (molecules)
  ├─ Section                   generic register-and-render wrapper
  └─ StandardSection           opinionated Uniweb content-shape renderer

@uniweb/press/ir             CUSTOM ADAPTER AUTHORING
  ├─ htmlToIR
  ├─ attributesToProperties
  ├─ attributeMap
  └─ compileOutputs
```

The **docx format adapter** (`compileDocx`, `buildDocument`, and the ~3.4 MB `docx` library) lives at `src/adapters/docx.js` — **not** in `package.json`'s `exports` field. It is reached only via the dynamic import inside `useDocumentCompile`, which keeps the large library out of the main bundle. A foundation that imports from `@uniweb/press/docx` for its React builders does not pull the library until `compile('docx')` actually runs.

**Import rule of thumb:** foundation code imports from `@uniweb/press`, `@uniweb/press/docx`, and (optionally) `@uniweb/press/sections`. Custom-adapter authors additionally import from `@uniweb/press/ir`. Nothing in user-facing code should import directly from `src/adapters/` — if you find that pattern, the lazy-loading story is broken.

## Source Layout

```
src/
├── index.js                     ← root barrel: DocumentProvider,
│                                    useDocumentOutput, useDocumentCompile,
│                                    triggerDownload
├── DocumentProvider.jsx
├── DocumentContext.js
├── useDocumentOutput.js
├── useDocumentCompile.js        ← hook; dynamic-imports ./adapters/docx.js
├── triggerDownload.js           ← DOM utility
│
├── docx/                        ← PUBLIC /docx — React builder components
│   ├── index.js                 ← barrel (builders only, no Section)
│   ├── Paragraph.jsx
│   ├── TextRun.jsx
│   ├── Headings.jsx             ← H1–H4
│   ├── Image.jsx
│   ├── Link.jsx
│   ├── List.jsx
│   └── parseStyledString.js     ← INTERNAL helper (not in barrel)
│
├── sections/                    ← PUBLIC /sections — higher-level templates
│   ├── index.js
│   ├── Section.jsx
│   └── StandardSection.jsx
│
├── adapters/                    ← INTERNAL — not in package.json exports
│   └── docx.js                  ← compileDocx, buildDocument, docx library
│
└── ir/                          ← PUBLIC /ir — IR layer for custom adapters
    ├── index.js
    ├── parser.js                ← parse5-based HTML → IR walker
    ├── attributes.js            ← declarative data-* attribute mapping
    └── compile.js               ← compileOutputs(store, format)
```

```
tests/
├── core/                        ← provider, useDocumentOutput,
│                                    useDocumentCompile, triggerDownload
├── docx/                        ← builders, adapter, parseStyledString
├── sections/                    ← Section, StandardSection
├── ir/                          ← parser, attributes
└── integration/                 ← orchestrator, full-pipeline,
                                     enriched-components, preview-flow,
                                     section-helpers
```

```
examples/
└── preview-iframe/              ← runnable Vite demo of compile + preview
                                    + download, declared as a workspace
                                    package (workspace:* on @uniweb/press)
```

## Architecture

Three output patterns coexist by design:

1. **docx:** JSX with semantic `data-type='table'`, `data-margins-*`, etc. Same JSX is the React preview AND the source for `compileDocx`. Zero divergence between preview and file.
2. **xlsx (planned):** Plain `{ title, headers, data }` objects. Preview (often charts) is independent.
3. **pdf (planned):** Either reuse docx JSX via Paged.js, or `@react-pdf/renderer` for fine control.

What unifies them is the **registration interface** (`useDocumentOutput`), NOT the data shape. Don't try to force a single IR across all formats.

The compile pipeline lives in `src/ir/compile.js`. `useDocumentCompile` pulls the store out of context, calls `compileOutputs(store, format)` to produce the adapter input, then dynamic-imports the adapter and hands it that input. This is the only place in Press that reaches into `src/adapters/`.

## Conventions

### Block.output is gone

The legacy SDK mutated `block.output[format]` from inside React render. We do not. The modern `Block` class (`framework/core/src/block.js`) has no such property. Outputs live in a `WeakMap<Block, OutputBundle>` inside `<DocumentProvider>` context, populated via the `useDocumentOutput` hook. Registration is idempotent (safe under Strict Mode double-render) and garbage-collected on unmount.

### Compile is a separate primitive from download

`useDocumentCompile` returns a Blob; it does NOT trigger a download. `triggerDownload` is a separate DOM utility. The split exists so consumers can preview a compiled Blob (e.g., render it into an iframe via `docx-preview`) without saving a file. `examples/preview-iframe/src/App.jsx` demonstrates both flows.

### Section helpers are sugar, not required

Foundations can use `useDocumentOutput` + `/docx` builders directly and skip `/sections` entirely. `Section` is a register-and-render convenience; `StandardSection` is an opinionated content-shape renderer with a `renderChildBlocks` escape hatch. `StandardSection` duck-types on the content shape (`content.title`, `content.paragraphs`, etc.) and does not import from `@uniweb/core`, so non-Uniweb projects that produce the same shape get it for free.

### No types

Plain JavaScript with JSDoc comments for documentation only — no `@type` annotations, no type checker. Matches the rest of the Uniweb workspace. Don't introduce project-wide TypeScript.

### parse5, not browser DOMParser

The IR parser uses `parse5` so it runs in Node and is unit-testable without jsdom. Faster and more standard than the legacy approach.

## Dependencies

- `parse5` — HTML parser (testable in Node)
- `docx` — Word document generation (dynamically imported via `src/adapters/docx.js`, not in the main bundle)
- React 18/19 as peer dependency

## Testing

```bash
pnpm test                                    # vitest run — full suite
pnpm test:watch                              # vitest watch
pnpm test tests/docx/                        # one directory
pnpm test tests/docx/index.test.js           # one file
pnpm test -t 'inline marks'                  # by test name
```

Tests use `@testing-library/react` with the `jsdom` Vitest environment. The compile-to-Blob tests read the PK magic bytes via `FileReader.readAsArrayBuffer` because jsdom's `Blob` doesn't implement `arrayBuffer()` and wrapping in `Response` gives a UTF-8 decoded view that mangles binary bytes.

### Adding a builder component

1. Create `src/docx/MyWidget.jsx` — pure JSX, `data-type="..."` attribute(s) for the IR walker to recognize, pass-through of extra `data-*` props via `...rest`.
2. Add the export to `src/docx/index.js`.
3. If the component introduces new data-attribute keys, extend `src/ir/attributes.js`'s `attributeMap` so the IR layer picks them up.
4. Add component tests in `tests/docx/components.test.jsx` (render to static HTML, parse to IR, assert the IR shape) and an end-to-end case in `tests/integration/enriched-components.test.jsx`.

### Adding a format adapter

1. Create `src/adapters/my-format.js` exporting `compileMyFormat(compiledInput, options) → Promise<Blob>`.
2. Add a loader to the `ADAPTERS` map in `src/useDocumentCompile.js`: `myFormat: () => import('./adapters/my-format.js')`.
3. Add compile-pipeline handling in `src/ir/compile.js` if the format needs a different input shape than `compileHtmlBased()` produces (the xlsx branch is the reference).
4. Do **not** add the adapter to `package.json`'s `exports` — it must remain internal so the library dependency stays dynamic-only. If the format needs React primitives, put those at `src/<format>/` and add a `./<format>` subpath in the `exports` field, mirroring the docx layout.

### Adding a section helper

1. Create `src/sections/MyHelper.jsx` — a thin wrapper around `Section` or direct `useDocumentOutput` usage.
2. Add the export to `src/sections/index.js`.
3. Unit test in `tests/sections/` (registration, rendering, prop forwarding). If the helper has a non-trivial compile interaction, add an integration test in `tests/integration/section-helpers.test.jsx`.

## Publishing

Publishing is centralized at the workspace root via `pnpm framework:publish:*` (see root `CLAUDE.md`). The script auto-detects what needs publishing and cascades dependents. Do not run a per-package publish command from here. Press is currently unpublished; the first publish will happen when the public docs (R4c) and remaining restructure phases settle.

## Cross-references

- `docs/design/restructure-2026-04.md` — the phase-1.6 restructure plan (authoritative)
- `docs/design/restructure-2026-04-revision-history.md` — eight-round review trail
- `docs/design/historical/original-press-package-design.md` — pre-restructure design
- `kb/framework/reference/documents-legacy-references.md` — legacy `@uniwebcms/report-sdk` pointers (source of the data-attribute vocabulary)
- `framework/kit/CLAUDE.md` — convention reference (this package mirrors kit's no-build-step pattern)
- `examples/preview-iframe/` — runnable demo of the compile + preview + download flow
- `tests/integration/preview-flow.test.jsx` — automated anchor for the demo's structural contract
