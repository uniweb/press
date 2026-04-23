# @uniweb/press

**Downloadable files from Uniweb content.** A Uniweb site is, in a useful sense, a URL that represents a document — titles, paragraphs, tables, lists, tagged data blocks, all already parsed and available to section components. Press lets those same section components turn that content into downloadable files: Word documents, spreadsheets, typeset PDFs, and whatever else a foundation wants to support. One source, many outputs.

```bash
npm install @uniweb/press
```

## What Press is

Press is the **output layer of the Uniweb ecosystem**. It's a small registration layer (what section components call into to opt in to a format) plus a set of format adapters (the things that know how to produce `.docx`, `.typ`, `.xlsx` files). The registration layer is format-agnostic; the adapters are format-specific and dynamic-loaded, so a foundation only pays for the formats it actually offers.

The core insight that makes Press tractable is that Uniweb has already done the semantic work. Press doesn't parse markdown, resolve Loom expressions, or fetch data — by the time a section component renders, `content.paragraphs`, `content.title`, and everything else are already concrete values. Press just walks what's there and emits.

Three properties follow from that design:

- **Same source, many outputs.** The JSX a section renders for the browser can be the *same* JSX Press compiles into a Word doc or a PDF. No duplication, no drift between preview and file.
- **Frontend-first.** Most formats compile entirely in the browser. When a format needs a backend (Typst PDFs, future LaTeX), it's an escape hatch — not the architecture.
- **Additive formats.** Adding a new format is a new adapter module plus an entry in a map. Nothing else in Press needs to change.

## Hello world

A section component that renders as a preview *and* registers itself for docx compilation, using the same JSX for both:

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { H1, H2, Paragraphs } from '@uniweb/press/docx'

function Cover({ content, block }) {
    const body = (
        <>
            <H1 data={content.title} />
            <H2 data={content.subtitle} />
            <Paragraphs data={content.paragraphs} />
        </>
    )

    useDocumentOutput(block, 'docx', body)

    return <div className='max-w-4xl mx-auto'>{body}</div>
}
```

A few things worth noticing:

- The `body` variable is used twice — registered for docx compilation and rendered into the visible layout. No duplication to drift between them.
- `useDocumentOutput` is a no-op outside a `DocumentProvider`, so sections that don't opt into docx simply don't contribute. Mixing opt-in and non-opt-in sections on the same page is fine.
- The `/docx` builders (`H1`, `H2`, `Paragraphs`, etc.) emit ordinary HTML with `data-*` attributes. The same tree serves as the browser preview and as the source the compile pipeline walks.

Somewhere higher in the tree — a layout, a header, a dedicated download section — wrap everything in a `DocumentProvider` and wire up a button:

```jsx
import {
    DocumentProvider,
    useDocumentCompile,
    triggerDownload,
} from '@uniweb/press'

function ReportLayout({ children }) {
    return (
        <DocumentProvider>
            {children}
            <DownloadButton />
        </DocumentProvider>
    )
}

