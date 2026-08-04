# CLAUDE.md

Agent-specific guidance for working in this repository. For architectural positioning, user-facing concepts, and format-specific reference material, consult the docs listed under **Primary reading** below — CLAUDE.md does not duplicate them.

## Primary reading

Read the relevant doc for the task before touching code. Do not rely on memory; these docs are the source of truth and supersede any cached understanding from a previous session.

- **`docs/architecture/principles.md`** — the constitution. Durable commitments about what Press is and is not. Consult before any non-trivial design decision or change that touches the public surface. A change that violates a principle either needs a different approach or an explicit amendment.
- **`docs/architecture/overview.md`** — the map. How Press is actually put together: registration store, per-format fragment shapes, compile dispatch, adapter boundary. Consult when orienting to an unfamiliar area.
- **`docs/architecture/adding-a-format.md`** — worked examples and checklist for writing a new adapter. Replaces the old ad-hoc procedural notes that used to live here.
- **`docs/architecture/deployment.md`** — wire protocol, reference implementations, font story for formats that need a backend. Rarely needed unless working on server-mode code.
- **`docs/architecture/format-roadmap.md`** — what's shipped, what's next. Check before proposing format work to make sure the plan isn't already resolved.
- **`docs/architecture/word-styles-decision.md`** — why typography routes through OOXML named styles instead of inline formatting. Consult before changing anything in the Stage 6 typography surface.
- **`docs/concepts.md`** — user-facing mental model. Useful when writing guides or examples.
- **`docs/guides/docx-foundation-cookbook.md`** — task-oriented walkthrough for foundation authors. The single best document to point a colleague at when they're building a docx-producing foundation. If you're answering a foundation-author question, the answer is probably already in here — quote and link rather than re-deriving.
- **`docs/api/docx.md`, `format.md`, `typography-roles.md`** — per-subpath API references.
- **`docs/ai-prompt.md`** — self-contained prompt for asking an LLM for Press JSX. Useful when pair-programming with Claude / Cursor.
- **`README.md`** — public pitch, hello-world, pointers. Useful for checking how Press is currently presented externally.

The ~30 `data-*` attributes are inherited verbatim from `@uniwebcms/report-sdk`. Do not redesign the vocabulary without good reason — foundation porting from the legacy SDK depends on exact names.

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
│   ├── LinkPart.jsx             ← INTERNAL — renders a parsed `link` part
│   │                              (NOT Link.jsx: different contract)
│   └── parseStyledString.js     ← INTERNAL helper (not in barrel)
│
├── typst/                       ← PUBLIC /typst — React builder components
│   └── LinkPart.jsx             ← INTERNAL — this lane's copy (see below)
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

### `LinkPart` is duplicated per lane, deliberately

`src/docx/LinkPart.jsx` and `src/typst/LinkPart.jsx` render a parsed `link` part from `parseStyledString`. They look like an obvious candidate for one shared component and are not: the two emit different `data-type` values (`externalHyperlink` vs `link`), pass the href on different attributes (`data-link` vs `data-href`), import different `TextRun`s, and forward different marks (docx takes sub/superscript plus a `Hyperlink` character style; typst takes `code`). Parameterising over that needs five knobs for a component that is twenty lines — the abstraction would be larger than both copies.

What they replaced was worse than duplication between *lanes*: the same block was inlined in **four** builders (`Paragraph` and `Headings` in each lane), so a change had to be made four times. Two copies split along a real boundary is the floor here, not a smell to clean up.

**Neither is in its barrel** — they're internal, like `parseStyledString`. Don't confuse `LinkPart` with the public `Link` builder: `Link` takes `{ label, href }`, detects internal-vs-external, and adds `target`/`rel`; `LinkPart` takes a parsed part with styled runs and always emits an external hyperlink.

### No types

Plain JavaScript with JSDoc comments for documentation only — no `@type` annotations, no type checker. Matches the rest of the Uniweb workspace. Do not introduce project-wide TypeScript.

### parse5, not browser DOMParser

The IR parser uses `parse5` so it runs in Node and is unit-testable without jsdom. Faster and more standard than the legacy approach.

## Gotchas

### A green suite is not evidence the document is right — compile it and read the XML

