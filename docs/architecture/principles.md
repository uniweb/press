# Press principles

The architectural commitments this package is built on. They exist to keep format additions additive — adding EPUB, slides, PDF, or RTF should not require restructuring what is already there — and to keep the footprint sane regardless of how many formats Press grows to support.

Individual decisions (which IR to use, which libraries to depend on, which formats to prioritize next) are not here. Treat this file as the constitution; treat everything else in Press as ordinary implementation that can change freely as long as it respects the commitments below.

## Press's role

Press is the **output layer of the Uniweb ecosystem**. Given a site's already-parsed semantic content graph — Website → Page → Block, with structured `content.title`, `content.items`, `content.paragraphs`, `content.insets`, etc. — it produces downloadable files in whatever formats a foundation declares support for.

Where Pandoc is a universal converter between file formats, Press is a universal emitter from a pre-parsed content graph. It starts one layer higher: the Uniweb runtime has already done the semantic work upstream, so there's nothing to reparse. That asymmetry drives most of Press's design decisions — it's why adapters can be walkers rather than parsers, why the same JSX can serve as both preview and compile source, and why a growing list of output formats stays tractable.

One note on naming: in Uniweb, `Website` is the root of the content graph — it owns the pages, theme, and configuration. For Press, that root *is* the document being compiled. If `Website` suggests browser-specific assumptions, read it as `Document`; the compile pipeline treats it that way.

## The principles

### 1. Registration is the only mandatory contract

Every format plugs into the two public hooks — `useDocumentOutput` at render time (to register an output fragment for a block) and `useDocumentCompile` at compile time (to produce the Blob). Beyond that, each format chooses its own abstractions — IR, data shape, walker style, adapter internals.

**Why.** Formats are structurally different. docx is nested inline prose. xlsx is tabular with independent chart previews. Slides are per-slide layouts with speaker notes. Forcing a single AST across all of them produces a shape that serves none of them well.

**In practice.** The two hooks above and the provider that backs them are the fixed point. Anything beyond them — how a fragment is shaped, what an adapter consumes, which IR (if any) sits between them — is a format-local decision that individual adapter authors own.

### 2. Adapters are dynamic-imported

Heavy per-format libraries (`docx`, `exceljs`, future `typst.ts`, EPUB writers, PPTX writers) load only when `compile(format)` runs. They are never reachable from a static import graph.

**Why.** Foundations that only use Press's preview side should not pay megabytes for export paths they never trigger. A given user rarely needs more than one or two formats per session. Bundle size is easy to regress on and hard to recover from once users depend on it.

**In practice.** `src/adapters/*` is deliberately not listed in `package.json`'s `exports` field. Adapters are reached only through the dynamic `import()` inside `useDocumentCompile`. If a new adapter ends up in the main bundle — via a stray static import, a misplaced re-export, or an eager side effect — the boundary is broken and must be fixed before release.

### 3. Pick the right abstraction level per format, not a universal one

Today, docx and typst both consume the HTML-IR (they are both structured-document formats with rich inline prose, so the shape fits), while xlsx consumes plain data objects (because a spreadsheet is not prose). That is two abstraction levels, not one, and it is deliberate. Slides, EPUB, PDF, and other future targets should choose whatever fits — including forking an existing IR, introducing a new one, or skipping the IR layer and walking JSX directly.

**Why.** Premature IR unification bends the IR to serve multiple masters, produces a shape that serves none of them well, and makes each new format harder to add rather than easier. It is also close to irreversible once adapters start depending on it. The *right* kind of sharing (two genuinely HTML-shaped formats sharing one IR) is fine; the wrong kind (forcing xlsx or slides into the HTML-IR because "we already have one") is the trap this principle guards against.

**In practice.** Do not unify two formats until they demonstrably need the same shape — and even then, consider whether they need the same *input* shape or just the same *helpers*. New IRs, when they appear, live at `src/ir/<name>.js`, named for what they model (`html.js`, `book.js`, `slides.js`), not numbered.

### 4. IRs are tools, not gates

An IR earns its place by serving an adapter well. When a second format wants different semantics from an existing IR, it is acceptable to fork rather than bend the original.

**Why.** The current HTML-IR was shaped by docx's needs. Slides, book layout, or citation-heavy formats may have different semantic requirements and should not be shoehorned into a shape designed for something else.

**In practice.** Press can ship multiple IRs side by side. A future slide IR might model slide boundaries, layout slots, and speaker notes — none of which belong in the HTML-IR. Duplication between IRs is acceptable if the alternative is distortion.

### 5. Cross-cutting concerns get extracted on second use, not first

Asset fetching, image metadata extraction, footnote collection, cross-reference resolution — when two adapters solve the same problem differently, promote the shared logic. Until then, solving it once in one adapter is fine.

**Why.** Utilities designed before two consumers exist are designed for speculation rather than reality. The second consumer is what reveals the right shape of the abstraction.

**In practice.** Do not create `src/assets/` (or similar) until a second adapter actually needs asset fetching. The first adapter owns the logic; the second occasion makes the right API obvious.

### 6. Semantic input stays upstream

Press consumes Uniweb's already-parsed semantic content graph. Adapters walk that graph and emit. They do not parse.

**Why.** Parsing inside Press would duplicate what `@uniweb/semantic-parser` and `@uniweb/content-reader` already do, and would couple adapters to markdown syntax rather than semantic structure. It would also preclude non-Uniweb consumers whose pipelines already produce a compatible content shape — `StandardSection` exists precisely because the shape is the contract, not the pipeline that produced it.

**In practice.** If a format needs information the upstream parser does not produce, push the requirement upstream — do not quietly reparse markdown from `content.paragraphs` inside an adapter.

### 7. Preview/compile symmetry is a feature, not a rule

Where the same JSX can serve as browser preview and compile input, pursue it — docx and Typst both do, and it eliminates preview/output drift. Where the formats diverge naturally (xlsx's chart preview vs. its spreadsheet output), do not force symmetry.

**Why.** The "one source, two outputs" property is what makes Press feel coherent for document-shaped formats. It is not applicable to every format, and forcing it for the wrong format produces worse previews, worse outputs, or both.

**In practice.** A new format adapter does not have to offer same-JSX preview. It does have to document which preview strategy it supports (same-JSX, compiled-blob-preview, or no preview) so foundation authors know what to expect.

## Amending these principles

These are durable, not immutable. New formats will reveal gaps the current set does not cover.

- Propose a change as a diff to this file, in a PR whose description explains what motivated it.
- Prefer adding a principle to modifying one. Existing commitments have ripple effects throughout Press, and softening them without cause produces drift.
- When removing or materially changing a principle, explicitly identify the existing design decisions in Press that rest on the old version, so the amendment is made with full awareness of its consequences.

Individual format roadmaps, library choices, and implementation plans live under `docs/design/`. Principles live here.