function DownloadButton() {
    const { compile, isCompiling } = useDocumentCompile()

    const handleDownload = async () => {
        const blob = await compile('docx', { title: 'Annual Report' })
        triggerDownload(blob, 'annual-report.docx')
    }

    return (
        <button onClick={handleDownload} disabled={isCompiling}>
            {isCompiling ? 'Generating…' : 'Download'}
        </button>
    )
}
```

Every section between the provider and the button that called `useDocumentOutput('docx', ...)` contributes to the compiled document. The docx library itself is loaded dynamically on the first `compile('docx')` call — it's never in the main bundle.

For a fuller walkthrough, see the [quick start](./docs/quick-start.md).

## What's shipped

Press ships three format adapters today:

- **docx** — Word documents via the [`docx`](https://docx.js.org) library. Paragraphs, headings, text runs, tables, lists, images, hyperlinks, headers/footers, page numbering. The flagship format.
- **typst** — Typeset PDFs via the [Typst](https://typst.app) compiler. Same-source preview from `/typst` builders; whole-book compile via `compileSubtree`; `sources` mode (pure frontend, user compiles locally) and `server` mode (via a companion endpoint — see [deployment.md](./docs/architecture/deployment.md)).
- **xlsx** — Spreadsheets via `exceljs`. Plain `{ title, headers, data }` objects, multi-sheet, preview and compiled output independent (because spreadsheets aren't typography).

For what's next (Paged.js for browser-paginated PDFs, EPUB, slides, and a handful of speculative formats) see the [format roadmap](./docs/architecture/format-roadmap.md). For writing a custom adapter against an unsupported format, see the [custom adapter guide](./docs/guides/custom-adapter.md).

## Three ways to use Press

Press doesn't prescribe what the site is *for*. Three shapes are all first-class:

**Interactive report with downloads.** A live web document — navigable, themed, possibly with dynamic data — that also offers one or more Download buttons. Readers browse on screen; those who need a file click Download. The flagship case: annual reports, CVs, research outputs.

**Multi-format exports.** The same site registers fragments for several formats. A report section might contribute to docx (for the narrative) and xlsx (for the underlying data); a cover might contribute only to docx. Compilation is per-format and lazy — only the adapter you click loads.

**Headless export.** Sections register fragments and return `null`. The site has no visible output and exists purely as a compile target for an automated pipeline, admin tool, or generator UI. Press works here because registration is decoupled from rendering.

For how these shapes interact with preview strategies (same-source JSX vs compiled-blob), and the fuller mental model, see [concepts](./docs/concepts.md).

## Books and whole-site compilation

The patterns above cover one-page documents. For books — where the download's scope is *every chapter*, not just the current page — Press provides `compileSubtree`:

```js
await compileSubtree(<ChildBlocks blocks={website.allBlocks} />, 'typst')
```

This renders the whole content graph off-screen through its own provider, gathers every registration, and compiles. No page routing, no DOM mounts. See the [book publishing guide](./docs/guides/book-publishing.md) for the end-to-end flow.

## Subpath exports

| Entry point | What's in it |
|---|---|
| `@uniweb/press` | Core: `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`, `createStore`, `compileRegistrations`, `compileSubtree` |
| `@uniweb/press/docx` | React builders for docx (`Paragraph`, `TextRun`, `H1`–`H4`, `Image`, `Link`, `List`, …) |
| `@uniweb/press/typst` | React builders for Typst (`ChapterOpener`, `Heading`, `Paragraph`, `CodeBlock`, `Table`, `BlockQuote`, `Image`, `Asterism`, `Raw`, `Sequence`, …) |
| `@uniweb/press/sections` | `Section` and `StandardSection` — register-and-render helpers with their own `<section>` wrapper (for non-Uniweb React contexts) |
| `@uniweb/press/ir` | IR utilities (`htmlToIR`, `attributeMap`, `compileOutputs`) for custom adapter authors |
| `@uniweb/press/vite-plugin-typst` | Dev-server Vite plugin answering Typst `server` compile mode locally |

Format adapters themselves (`compileDocx`, `compileTypst`, `compileXlsx`, and the libraries they depend on) are deliberately **not** in the `exports` field. They're reached only through the dynamic `import()` inside `useDocumentCompile`, which keeps multi-megabyte libraries out of the main bundle.

## Documentation

**Start here:**

- [Concepts](./docs/concepts.md) — the mental model: why Press exists, the registration pattern, preview strategies, how to think about fragments. Read this if you're deciding how Press fits into a foundation.
- [Quick start](./docs/quick-start.md) — ten minutes from `npm install` to a working Download button, with a live preview.

**Guides:**

- [Publishing a book](./docs/guides/book-publishing.md) — whole-site aggregation via `compileSubtree`, the Typst pipeline, the two web modalities.
- [The preview pattern](./docs/guides/preview-pattern.md) — render a compiled `.docx` back into a sandboxed iframe via `docx-preview` for high-fidelity cross-check views.
- [Multi-block reports](./docs/guides/multi-block-reports.md) — how `DocumentProvider` aggregates output across many section components into one document.
- [Writing a custom adapter](./docs/guides/custom-adapter.md) — build a non-shipped format adapter using `@uniweb/press/ir`.
- [Citations](./docs/guides/citations.md) — bibliographies in preview and docx via the `citestyle` + Press pattern.
- [Style pack](./docs/guides/style-pack.md) — copy-paste `paragraphStyles` and `numbering` definitions for common bibliography patterns.

**Architecture and design:**

- [Principles](./docs/architecture/principles.md) — the architectural commitments Press is built on. Read before proposing any change that touches the public surface or introduces a new format.
- [Overview](./docs/architecture/overview.md) — how Press is put together under the hood, for contributors orienting to the codebase.
- [Adding a format](./docs/architecture/adding-a-format.md) — worked examples (LaTeX, Paged.js) and the general checklist.
- [Deployment](./docs/architecture/deployment.md) — wire protocol, reference implementations, and operational concerns for formats that need a backend.
- [Format roadmap](./docs/architecture/format-roadmap.md) — what's shipped, what's next, what's speculative.

**Runnable example:**

- [`examples/preview-iframe/`](./examples/preview-iframe/) — a minimal standalone Vite app demonstrating compile + preview + download end to end. Not a Uniweb foundation; a plain React app demonstrating that Press works outside Uniweb as well.

## See also

- [`@uniweb/loom`](https://github.com/uniweb/loom) — expression language for weaving data into text. A typical Uniweb report foundation runs Loom's `instantiateContent` over the parsed content tree *before* Press sees it, which means dynamic reports look identical to static ones from Press's point of view.
- [`@uniweb/kit`](https://github.com/uniweb/kit) — React components and hooks for Uniweb foundations. Preview-side typography often uses Kit components alongside Press builders for compiled output.

## Status

**Pre-1.0, published on npm.** The registration architecture, builder components, section templates, IR layer, and the docx, typst, and xlsx adapters are stable; the public surface is expected to hold through 1.0.

Releases go through the workspace publish pipeline. Breaking changes are acceptable when justified, but each release is a published artifact — the `exports` field and documented subpaths stay coherent across versions.

## Development

Press ships raw source with no build step. Edits in `src/` are immediately effective in any linked workspace package.

```bash
pnpm test           # vitest run — full suite
pnpm test:watch     # watch mode
pnpm test tests/docx/                # one directory
pnpm test -t 'inline marks'          # by test name
```

To run the `preview-iframe` demo:

```bash
cd examples/preview-iframe
pnpm install
pnpm dev
```

For contributor conventions — adding a builder, format adapter, or section helper; the docx image-emission invariants; testing patterns — see [`CLAUDE.md`](./CLAUDE.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE).