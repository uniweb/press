# @uniweb/press

**Alternate outputs from Uniweb content.** A Uniweb site is pure content — markdown files, parsed into a guaranteed shape, delivered to React components. Press is a framework that lets foundations turn that content into downloadable files (Word, Excel, PDF, anything else) using the same section components that render the website. One source, many outputs.

```bash
npm install @uniweb/press
```

## Why

A Uniweb site is, in a useful sense, a URL that represents a document. Titles, paragraphs, tables, lists, tagged data blocks — all already parsed, all already available to section components. With Loom and dynamic data fetching, that document can be live and hierarchical: a report whose sections instantiate against a CV profile, a publication list that updates automatically, a program whose entries are filtered per department. The content is right there.

Press is the output layer of that system. It gives foundations:

- A **registration hook** (`useDocumentOutput`) so a section component can say "here is what I produce for this format."
- A **compile hook** (`useDocumentCompile`) that walks all registered sections in a page and produces a `Blob` for the requested format.
- A **download utility** (`triggerDownload`) for saving the Blob to a file.
- A **docx toolkit** — React builder components and a lazy-loaded format adapter — for the most common output format.

The core is **format-agnostic**. Press ships a docx toolkit today, and xlsx and pdf toolkits are on the roadmap. But you can use Press right now to generate any format you want by writing your own adapter against `@uniweb/press/ir`. Press is a framework for alternate outputs; the docx toolkit is one implementation of it.

## Ways to use it

Press doesn't prescribe what the site is *for*. Three shapes are all first-class, and you pick based on what you're building. See [concepts](./docs/concepts.md) for the full discussion.

**1. Interactive report + downloads.** A live web document — navigable, themed, possibly with dynamic data and Loom-instantiated content — that also offers one or more download buttons. Readers browse on screen; those who need a file click Download. This is the flagship case for annual reports, CVs, program guides, and anything else that wants to exist as both a URL and a document.

**2. Multi-format exports.** The same site registers fragments for several formats at once — docx for the narrative, xlsx for the tabular data, a custom JSON export for machine consumers. Each section chooses which formats it contributes to. Compilation is per-format and lazy: a user clicks "Download xlsx" and only the xlsx adapter loads.

**3. Headless export.** Sections register fragments and return `null`. The site has no visible output — it exists purely as a compile target for an automated pipeline, an admin tool, or a generator UI whose only job is to produce files. Press works here because registration is decoupled from rendering; a component that returns `null` still contributes to `compile()`.

For cases 1 and 2, you also choose **how the preview works**:

- **JSX-as-preview (recommended).** Press's `/docx` builder components emit ordinary HTML (`<p>`, `<h1>`, `<span>` with `data-*` attributes). The exact same JSX serves as the browser preview *and* as the source the compile pipeline walks. One tree, zero drift, no extra library. Your section is already rendering JSX — using Press builders costs nothing more. You can also split: Kit components for a richer themed preview, Press builders for the registered docx fragment, mirroring the same structure.
- **Compiled-blob preview via `docx-preview`.** Instead of previewing the *content*, preview the *compiled file*. Render whatever you want (or nothing) in the component, then feed the Blob from `compile('docx')` into [`docx-preview`](https://github.com/VolodymyrBaydalka/docxjs) inside a sandboxed iframe to see Word's actual formatting. Useful as a cross-check view or when the downloaded file's exact appearance matters more than a browseable web view. Pays the `docx-preview` library cost; see the [preview pattern guide](./docs/guides/preview-pattern.md).

The two strategies compose — a foundation can do JSX-as-preview for normal reading and *also* offer a "Preview compiled file" button that opens the docx-preview iframe.

## Hello world

A Uniweb section component that renders both a preview and a registered docx fragment from the same JSX:

```jsx
// src/sections/Cover/index.jsx
import { useDocumentOutput } from '@uniweb/press'
import { H1, H2, Paragraphs } from '@uniweb/press/docx'

function Cover({ content, block }) {
    const { title, subtitle, paragraphs } = content

    const body = (
        <>
            <H1 data={title} />
            <H2 data={subtitle} />
            <Paragraphs data={paragraphs} />
        </>
    )

    useDocumentOutput(block, 'docx', body)

    return <div className="max-w-4xl mx-auto">{body}</div>
}

export default Cover
```

A few things to notice:

- **Standard Uniweb section shape.** `{ content, block }` destructured. `content.paragraphs` is a guaranteed array — empty if there are none, never null. No outer `<section>` wrapper, because the Uniweb runtime wraps every section in `<section>` with the right context class and background.
- **Same JSX, two consumers.** `body` is used twice: registered for docx compilation and rendered into the visible layout. There is no duplication to drift between them.
- **Any section is opt-in.** Sections that don't call `useDocumentOutput` are never included in the compiled document. The hook is a no-op when called outside a provider, so you can freely mix opt-in and non-opt-in sections in the same page.

Somewhere higher in the tree (a layout, a header, a dedicated "download" section), add a `<DocumentProvider>` and a button that calls `compile`:

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
            <DownloadControls />
        </DocumentProvider>
    )
}

