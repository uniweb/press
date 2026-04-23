# CLAUDE.md

Agent-specific guidance for working in this repository. For architectural positioning, user-facing concepts, and format-specific reference material, consult the docs listed under **Primary reading** below — CLAUDE.md does not duplicate them.

## Primary reading

Read the relevant doc for the task before touching code. Do not rely on memory; these docs are the source of truth and supersede any cached understanding from a previous session.

- **`docs/architecture/principles.md`** — the constitution. Durable commitments about what Press is and is not. Consult before any non-trivial design decision or change that touches the public surface. A change that violates a principle either needs a different approach or an explicit amendment.
- **`docs/architecture/overview.md`** — the map. How Press is actually put together: registration store, per-format fragment shapes, compile dispatch, adapter boundary. Consult when orienting to an unfamiliar area.
- **`docs/architecture/adding-a-format.md`** — worked examples and checklist for writing a new adapter. Replaces the old ad-hoc procedural notes that used to live here.
- **`docs/architecture/deployment.md`** — wire protocol, reference implementations, font story for formats that need a backend. Rarely needed unless working on server-mode code.
- **`docs/architecture/format-roadmap.md`** — what's shipped, what's next. Check before proposing format work to make sure the plan isn't already resolved.
- **`docs/concepts.md`** — user-facing mental model. Useful when writing guides or examples.
- **`README.md`** — public pitch, hello-world, pointers. Useful for checking how Press is currently presented externally.

Cross-reference for legacy vocabulary: `kb/framework/reference/documents-legacy-references.md` carries the ~30 `data-*` attributes inherited verbatim from `@uniwebcms/report-sdk`. Do not redesign the vocabulary without good reason — foundation porting from the legacy SDK depends on exact names.

## No build step

Like `@uniweb/kit`, this package ships **raw source files** — no bundler, no `dist/`. The `exports` field in `package.json` points directly at `./src/...`. Consumers (foundations) bundle via Vite themselves. Edits to `src/` are immediately effective in any linked workspace package; no build before tests or publish.

## Source layout

```
src/
├── index.js                     ← root barrel: DocumentProvider,
│                                    useDocumentOutput, useDocumentCompile,
│                                    triggerDownload
├── DocumentProvider.jsx
├── DocumentContext.js
├── useDocumentOutput.js
├── useDocumentCompile.js        ← hook; dynamic-imports ./adapters/*.js
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
├── typst/                       ← PUBLIC /typst — React builder components
│
├── sections/                    ← PUBLIC /sections — higher-level templates
│   ├── index.js
│   ├── Section.jsx
│   └── StandardSection.jsx
│
├── adapters/                    ← INTERNAL — not in package.json exports
│   ├── docx.js                  ← compileDocx, buildDocument, docx library
│   ├── typst.js
│   └── xlsx.js
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
├── typst/
├── sections/                    ← Section, StandardSection
├── ir/                          ← parser, attributes
└── integration/                 ← orchestrator, full-pipeline,
                                     enriched-components, preview-flow,
                                     section-helpers
```

The public subpath listing with what each entry point exports lives in `README.md` — do not duplicate it here.

**Import rule of thumb.** Foundation code imports from `@uniweb/press`, the builder subpaths (`/docx`, `/typst`), optionally `/sections`. Custom-adapter authors additionally import from `@uniweb/press/ir`. Nothing in user-facing code should import directly from `src/adapters/` — if you find that pattern, the lazy-loading story is broken.

## Conventions

### Block.output is gone

The legacy SDK mutated `block.output[format]` from inside React render. We do not. The modern `Block` class (`framework/core/src/block.js`) has no such property. Outputs live in a `WeakMap<Block, OutputBundle>` inside `<DocumentProvider>` context, populated via the `useDocumentOutput` hook. Registration is idempotent (safe under Strict Mode double-render) and garbage-collected on unmount.

### Compile is a separate primitive from download

`useDocumentCompile` returns a Blob; it does **not** trigger a download. `triggerDownload` is a separate DOM utility. The split exists so consumers can preview a compiled Blob (e.g., render it into an iframe via `docx-preview`) without saving a file. `examples/preview-iframe/src/App.jsx` demonstrates both flows.

### Section helpers are sugar, not required

Foundations can use `useDocumentOutput` + builders directly and skip `/sections` entirely. `Section` is a register-and-render convenience; `StandardSection` is an opinionated content-shape renderer with a `renderChildBlocks` escape hatch. `StandardSection` duck-types on the content shape (`content.title`, `content.paragraphs`, etc.) and does not import from `@uniweb/core`, so non-Uniweb projects that produce the same shape get it for free.

