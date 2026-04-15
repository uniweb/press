# @uniweb/press

**Press your React components into downloadable files.** Write the same JSX once, get a live preview in your app *and* a real `.docx` file when users click Download. Word today; Excel and PDF in the roadmap.

```bash
npm install @uniweb/press
```

## Why

Most document-generation libraries make you build the document twice: once for the screen, once for the file. The two representations drift, because they're maintained separately and tested separately and every edit has to happen in two places.

Press takes a different approach. Section components emit ordinary JSX using a small library of **builder components** (`<Paragraph>`, `<H1>`, `<TextRun>`, `<Image>`, …). The same JSX renders in the browser for preview, and when the user clicks Download, Press walks the tree, parses the rendered HTML into an intermediate representation, and hands that to a **format adapter** which produces a `.docx` Blob.

One source of truth. Zero drift. Works entirely in the browser — no server, no backend file storage, no intermediate upload.

## Hello world

```jsx
import {
    DocumentProvider,
    useDocumentOutput,
    useDocumentCompile,
    triggerDownload,
} from '@uniweb/press'
import { H1, Paragraph } from '@uniweb/press/docx'

function Cover({ block, content }) {
    const markup = (
        <>
            <H1 data={content.title} />
            <Paragraph data={content.body} />
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
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

export default function Report({ block, content }) {
    return (
        <DocumentProvider>
            <Cover block={block} content={content} />
            <DownloadControls />
        </DocumentProvider>
    )
}
```

Two imports, one per concern: the format-agnostic machinery from the root, the docx builder components from `/docx`.

## Documentation

Start here:

- **[Quick start](./docs/quick-start.md)** — Ten minutes from `npm install` to a working Download button, with a live preview.
- **[Concepts](./docs/concepts.md)** — The registration pattern, JSX-as-source-of-truth, and why the compile pipeline is split into a hook and a DOM utility.

API reference:

- **[Core](./docs/api/core.md)** — `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`.
- **[/docx](./docs/api/docx.md)** — Every builder component with runnable examples.
- **[/sections](./docs/api/sections.md)** — `Section` and `StandardSection` — higher-level templates that remove boilerplate.
- **[/ir](./docs/api/ir.md)** — IR layer for custom format adapters.

Guides:

- **[The preview pattern](./docs/guides/preview-pattern.md)** — Render a compiled `.docx` into an iframe via `docx-preview` for in-app review before download.
- **[Multi-block reports](./docs/guides/multi-block-reports.md)** — How `DocumentProvider` aggregates output across many section components into one document.
- **[Writing a custom adapter](./docs/guides/custom-adapter.md)** — Build a non-docx format adapter using `@uniweb/press/ir`.
- **[Citations](./docs/guides/citations.md)** — The `@citestyle/*` + Press pattern for bibliographies in preview and docx.

Migration:

- **[Migration from phase 1](./docs/migration-from-phase-1.md)** — For readers holding phase-1 examples with `@uniweb/press/react` and `DownloadButton`.

There is also a runnable demo at [`examples/preview-iframe/`](./examples/preview-iframe/) — a minimal Vite app exercising compile + preview + download end to end.

## Subpath exports

| Entry point | What's in it |
|---|---|
| `@uniweb/press` | `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload` — the format-agnostic core |
| `@uniweb/press/docx` | React builder components (`Paragraph`, `TextRun`, `H1`–`H4`, `Image`, `Link`, `List`, …) |
| `@uniweb/press/sections` | Section templates: `Section` (generic register-and-render wrapper), `StandardSection` (opinionated renderer for the standard content shape) |
| `@uniweb/press/ir` | IR utilities (`htmlToIR`, `attributeMap`, `compileOutputs`) for custom-adapter authors |

Most foundations import from `@uniweb/press` and `@uniweb/press/docx`. The ~3.4 MB `docx` library is never pulled into the main bundle — it is loaded dynamically the first time `compile('docx')` runs.

## Format support

| Format | Status | Notes |
|---|---|---|
| **docx** | ✅ Stable | Paragraphs, headings, text runs, tables, borders/margins/widths, bullet/numbered lists, hyperlinks, images with async fetch, page numbering, default headers/footers, `firstPageOnly` semantics |
| **xlsx** | 🔜 Planned | Plain `{ title, headers, data }` objects, multi-sheet |
| **pdf** | 🔜 Planned | Reuse docx JSX via Paged.js, or `@react-pdf/renderer` for fine control |

docx uses [`docx`](https://docx.js.org). Different formats need different shapes — Press deliberately does not force a single IR across all of them. What unifies them is the registration hook, not the data model.

## See also

- [`@uniweb/loom`](https://github.com/uniweb/loom) — A small expression language for weaving data into text. Useful for content that needs to reference dynamic values (`{family_name}`, `{", " city province country}`, etc.) before reaching your components. Loom's `instantiateContent` helper walks a ProseMirror content tree and resolves placeholders against live data; a Uniweb foundation typically calls it from a content handler upstream of Press so the JSX Press sees is already fully resolved.

## Status

**Pre-1.0, unpublished.** The registration architecture, builder components, section templates, IR layer, and docx adapter are stable and covered by 133 tests. The public surface is expected to hold through 1.0. xlsx and PDF adapters are on the roadmap.

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