function DownloadControls() {
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

Every section between the provider and the button that called `useDocumentOutput` contributes its registered fragment to the compiled document. The rest is ignored. The docx library itself is loaded dynamically on the first `compile('docx')` call, not at page load.

## Documentation

Start here:

- **[Quick start](./docs/quick-start.md)** — Ten minutes from `npm install` to a working Download button, with a live preview.
- **[Concepts](./docs/concepts.md)** — Why Press exists, the registration pattern, the four ways to combine preview and compiled output, why compile is separate from download, why the docx toolkit is just a toolkit.

API reference:

- **[Core](./docs/api/core.md)** — `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`.
- **[/docx](./docs/api/docx.md)** — Every builder component with runnable examples.
- **[/sections](./docs/api/sections.md)** — `Section` and `StandardSection` — higher-level templates intended for non-Uniweb contexts where you need an explicit section wrapper.
- **[/ir](./docs/api/ir.md)** — IR layer for custom format adapters.

Guides:

- **[Publishing a book](./docs/guides/book-publishing.md)** — Whole-site aggregation, three compile modes (sources / server / wasm roadmap), the Vite dev plugin, and the two web modalities (same-JSX preview vs its-own-medium web UX).
- **[The preview pattern](./docs/guides/preview-pattern.md)** — Render a compiled `.docx` back into a sandboxed iframe via `docx-preview` as a cross-check view, separate from the per-component React preview.
- **[Multi-block reports](./docs/guides/multi-block-reports.md)** — How `DocumentProvider` aggregates output across many section components into one document.
- **[Writing a custom adapter](./docs/guides/custom-adapter.md)** — Build a non-docx format adapter using `@uniweb/press/ir`.
- **[Citations](./docs/guides/citations.md)** — The `citestyle` + Press pattern for bibliographies in preview and docx.
- **[Style pack](./docs/guides/style-pack.md)** — Copy-paste `paragraphStyles` and `numbering` definitions for hanging-indent and numbered bibliography entries.

Migration:

- **[Migration from phase 1](./docs/migration-from-phase-1.md)** — For readers holding phase-1 examples with `@uniweb/press/react` and `DownloadButton`.

There is also a runnable demo at [`examples/preview-iframe/`](./examples/preview-iframe/) — a minimal standalone Vite app exercising the compile + preview + download flow end to end. It's not a Uniweb foundation; it's a plain React app demonstrating that Press works outside Uniweb as well.

## Subpath exports

| Entry point | What's in it |
|---|---|
| `@uniweb/press` | `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`, `createStore`, `compileRegistrations`, `compileSubtree` — the format-agnostic core |
| `@uniweb/press/docx` | React builder components for docx output (`Paragraph`, `TextRun`, `H1`–`H4`, `Image`, `Link`, `List`, …) |
| `@uniweb/press/typst` | React builder components for Typst output (`ChapterOpener`, `Heading`, `Paragraph`, `CodeBlock`, `List`, `Table`, `BlockQuote`, `Image`, `Asterism`, `Raw`, `Sequence`, …) |
| `@uniweb/press/sections` | `Section` and `StandardSection` — register-and-render helpers that include their own `<section>` wrapper (for non-Uniweb React contexts) |
| `@uniweb/press/ir` | IR utilities (`htmlToIR`, `attributeMap`, `compileOutputs`) for custom-adapter authors |
| `@uniweb/press/vite-plugin-typst` | Dev-server Vite plugin that answers the Typst `server` compile mode by running `typst compile` locally and streaming back a PDF |

The ~3.4 MB `docx` library is never pulled into the main bundle. It's loaded dynamically the first time `compile('docx')` runs.

## Shipped toolkits and roadmap

Press separates the **framework** (registration, compile, download) from the **toolkits** (per-format React builders and adapters). The framework is stable and usable today for any format. The toolkits are the shipped conveniences:

| Toolkit | Status | Notes |
|---|---|---|
| **docx** | ✅ Shipped | Paragraphs, headings, text runs, tables, borders/margins/widths, bullet/numbered lists, hyperlinks, images with async fetch, page numbering, default headers/footers, `firstPageOnly` semantics. Uses the [`docx`](https://docx.js.org) library. |
| **typst** | ✅ Shipped | Whole-book compile via `compileSubtree`, two compile modes (`sources` ZIP + `server` PDF via included Vite dev plugin), 12 builders + `Sequence` walker. Produces real PDFs through the [Typst](https://typst.app) compiler. See [Publishing a book](./docs/guides/book-publishing.md). |
| **xlsx** | 🔜 Roadmap | Plain `{ title, headers, data }` objects, multi-sheet. Different shape from docx because spreadsheets aren't typography. |
| **pdf** | 🔜 Roadmap | Either docx JSX via Paged.js or `@react-pdf/renderer` for fine control. Decision deferred. |

Writing a custom adapter (Markdown, RTF, a domain-specific XML, a JSON export) is supported today via `@uniweb/press/ir`. See the [custom adapter guide](./docs/guides/custom-adapter.md).

## See also

- [`@uniweb/loom`](https://github.com/uniweb/loom) — A small expression language for weaving data into text. The typical Uniweb report foundation uses a content handler that runs Loom's `instantiateContent` over the parsed content tree, resolving placeholders against live data before Press ever sees the section — which means dynamic reports look identical to static ones from Press's point of view.
- [`@uniweb/kit`](https://github.com/uniweb/kit) — React components and hooks for building Uniweb foundations. The preview side of a Press-aware component typically uses Kit for theme-aware typography (`H1`, `H2`, `P`, `Prose`, `ChildBlocks`, `Visual`, etc.) alongside Press's builder components for the compiled output. See the [concepts doc](./docs/concepts.md) for the "same JSX vs separate preview" discussion.

## Status

**Pre-1.0, unpublished.** The registration architecture, builder components, section templates, IR layer, and docx adapter are stable and covered by 133 tests. The public surface is expected to hold through 1.0. xlsx and pdf toolkits are on the roadmap.

## Development

Press ships raw source — there is no build step. Edits in `src/` are immediately effective in any linked workspace package.

```bash
pnpm test           # vitest run — full suite
pnpm test:watch     # watch mode
pnpm test tests/docx/                # one directory
pnpm test -t 'inline marks'          # by test name
```

Test layout mirrors `src/`: `tests/core/`, `tests/docx/`, `tests/sections/`, `tests/ir/`, plus `tests/integration/` for end-to-end cases.

To run the preview-iframe demo:

```bash
cd examples/preview-iframe
pnpm install
pnpm dev
```

It registers three sections in a `DocumentProvider` and exposes Preview (compiles and renders via `docx-preview` into a sandboxed iframe) and Download (compiles and calls `triggerDownload`) buttons.

**Adding a builder component, format adapter, or section helper:** see `CLAUDE.md` for the runbooks.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