### No types

Plain JavaScript with JSDoc comments for documentation only — no `@type` annotations, no type checker. Matches the rest of the Uniweb workspace. Do not introduce project-wide TypeScript.

### parse5, not browser DOMParser

The IR parser uses `parse5` so it runs in Node and is unit-testable without jsdom. Faster and more standard than the legacy approach.

## Gotchas

### docx image emission — three invariants for a Word-clean .docx

Every `ImageRun` must satisfy all three of the following, or Word complains. The docx library does not enforce them for us, and each failure mode looks like a generic "corrupted docx" — they're easy to confuse. The header comment above `irToImageParagraph` in `src/adapters/docx.js` enumerates them; the regression guard is in `tests/docx/monograph-docx.test.jsx`.

| # | Invariant | Failure mode |
|---|---|---|
| 1 | `<wp:docPr id="N"/>` unique across all images in the document | Word opens with repair dialog; images survive |
| 2 | `<wp:docPr name="..."/>` attribute always emitted (even as `""`) | Word-for-Mac refuses the file outright (no repair offered); Windows tolerates |
| 3 | `type` passed to `ImageRun` so media writes as `<hash>.png` / `.jpg` / etc., not `<hash>.undefined` | Word opens with "found unreadable content"; repair adds an `application/octet-stream` default for the `.undefined` extension |

Invariant #2 is a footgun specific to `docx@9.x`: `DocProperties({ id })` emits `<wp:docPr id="1"/>` with no `name` attribute because the constructor's default `name: ''` only fires when the argument is fully undefined. Any partial altText object skips that default. Our adapter always spreads `{ name: '' }` into altText before caller fields — that line looks like a no-op; do not remove it.

Diagnosing future Word-repair complaints: unzip the generated file, have the user open-and-save it in Word, unzip the repaired copy, and `diff -r` the two trees. Whatever Word added (content-type defaults, missing attributes, renamed parts) is what our emitter got wrong.

## Dependencies

- `parse5` — HTML parser (testable in Node)
- `docx` — Word document generation (dynamically imported via `src/adapters/docx.js`, not in the main bundle)
- `exceljs` — spreadsheet generation (dynamically imported)
- `jszip` — source-bundle packaging for typst `sources` mode
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

## Runbooks

### Adding a builder component

1. Create `src/<format>/MyWidget.jsx` — pure JSX, `data-type="..."` attribute(s) for the IR walker to recognize, pass-through of extra `data-*` props via `...rest`.
2. Add the export to `src/<format>/index.js`.
3. If the component introduces new data-attribute keys, extend `src/ir/attributes.js`'s `attributeMap` so the IR layer picks them up.
4. Add component tests in `tests/<format>/components.test.jsx` (render to static HTML, parse to IR, assert the IR shape) and an end-to-end case in `tests/integration/enriched-components.test.jsx`.

### Adding a format adapter

See `docs/architecture/adding-a-format.md` for the checklist, worked examples (LaTeX, Paged.js), and the three canonical adapter shapes. The short version:

1. Create `src/adapters/<format>.js` exporting `compile<Format>(compiledInput, options) → Promise<Blob>`.
2. Add a loader to the `ADAPTERS` map in `src/useDocumentCompile.js`: `<format>: () => import('./adapters/<format>.js')`.
3. Do **not** add the adapter to `package.json`'s `exports` — it must remain internal so the library dependency stays dynamic-only.
4. If the format needs React primitives, put those at `src/<format>/` and add a `./<format>` subpath in the `exports` field, mirroring the docx layout.

### Adding a section helper

1. Create `src/sections/MyHelper.jsx` — a thin wrapper around `Section` or direct `useDocumentOutput` usage.
2. Add the export to `src/sections/index.js`.
3. Unit test in `tests/sections/` (registration, rendering, prop forwarding). If the helper has a non-trivial compile interaction, add an integration test in `tests/integration/section-helpers.test.jsx`.

## Publishing

Publishing is centralized at the workspace root via `pnpm framework:publish:*` (see root `CLAUDE.md`). The script auto-detects what needs publishing and cascades dependents. Do not run a per-package publish command from here. Press is live on npm (`@uniweb/press`); subsequent releases go through the same centralized pipeline.

The public surface is still pre-1.0, so breaking changes are acceptable when justified — but each release is a published artifact. Bump versions through the workspace publish script, and keep the `exports` field and documented subpaths coherent.