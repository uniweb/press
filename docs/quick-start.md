# Quick start

Ten minutes from `npm install` to a working Download button. The examples assume a Uniweb foundation — for a non-Uniweb React app, see the notes at the bottom of each section.

## Install

```bash
npm install @uniweb/press
```

Press has a React peer dependency (18 or 19). It does not install `docx` for you — that library is bundled *inside* Press and loaded dynamically the first time you call `compile('docx')`.

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

    return <div className="max-w-4xl mx-auto">{body}</div>
}

export default Cover
```

Three things to notice:

1. **No `<section>` wrapper in the return value.** The Uniweb runtime wraps every section in `<section>` with a context class and background. The component returns just its inner layout. (In a non-Uniweb React app you'd wrap in `<section>` yourself, or use the `<Section>` helper from `@uniweb/press/sections` which does it for you.)
2. **The same `body` is used twice.** It's registered for docx compilation *and* rendered as the visible preview. No drift because there's one JSX tree.
3. **`content.paragraphs` is an array.** Uniweb's content shape uses plural, pre-parsed arrays. `Paragraphs` (plural) is the builder that accepts them; `Paragraph` (singular) is for one-at-a-time use.

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

In a Uniweb foundation, `ReportLayout` is typically a **layout component** at `src/layouts/ReportLayout/index.jsx` — see [agents.md](https://raw.githubusercontent.com/uniweb/docs/main/reference/kit-reference.md) for how layouts work. The `<DocumentProvider>` wraps the layout's `children` so every section in the page is in scope.

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

`compile` returns the Blob; `triggerDownload` is a separate DOM utility that hands it to the browser. This split is deliberate — see the [preview pattern guide](./guides/preview-pattern.md) for the compile-then-preview-before-saving flow.

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
    return <div className="max-w-4xl mx-auto">{body}</div>
}

export default Summary
```

The content author adds a second markdown file to the page, selects `Summary` as its type, and writes the content. When the user clicks Download, both registrations are walked in order and concatenated into one `.docx` file. See [multi-block reports](./guides/multi-block-reports.md) for how the provider orders them and what happens when sections mount and unmount.

## Mixing preview and compiled output

The hello-world above uses Press's builder components as *both* the visible preview and the registered docx source. That's the simplest mode. Two other common modes:

### Kit for preview, Press for docx

If you want the richer theme-aware typography Kit provides for the visible preview while still compiling to docx, render them separately inside the same component:

```jsx
import { useDocumentOutput } from '@uniweb/press'
import * as Docx from '@uniweb/press/docx'
import { H1, H2, P } from '@uniweb/kit'

function Cover({ content, block }) {
    const { title, subtitle, paragraphs } = content

    useDocumentOutput(block, 'docx', (
        <>
            <Docx.H1 data={title} />
            <Docx.H2 data={subtitle} />
            <Docx.Paragraphs data={paragraphs} />
        </>
    ))

    return (
        <div className="max-w-4xl mx-auto">
            <H1 text={title} className="text-heading text-5xl font-bold" />
            <H2 text={subtitle} className="text-subtle text-2xl mt-4" />
            <P text={paragraphs} className="text-body mt-6" />
        </div>
    )
}
```

The structure mirrors — heading, subtitle, paragraphs — but Kit handles the visible typography and Press handles the compiled file.

### Compiled-only, no visible preview

A component can register a fragment and render nothing visible at all. Useful for footer metadata, a hidden cover-letter, or a computed appendix that should appear only in the downloaded file:

```jsx
function FooterMeta({ content, block }) {
    useDocumentOutput(block, 'docx', (
        <Paragraph>
            Generated {new Date().toISOString().slice(0, 10)}.
        </Paragraph>
    ), { role: 'footer' })

    return null
}
```

See the [concepts doc](./concepts.md) for the full discussion of the four modes (same JSX, separate preview, different shapes per medium, compiled-only).

## Next steps

- **[Concepts](./concepts.md)** — Why Press is shaped the way it is; the insight that a Uniweb site is already pure content; why compile is separate from download; why docx is a toolkit, not the framework.
- **[Core API](./api/core.md)** — the four root-level exports in depth.
- **[/docx reference](./api/docx.md)** — every builder component with examples.
- **[The preview pattern](./guides/preview-pattern.md)** — if you also want to render the compiled `.docx` via `docx-preview` as a cross-check view, separate from the per-component React preview.
- **[examples/preview-iframe/](../examples/preview-iframe/)** — a runnable standalone demo (non-Uniweb React app) exercising the whole compile + preview + download flow.
