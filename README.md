# @uniweb/press

**Press your React components into downloadable files.** Write the same JSX once, get a live preview in your app *and* a real `.docx` file when users click Download. Word today; Excel and PDF in the roadmap.

```bash
npm install @uniweb/press
```

## Why

Most document-generation libraries make you build the document twice: once for the screen, once for the file. The two representations drift, because they're maintained separately and tested separately and every edit has to happen in two places.

Press takes a different approach. Your section components emit ordinary JSX using a small library of **builder components** (`<Paragraph>`, `<H1>`, `<TextRun>`, `<Image>`, etc.). The same JSX renders in the browser for preview, and when the user clicks Download, Press walks the tree, parses the rendered HTML into an intermediate representation, and hands that to a **format adapter** (e.g., docx) which produces a `.docx` Blob.

One source of truth. Zero drift. Works entirely in the browser — no server, no backend file storage, no intermediate upload step.

## Quick start

```jsx
import {
    DocumentProvider,
    DownloadButton,
    useDocumentOutput,
    H1,
    H2,
    Paragraph,
    Paragraphs,
} from '@uniweb/press/react'

// A section component that renders both preview AND registers a docx fragment
function CoverPage({ block, content }) {
    const markup = (
        <>
            <H1 data={content.title} />
            <H2 data={content.subtitle} />
            <Paragraphs data={content.paragraphs} />
        </>
    )

    // Register this JSX as the docx output for this block
    useDocumentOutput(block, 'docx', markup)

    // Render the preview (same JSX, rendered as HTML)
    return <section>{markup}</section>
}

// Wrap your report page in a provider and add a download button
function Report() {
    return (
        <DocumentProvider>
            <CoverPage
                block={{ id: 'cover' }}
                content={{
                    title: 'Annual Research Report',
                    subtitle: '2024–2025 Academic Year',
                    paragraphs: [
                        'This report summarizes research activity for the fiscal year.',
                        'Data is compiled from <strong>institutional records</strong> and self-reports.',
                    ],
                }}
            />
            <DownloadButton format="docx" fileName="report.docx">
                Download Report
            </DownloadButton>
        </DocumentProvider>
    )
}
```

When the user clicks Download:
1. The docx format adapter lazy-loads (~400 KB, only loaded on demand)
2. Press walks all blocks registered under the provider
3. Each registered JSX fragment is rendered to static HTML, parsed to an IR, and converted to docx primitives
4. A `.docx` Blob is produced and the browser downloads it

## The registration pattern

Instead of a separate "render as docx" function per component, Press uses a **hook-based registration**. During React render, components call `useDocumentOutput(block, format, fragment, options?)` to declare "here is my output for this format." The hook stores the fragment in a `WeakMap<block, Map<format, Output>>` held by `<DocumentProvider>`. When the user requests a download, the provider walks its registered blocks and compiles the result.

Benefits:

- **Concurrent-React-safe.** Registration is idempotent — Strict Mode's double-render produces the same result.
- **Garbage-collected.** When a block unmounts, its entry is eligible for collection via the WeakMap.
- **Composable.** Components are agnostic about "am I being rendered for preview or document?" They always render, and registration is a side-effect of that render.
- **Extensible.** Each format (docx, xlsx, pdf) is a separate subpath import (`@uniweb/press/docx`) so you only pay for what you use.

## Builder components

Builder components emit semantic HTML with `data-*` attributes that encode format-specific concerns (borders, spacing, page numbers, etc.) — so the same element works in the browser *and* carries the information the format adapter needs.

```jsx
import {
    Paragraph,      // <p>, with optional inline-mark parsing via `data` prop
    Paragraphs,     // render an array of paragraph strings
    TextRun,        // <span>, with bold/italic/underline props
    H1, H2, H3, H4, // headings with optional `data` prop
    Image, Images,  // images with sizing, alt text, auto-fetch during compile
    Link, Links,    // external/internal hyperlinks, auto-detected
    List, Lists,    // nested bullet/numbered lists
    Section,        // layout wrapper (max-width, padding)
} from '@uniweb/press/react'
```

Builders with a `data` prop parse inline HTML marks (`<strong>`, `<em>`, `<u>`) into styled text automatically:

```jsx
<Paragraph data="Awarded in <strong>2004</strong> with <em>honors</em>." />
// → Paragraph with three TextRuns: plain, bold, plain, italic, plain
```

Complex layouts (tables, borders, spacing) are expressed via data attributes on the built-in `<Paragraph as="div">` wrapper:

```jsx
<Paragraph as="div" data-type="table">
    <Paragraph as="div" data-type="tableRow">
        <Paragraph as="div" data-type="tableCell" data-width-size="40" data-width-type="pct">
            <Paragraph data={row.source} />
        </Paragraph>
        {/* ... */}
    </Paragraph>
</Paragraph>
```

## Subpath exports

Press ships as a small set of focused entry points — import only what you need:

| Entry point | What's in it |
|---|---|
| `@uniweb/press/react` | `DocumentProvider`, `useDocumentOutput`, `DownloadButton`, builder components |
| `@uniweb/press/sdk` | Content helpers: `instantiateContent`, `parseStyledString`, `makeCurrency`, `makeRange`, `join` |
| `@uniweb/press/docx` | The docx format adapter (~400 KB, lazy-loaded) |
| `@uniweb/press` | IR utilities (`htmlToIR`, `attributeMap`) for advanced use |

Most users will only ever import from `/react`. The orchestrator and adapters are loaded on demand by `DownloadButton`.

## Format support

| Format | Status | Notes |
|---|---|---|
| **docx** | ✅ Stable | Paragraphs, headings, text runs, tables, cell borders/margins/widths, bullet/numbered lists, hyperlinks, images with async fetch, page numbering (`_currentPage`/`_totalPages`), default headers/footers, `firstPageOnly` semantics |
| **xlsx** | 🔜 Planned | Plain `{ title, headers, data }` objects, multi-sheet via `exceljs` |
| **pdf** | 🔜 Planned | Reuse docx JSX via Paged.js, or `@react-pdf/renderer` for fine control |

docx uses [`docx`](https://docx.js.org). Different formats need different shapes — Press deliberately does not force a single IR for all of them. What unifies them is the registration hook, not the data model.

## Custom formats

Registration isn't locked to docx. Any component can register any format, and any consumer can walk the store and compile:

```jsx
useDocumentOutput(block, 'markdown', '# ' + content.title + '\n\n' + content.body)
useDocumentOutput(block, 'csv', { rows: data })
```

You can build your own adapter by walking the registration store (`compileOutputs(store, 'your-format')`), transforming the collected fragments, and producing whatever output you need.

## See also

- [`@uniweb/loom`](https://github.com/uniweb/loom) — A small expression language for weaving data into text. Useful for content that needs to reference dynamic values (`{family_name}`, `{", " city province country}`, etc.) before reaching your components. Works well with Press via the `instantiateContent` helper in `@uniweb/press/sdk`.

## Status

**Pre-1.0.** The registration architecture, builder components, IR layer, and docx adapter are stable and covered by ~135 tests. The API is unlikely to change before 1.0, but treat the version number as guidance. xlsx and PDF adapters are on the roadmap.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
