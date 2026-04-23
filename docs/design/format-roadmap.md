# Press format roadmap

**Purpose:** orientation, not commitment. What formats are plausible for Press, what each would cost, what's blocking or unblocking them. Format order follows user demand and concrete opportunity, not a predetermined plan — `principles.md` deliberately refuses universal abstractions until two formats demonstrably need the same shape, and the same reasoning applies to prioritization.

**Last updated:** 2026-04-23.

## Shipped today

| Format | Adapter | Input shape | Preview strategy | Deps (lazy) |
|---|---|---|---|---|
| docx | `src/adapters/docx.js` | HTML-IR | Same-JSX via `/docx` builders; compiled-blob via `docx-preview` iframe | `docx` (~3.4 MB) |
| xlsx | `src/adapters/xlsx.js` | Plain `{ title, headers, data }` | Foundation-defined (preview need not match the sheet; charts are a common choice) | `exceljs` |
| typst (sources + server) | `src/adapters/typst.js` | HTML-IR | Same-JSX via `/typst` builders; compile-to-PDF via local `typst` CLI or server endpoint | `jszip` (for source bundle) |
| pagedjs (`html` mode) | `src/adapters/pagedjs.js` | Rendered-HTML passthrough via `consumes: 'html'` | Same-bytes: the HTML Blob opens in a new tab, Paged.js paginates in-browser, user prints to PDF | Paged.js polyfill (CDN, ~100 KB, pinned to 0.4.3) |

**Architectural note — adapter descriptors.** Shipped alongside Paged.js: adapter dispatch is now table-driven on `{ load, consumes, ir }` descriptors in `src/adapters/dispatch.js`. The `consumes` field lets multiple output formats share an input-shape key — Paged.js declares `consumes: 'html'`, and any future HTML-string adapter (EPUB, a plain-HTML export) can declare the same and read the foundation's existing `'html'` registrations with no foundation changes. The pipeline dispatches on `(consumes, ir)` rather than per-format `if`-branches. Principle 6 was amended to cover "generalization already earned" — see `../architecture/principles.md`.

## Near-term

### PDF — Paged.js (remaining phases)

**Status:** Phase 1 (`html` mode) **shipped**. Two follow-ups outstanding:

- **Server mode + Vite dev plugin** (`src/vite-plugin-pagedjs.js`, analogous to `vite-plugin-typst.js`). Headless Chromium + Paged.js + `page.pdf()` behind a `/__press/pagedjs/compile` endpoint. Wire protocol is already defined and the adapter's `server` mode is implemented and unit-tested with mocked fetch. What's missing: the dev plugin and production server-side reference. Ships when a site actually wants one-click PDF without the user invoking Print → Save as PDF.
- **Deletion of `./pagedjs-adapter.md`.** The doc's own footer says to delete it once Phases 1–3 are shipped or explicitly punted. Phase 2 is CSS polish (already absorbed into the live default stylesheet), Phase 4 is "DRY the Download button" (deferred pending a third HTML-shape adapter). The doc can be deleted once server mode ships, at which point code + tests are the authoritative spec.

### Running content customization (Paged.js) — deferred

**Status:** design doc at `./pagedjs-running-content.md`. **Not scheduled.**

A proposal for a `book.running` convention in `site.yml` that would let authors customize Paged.js margin-box content (running headers, footers, page-number formatting) without writing CSS. Today's default stylesheet already handles the common book case well; customization is done by passing extra CSS through `adapterOptions.stylesheet`.

**Triggers for implementation:**
- An author asks how to put the book title in the top-left margin on verso pages without writing CSS.
- Two or more sites end up with near-identical CSS overrides for the same margin-box patterns (duplication signal → time to hoist into a convention).
- A foundation wants to offer "per-book running-content customization" as a user-facing feature.
- The author-facing guide (`../guides/book-publishing.md`) would benefit from a declarative YAML story instead of "write these CSS rules."

**What it is not.** Not a prerequisite for anything else on this roadmap. Authors needing customization today use the stylesheet-concat escape hatch documented in `./pagedjs-running-content.md`.

## Medium-term

### EPUB (reflowable, EPUB3)

**Status:** design doc at `./epub-adapter.md`. Scheduled after Paged.js.

**Why worth doing.** Pure-frontend feasible (no backend, no WASM), small adapter (jszip is already a dep), complementary to Paged.js, not competing — Paged.js serves "I want a PDF of this book"; EPUB serves "I want to read this on an ebook reader."

**What got cheaper after the Paged.js work.** With the adapter-descriptor + `consumes` alias shipped, EPUB can declare `{ load, consumes: 'html', ir: false }` and read the exact same `'html'` registrations that Paged.js already consumes. Foundations that already wire Paged.js get EPUB with zero foundation changes — the download button just picks a different format string. The proposed sharing is real and already tested in code via the Paged.js integration.

**What EPUB still forces.** It's the second adapter that needs **asset fetching** (images embedded in the `.epub` archive rather than referenced by URL). Per principle 6's "promote shared logic on second use," this is the trigger for extracting `src/assets/fetch.js` from its current home inside `src/adapters/docx.js`. That extraction is the main architectural lift of the EPUB work.

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

docx does asset fetching inline today. Typst and Paged.js don't need it — Typst references images by URL (compiler resolves at compile time), Paged.js runs in a browser where the browser resolves URLs. EPUB will be the second adapter that genuinely needs embedded asset bytes. Per principle 6 ("Extract shared logic when a second adapter needs it"), that's the trigger for extracting `src/assets/fetch.js` with a clean API (URL list in, `{ url → { bytes, mime } }` out). Slides with embedded media, PDF via WASM (if fonts + images need bundling), and PPTX inherit from that.

### Theme / styles

Each format expresses style differently (docx paragraph styles, typst show rules, EPUB CSS, slides per-layout). We do not need a universal theme model today — `@uniweb/theming` produces CSS tokens; EPUB can consume those directly; docx and typst already have their own story. Revisit if three formats end up reinventing the same mapping.

## What this doc is not

- Not a schedule. Formats ship when someone needs them and the design is clear.
- Not a commitment. Any entry can be removed, reprioritized, or superseded.
- Not a blocker. Starting work on a format not listed here is fine; add the entry as the work begins.

Per-format implementation plans live in sibling files (`epub-adapter.md`, eventually `slides-adapter.md`, etc.), and should be deleted once the corresponding adapter is merged and stable.