This package's output is a **document**, and a wrong document looks exactly like a right one from the terminal. Nothing here throws: the build passes, the suite passes, Word opens the file without a repair prompt, and the content is wrong. That is the default failure mode in this repo, not an unusual one.

Three defects found in a single session (2026-08-04), all in code that had passing tests:

| Defect | What the terminal said | What Word showed |
|---|---|---|
| `<a href="…"><strong>x</strong></a>` | green | the literal text `<strong>x</strong>` — the tags as content |
| `<Link data={{href: '#section-3'}} />` | green | a link that navigates nowhere (`w:anchor="#section-3"` never matches `w:name="section-3"`) |
| builder→`TextRun` prop forwarding | green | correct output; deleting the forwarding stayed green, so nothing guarded it |

The first two were found by compiling a fixture and reading `document.xml`. The third was found by asking what the existing tests actually covered, then deleting the code to see whether anything failed. **Neither is reasoning from the builder source, and reasoning from the builder source would have found none of them.**

Practical consequences:

- **When the claim is about what the document contains, assert on compiled output**, not on the parsed parts or the IR. Both intermediate layers were correct in the anchor case; the defect was one hop later. `compileInvoice` from `tests/integration/invoice-fixtures/_harness.jsx` returns `documentXml` — assert against that, and scope the regex to the element you mean (`<w:hyperlink …>…</w:hyperlink>`) so it can't pass on markup elsewhere in the file.
- **Canary every new guard.** Revert the fix (`git stash push -- src/`), run the new tests, and confirm they fail. A test written after a fix passes trivially; only the failing run proves it bites. Two of the sessions's test additions were verified this way, and in both the count of failing-vs-passing was itself informative — the tests that still passed were the intended non-regression guards.
- **Vitest intercepts `console.log`**, so printing a value from a test shows nothing. To inspect a compiled artifact, assert it equals a sentinel (`expect(xml).toBe('SHOW')`) and read the diff, or write to a file with `node:fs`.
- **For a pure refactor, diff the rendered markup** rather than trusting the suite. `renderToStaticMarkup` over a matrix of inputs, captured before and after, is a stronger claim than "534 tests still pass" — the suite only covers the paths it covers.

This is the same lesson as the Word-repair recipe below, one stage earlier: that one diagnoses a file Word *rejects*, this one a file Word *accepts* and renders wrongly.

### Empty compile output usually means "no registrations for the adapter's input key," not "adapter is broken"

Adapters declare a `consumes` key in the `ADAPTERS` descriptor (`src/adapters/dispatch.js`) — the store key whose fragments they read. The descriptor's output-format name and its `consumes` can differ:

- `typst` consumes `'typst'` (self-aliased — most common case)
- `docx`  consumes `'docx'` (same)
- `xlsx`  consumes `'xlsx'` (same)
- `pagedjs` consumes **`'html'`** — foundations register under `'html'`, not `'pagedjs'`. A future EPUB adapter will also consume `'html'`, so the foundation writes one registration and both adapters read it.

When an adapter produces a valid-looking shell — doctype, metadata, stylesheet, all the right tags — with an empty body, the cause is almost always that foundation sections never called `useDocumentOutput(block, <consumes-key>, …)`. Check the descriptor's `consumes` value, not the output format name.

Press emits a one-time `console.warn` per input-shape key from both `useDocumentCompile` and `compileSubtree`. The message names both the format and the key when they differ (`"compile('pagedjs') found 0 sections registered under input key 'html'."`) — follow that key to the foundation. See `tests/core/empty-registrations-warning.test.jsx` for the contract.

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
- React 19 as peer dependency

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

> **`attributeMap` canary.** `tests/ir/attributes.test.js` asserts `Object.keys(attributeMap)` has an *exact* count, with a ledger comment of where each entry came from. Adding any `data-*` entry to `src/ir/attributes.js` requires bumping that count and extending the ledger **in the same change** — it's deliberate, forcing a conscious review whenever the inherited attribute vocabulary changes. A PR that adds attributes without it fails CI on the count mismatch (expected — update the count + ledger, don't treat the PR as wrong). So before merging any PR that touches `attributes.js`, check out the branch and run `pnpm test` rather than trusting a green run against `main`.

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