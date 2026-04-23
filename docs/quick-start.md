# Quick start

Ten minutes from `npm install` to a working Download button. The examples assume a Uniweb foundation — for a non-Uniweb React app, see the [preview-iframe example](../examples/preview-iframe/) which demonstrates the same flow in a plain Vite app.

## Install

```bash
npm install @uniweb/press
```

Press has a React peer dependency (18 or 19). It does not install `docx`, `exceljs`, or the Typst runtime for you — each format's heavy library is declared as a dependency of Press and loaded dynamically the first time you call `compile(format)`. A foundation that never calls `compile('docx')` never pays for the `docx` library.

## Write a section

A Uniweb section component receives `{ content, params, block }`. `content` has a guaranteed shape (title, paragraphs, links, images, items, …) — empty strings and arrays if the markdown didn't populate them, never null. `block` is the runtime's representation of the section, which Press uses as a key in its registration store.

Register a docx fragment with `useDocumentOutput`, and use the builder components from `@uniweb/press/docx` to describe what goes in the file:

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

    return <div className='max-w-4xl mx-auto'>{body}</div>
}

export default Cover
```

Three things to notice:

1. **No `<section>` wrapper in the return value.** The Uniweb runtime wraps every section in `<section>` with a context class and background. The component returns just its inner layout. In a non-Uniweb React app you'd wrap in `<section>` yourself, or use the `<Section>` helper from `@uniweb/press/sections` which does it for you.
2. **The same `body` is used twice.** It's registered for docx compilation *and* rendered as the visible preview. No drift because there's one JSX tree.
3. **`content.paragraphs` is an array.** Uniweb's content shape uses plural, pre-parsed arrays. `Paragraphs` (plural) is the builder that accepts them; `Paragraph` (singular) is for one-at-a-time use.

The same pattern works for other formats — substitute `'typst'` and `@uniweb/press/typst` builders to register a Typst fragment, or register a plain `{ title, headers, data }` object with `'xlsx'` for a spreadsheet. A section can register for more than one format in the same render.

## Match it to markdown

Content authors provide the content by writing markdown. A minimal file that matches the section above:

```markdown
---
type: Cover
---

# Annual Research Report

## Fiscal Year 2025

This report summarizes activity for the fiscal year.

Data was compiled from institutional records and self-reports.
```

After the Uniweb parser runs, `content` looks like:

```js
{
    title: 'Annual Research Report',
    subtitle: 'Fiscal Year 2025',
    paragraphs: [
        'This report summarizes activity for the fiscal year.',
        'Data was compiled from institutional records and self-reports.',
    ],
    // ...empty arrays/strings for every other field
}
```

The `<Cover>` component reads these directly. No null checks, no defensive guards — Uniweb guarantees the shape.

## Drop it inside a DocumentProvider

Press collects registrations inside a React context. Wrap any part of the tree that contains sections you want to include in the compiled document:

```jsx
// In your layout, header, or a dedicated controls section:
import { DocumentProvider } from '@uniweb/press'

function ReportLayout({ children }) {
    return (
        <DocumentProvider>
            {children}
            <DownloadControls />
        </DocumentProvider>
    )
}
```

Every `<Cover>` (or any other section component) that renders inside this tree and calls `useDocumentOutput` contributes its fragment to the compiled document. Sections that don't call the hook are ignored. You can freely mix opt-in and non-opt-in sections in the same page.

In a Uniweb foundation, `ReportLayout` is typically a layout component at `src/layouts/ReportLayout/index.jsx`. The `<DocumentProvider>` wraps the layout's `children` so every section on the page is in scope.

## Add a Download button

Compilation is exposed through a second hook that returns a `compile` function (which resolves to a Blob) and an `isCompiling` flag:

```jsx
import { useDocumentCompile, triggerDownload } from '@uniweb/press'

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

`compile` returns the Blob; `triggerDownload` is a separate DOM utility that hands it to the browser. This split is deliberate — see [concepts](./concepts.md#compile-is-separate-from-download) for why and [the preview pattern guide](./guides/preview-pattern.md) for the compile-then-preview-before-saving flow.

The docx library is fetched via dynamic import the first time `compile('docx')` runs, producing a separate bundle chunk that the browser loads on demand. Until then, your page pays only for the registration machinery (small, mostly React context) and whatever builder components you've imported.

## Inline styling in text

The `data` prop on `<Paragraph>` and `<H1>`–`<H4>` parses inline HTML marks into styled text runs automatically. Markdown authors write:

```markdown
Awarded in **2004** with *honors*.
```

The Uniweb parser serializes that to an HTML string in `content.paragraphs[0]`:

```
"Awarded in <strong>2004</strong> with <em>honors</em>."
```

And the builder handles the marks:

```jsx
<Paragraph data={content.paragraphs[0]} />
```

You don't have to split the string into parts yourself. If you need finer control, use `<TextRun>` children instead of the `data` prop:

```jsx
<Paragraph>
    Awarded in <TextRun bold>2004</TextRun> with <TextRun italics>honors</TextRun>.
</Paragraph>
```

## Multiple sections, one document

Registrations accumulate across every section rendered inside the provider. Adding a second section is just adding another component — Uniweb renders it in the usual way, and if that component calls `useDocumentOutput`, it contributes to the compiled file:

```jsx
// src/sections/Summary/index.jsx
import { useDocumentOutput } from '@uniweb/press'
import { H2, Paragraphs } from '@uniweb/press/docx'

function Summary({ content, block }) {
    const { title, paragraphs } = content

    const body = (
        <>
            <H2 data={title} />
            <Paragraphs data={paragraphs} />
        </>
    )

    useDocumentOutput(block, 'docx', body)
    return <div className='max-w-4xl mx-auto'>{body}</div>
}

export default Summary
```

The content author adds a second markdown file to the page, selects `Summary` as its type, and writes the content. When the user clicks Download, both registrations are walked in order and concatenated into one `.docx` file. See [multi-block reports](./guides/multi-block-reports.md) for how the provider orders them and what happens when sections mount and unmount.

## Variations you'll probably want later

The hello-world above uses Press's builder components as *both* the visible preview and the registered docx source — the simplest mode. A few common variations:

- **Kit for preview, Press for docx.** Render richer theme-aware typography with Kit components in the visible output while registering a parallel Press-builder tree for compilation. Two trees, one structure.
- **Compiled-only, no preview.** A section returns `null` but registers a fragment. Useful for footer metadata, hidden appendices, or a headless export where the site has no visible output at all.
- **Compiled-blob preview.** Render the compiled `.docx` itself back into a sandboxed iframe via `docx-preview` for a high-fidelity cross-check view.

For the mental model behind these, see [concepts](./concepts.md). For the compiled-blob preview pattern specifically, see [the preview pattern guide](./guides/preview-pattern.md).

## Next steps

- **[Concepts](./concepts.md)** — the full mental model: why Press is shaped the way it is, how the registration pattern fits into Uniweb, and the three foundation shapes (interactive report, multi-format, headless).
- **[Publishing a book](./guides/book-publishing.md)** — whole-site compilation via `compileSubtree`, the Typst pipeline, same-source preview across an entire book.
- **[Multi-block reports](./guides/multi-block-reports.md)** — how registrations accumulate and order across many sections.
- **[Writing a custom adapter](./guides/custom-adapter.md)** — build a format Press doesn't ship.
- **[examples/preview-iframe/](../examples/preview-iframe/)** — a runnable standalone demo (non-Uniweb React app) exercising compile + preview + download end to end.

For the public subpaths and what each entry point exports, see the [README](../README.md#subpath-exports).