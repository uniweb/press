# Press format roadmap

**Purpose:** orientation, not commitment. What formats are plausible for Press, what each would cost, what's blocking or unblocking them. Format order follows user demand and concrete opportunity, not a predetermined plan — `principles.md` deliberately refuses universal abstractions until two formats demonstrably need the same shape, and the same reasoning applies to prioritization.

**Last updated:** 2026-04-23.

## Shipped today

| Format | Adapter | Input shape | Preview strategy | Deps (lazy) |
|---|---|---|---|---|
| docx | `src/adapters/docx.js` | HTML-IR | Same-JSX via `/docx` builders; compiled-blob via `docx-preview` iframe | `docx` (~3.4 MB) |
| xlsx | `src/adapters/xlsx.js` | Plain `{ title, headers, data }` | Foundation-defined (preview need not match the sheet; charts are a common choice) | `exceljs` |
| typst (sources) | `src/adapters/typst.js` | HTML-IR | Same-JSX via `/typst` builders; compile-to-PDF via local `typst` CLI | `jszip` (for source bundle) |

## Near-term

### PDF — Paged.js (browser-paginated, zero-backend)

**Status:** design doc at `./pagedjs-adapter.md`. Next up.

**Why this one first.** Strong near-term demand (existing book-shaped sites already produce PDFs via Typst; Paged.js is the "no-backend, no-install" peer Download button for those same sites). The proposal is implementation-ready with a tight Phase 1 scope. Architecturally it validates two principles in code: principle 3 by introducing a *third* abstraction level (rendered HTML passthrough, distinct from HTML-IR and plain-data), and principle 4 by being an adapter that **skips** the IR layer entirely — the rendered HTML *is* the compile output. Principle 7 gets the purest case: preview and compile are literally the same bytes loaded in a browser tab.

**Backend:** none needed for Phase 1 (`html` mode). Phase 3 adds an optional server mode mirroring the Typst server pattern, for zero-interaction PDF delivery.

## Medium-term

### EPUB (reflowable, EPUB3)

**Status:** design doc at `./epub-adapter.md`. Scheduled after Paged.js.

**Why worth doing.** Pure-frontend feasible (no backend, no WASM), small adapter (jszip is already a dep), and it exercises two commitments from `principles.md` that matter forward-looking: it adds a second consumer of the HTML-IR beyond docx (so principle 4's "fork if it bends" stance gets a real test), and it is the second adapter that needs asset fetching, which triggers the principle-5 extraction into a shared `src/assets/` helper. Complementary to Paged.js, not competing — Paged.js serves "I want a PDF of this book"; EPUB serves "I want to read this on an ebook reader."

**Backend:** none needed.

### PDF — frontend via `typst.ts` WASM

Bundle: a multi-megabyte WASM (reported in the low tens of MB range, lazy-loaded). Reuses the typst adapter's IR-walker output unchanged — same JSX, same source emission, then WASM compiles to PDF in the browser. Hardest part is **fonts**: typst needs font files available to the compiler, and shipping fonts in a WASM build is awkward. Either: (a) ship a small curated set embedded, (b) let the foundation provide fonts via URL, (c) use web-safe fonts only. Acceptable for "download a PDF of this page" but not for professional typesetting. Overlaps with Paged.js and Typst server mode; pursue only if those two leave a gap worth filling.

### PDF — backend via Typst CLI

Move the typst source bundle to a serverless endpoint (Cloudflare Worker, R2 for assets), run `typst compile`, return the PDF. Unlocks full font freedom and better performance at the cost of requiring a running backend. Blocks on: a real backend existing (we have a sample, not production), and the image-sourcing question — if images live in R2 and the backend has direct access, compile is fast; if images require HTTP round-trips through the browser, the serverless path loses some of its appeal. Worth pursuing seriously when the first production deployment needs professional PDFs.

### Slides — HTML (Reveal.js) and/or PPTX

Own JSX vocabulary — slides have structure that doesn't map cleanly to HTML-IR or to xlsx's data objects: per-slide layouts, layout slots (title/body/notes), speaker notes, transitions, build steps. Almost certainly wants a new `src/ir/slides.js` and its own `/slides` builder subpath. Two target formats:

- **Reveal.js HTML** — browser-native, pure-frontend, easy preview (render in iframe). Good for "present from a URL" use cases.
- **PPTX** — corporate-compat, requires a library (`pptxgenjs` or similar). Heavier dep.

High user appeal. Low technical blocker.

### Markdown / HTML export

Essentially free. Walk the HTML-IR, emit Markdown (or stringify XHTML). No deps, tiny adapter. Useful as (a) a debugging/inspection format, (b) feedstock for external Pandoc pipelines, (c) a "show me the source" button for authors. Lands whenever someone wants it.

## Longer-term / speculative

- **RTF** — direct walker from HTML-IR, no deps. Broad compat for older Word workflows. Low complexity, narrow audience.
- **Pandoc backend integration** — if a serverless backend exists for Typst→PDF, Pandoc gets added for free coverage of dozens of formats (LaTeX, org-mode, AsciiDoc, etc.). Not for the primary formats Press supports directly, but a good "anything else" escape hatch.
- **Fixed-layout EPUB / comic formats** — niche; skip unless explicitly requested.
- **ODT (OpenDocument)** — LibreOffice/OpenOffice compat. Low demand; low priority.

## Cross-cutting concerns (not a format, but will affect several)

### Backend strategy

Only Typst→PDF (backend variant) genuinely requires a backend. EPUB, slides (HTML), markdown, and PDF-via-WASM are all pure-frontend. Defer the serverless/Cloudflare design until a concrete format demands it, then write a dedicated design doc for it — do not design a generic backend ahead of need.

Key unresolved questions when the time comes: who owns the endpoint (Press vs. platform)? How are images resolved (pre-fetched vs. backend-side)? Is there a caching layer (compiled PDFs keyed by content hash)? These are worth answering once, not iteratively.

### Asset fetching

docx does asset fetching inline today. EPUB will be the second adapter needing it. Per principle 5, that's the trigger for extracting `src/assets/fetch.js` with a clean API (URL list in, `{ url → { bytes, mime } }` out). Slides, PDF, and anything else that embeds media inherits from that.

### Theme / styles

Each format expresses style differently (docx paragraph styles, typst show rules, EPUB CSS, slides per-layout). We do not need a universal theme model today — `@uniweb/theming` produces CSS tokens; EPUB can consume those directly; docx and typst already have their own story. Revisit if three formats end up reinventing the same mapping.

## What this doc is not

- Not a schedule. Formats ship when someone needs them and the design is clear.
- Not a commitment. Any entry can be removed, reprioritized, or superseded.
- Not a blocker. Starting work on a format not listed here is fine; add the entry as the work begins.

Per-format implementation plans live in sibling files (`epub-adapter.md`, eventually `slides-adapter.md`, etc.), and should be deleted once the corresponding adapter is merged and stable.
