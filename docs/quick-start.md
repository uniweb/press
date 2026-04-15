# Quick start

Ten minutes from `npm install` to a working Download button with a live preview alongside it.

## Install

```bash
npm install @uniweb/press
```

Press has a React peer dependency (18 or 19). It does not install `docx` for you — that library is bundled *inside* Press and loaded dynamically the first time you call `compile('docx')`.

## Write a section

A section component is an ordinary React component that renders JSX and also registers that JSX for compilation to a document format. The registration happens through a hook:

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { H1, Paragraph } from '@uniweb/press/docx'

export function Cover({ block, content }) {
    const markup = (
        <>
            <H1 data={content.title} />
            <Paragraph data={content.body} />
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}
```

Two things to notice:

1. **The same `markup` is used twice.** Once passed to `useDocumentOutput` (so the compile pipeline can walk it), once rendered into the `<section>` wrapper (so the user sees a live preview). There's no second representation to maintain.
2. **The hook takes a `block` argument.** This is whatever object you use to identify the section — a content object, an id, a plain `{}` — and is used as a key in a WeakMap of registrations held by the provider. Unmounted blocks are garbage-collected automatically.

## Drop it inside a DocumentProvider

Press collects registrations inside a React context. Wrap any part of the tree that needs document compilation in a `<DocumentProvider>`:

```jsx
import { DocumentProvider } from '@uniweb/press'

function Report() {
    return (
        <DocumentProvider>
            <Cover
                block={{ id: 'cover' }}
                content={{
                    title: 'Annual Research Report',
                    body: 'This report summarizes activity for the fiscal year.',
                }}
            />
        </DocumentProvider>
    )
}
```

`useDocumentOutput` is a no-op (with a dev warning) when called outside a provider, so you can nest sections freely without coordinating whether each one is "inside Press" or not.

## Add a Download button

Compilation is exposed through a second hook. It returns a `compile` function that resolves to a Blob, and an `isCompiling` flag you can use to disable the button while the async call runs:

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

`compile` returns the Blob; `triggerDownload` is a separate DOM utility that hands it to the browser. This split is deliberate — see the [preview pattern guide](./guides/preview-pattern.md) for why it exists.

The full page now looks like:

```jsx
function Report() {
    return (
        <DocumentProvider>
            <Cover
                block={{ id: 'cover' }}
                content={{
                    title: 'Annual Research Report',
                    body: 'This report summarizes activity for the fiscal year.',
                }}
            />
            <DownloadControls />
        </DocumentProvider>
    )
}
```

## Inline styling in text

The `data` prop on `<Paragraph>` and `<H1>`–`<H4>` parses inline HTML marks into styled text runs automatically:

```jsx
<Paragraph data="Awarded in <strong>2004</strong> with <em>honors</em>." />
```

Renders the same way in the browser preview and in the downloaded `.docx`. If you need finer control, use `<TextRun>` children:

```jsx
<Paragraph>
    Awarded in <TextRun bold>2004</TextRun> with <TextRun italics>honors</TextRun>.
</Paragraph>
```

## Multiple sections, one document

Registrations accumulate across every `<*Section>` rendered inside the provider. Adding a second section is just adding another component:

```jsx
import { H1, H2, Paragraph } from '@uniweb/press/docx'

function Summary({ block, content }) {
    const markup = (
        <>
            <H2>Executive summary</H2>
            <Paragraph>{content.body}</Paragraph>
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

function Report({ cover, summary }) {
    return (
        <DocumentProvider>
            <Cover block={cover} content={cover} />
            <Summary block={summary} content={summary} />
            <DownloadControls />
        </DocumentProvider>
    )
}
```

When the user clicks Download, both registrations are walked in order and concatenated into one `.docx` file. See [multi-block reports](./guides/multi-block-reports.md) for how the provider orders them and what happens on unmount.

## Next steps

- **[Concepts](./concepts.md)** — why Press is shaped the way it is.
- **[Core API](./api/core.md)** — the four root-level exports in depth.
- **[/docx reference](./api/docx.md)** — every builder component with examples.
- **[Preview pattern](./guides/preview-pattern.md)** — rendering the compiled Blob in an iframe via `docx-preview` before download.
- **[examples/preview-iframe/](../examples/preview-iframe/)** — a runnable Vite demo of everything in this guide.
