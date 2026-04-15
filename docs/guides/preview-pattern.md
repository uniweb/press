# The preview pattern

Render a compiled `.docx` into an iframe in your own app so users can review the document before downloading it. This is the flow the [`examples/preview-iframe/`](../../examples/preview-iframe/) demo exercises end to end.

## Why compile and download are separate

`useDocumentCompile` returns a Blob. It does not save a file. `triggerDownload` is a separate DOM utility that turns a Blob into a browser download. If you only need the download button, pair them:

```jsx
const { compile, isCompiling } = useDocumentCompile()
const handleClick = async () => {
    const blob = await compile('docx')
    triggerDownload(blob, 'report.docx')
}
```

But the same `compile('docx')` call gives you a Blob you can render anywhere — an iframe, a sandboxed `<div>`, a print preview pane. The split exists because one of the most valuable things Press enables is **in-app review of the file before it's saved.** Users click Preview, see exactly what they'll get, *then* click Download.

If `compile` saved a file automatically, a "preview" button would have to compile twice — once to render, once to download when the user finally clicks the save button. Separating them means one compile powers both.

## The flow

1. User clicks Preview.
2. `compile('docx')` produces a Blob.
3. Hand the Blob to [`docx-preview`](https://github.com/VolodymyrBaydalka/docxjs) which parses it and renders the document as HTML/CSS inside a container element.
4. User reviews the document, possibly edits content upstream, and eventually clicks Download.
5. `compile('docx')` runs again (fresh Blob in case anything changed), then `triggerDownload` saves the file.

`docx-preview` is a separate, focused library. Press doesn't bundle it — you install it in your own app and import it only where you need it.

## Why an iframe

You can render the compiled document into any DOM container. The demo uses an `<iframe>` for three reasons:

1. **Style isolation.** `docx-preview` injects its own CSS and uses classes like `.docx-wrapper` and `.docx` that would collide with your app's stylesheet. An iframe gives it a fresh document to own.
2. **Event isolation.** Clicks inside the preview don't bubble up to your app. Users can select text, scroll the preview, right-click without triggering app behavior.
3. **Print separation.** The user can print the preview iframe directly from the browser context menu, independent of your app's print rules.

If your app is already strictly scoped (e.g., Shadow DOM, or a rendering context that doesn't inherit global styles), you can render into a plain `<div>` instead.

## Minimal implementation

```jsx
import React, { useRef, useState } from 'react'
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

function PreviewControls({ iframeRef }) {
    const { compile, isCompiling } = useDocumentCompile()
    const [error, setError] = useState(null)

    const runPreview = async () => {
        setError(null)
        try {
            const blob = await compile('docx')
            const { renderAsync } = await import('docx-preview')
            const iframe = iframeRef.current
            if (!iframe) return
            const doc = iframe.contentDocument
            doc.body.innerHTML = ''
            await renderAsync(blob, doc.body, null, {
                className: 'docx-preview',
                inWrapper: true,
            })
        } catch (err) {
            setError(err.message || String(err))
        }
    }

    const runDownload = async () => {
        setError(null)
        try {
            const blob = await compile('docx')
            triggerDownload(blob, 'report.docx')
        } catch (err) {
            setError(err.message || String(err))
        }
    }

    return (
        <div>
            <button onClick={runPreview} disabled={isCompiling}>
                Preview
            </button>
            <button onClick={runDownload} disabled={isCompiling}>
                Download
            </button>
            {error && <p style={{ color: 'crimson' }}>{error}</p>}
        </div>
    )
}

export default function Report({ cover }) {
    const iframeRef = useRef(null)
    return (
        <DocumentProvider>
            <Cover block={cover} content={cover.content} />
            <PreviewControls iframeRef={iframeRef} />
            <iframe
                ref={iframeRef}
                title="Compiled .docx preview"
                sandbox="allow-same-origin"
                style={{ width: '100%', height: 600, border: '1px solid #ccc' }}
            />
        </DocumentProvider>
    )
}
```

Key details:

- **`docx-preview` is imported dynamically** (`await import('docx-preview')`) so it doesn't weigh down the initial page load. The main chunk has no reference to it; the browser fetches it the first time a user clicks Preview.
- **`sandbox="allow-same-origin"`** lets `docx-preview` inject styles and DOM into the iframe. Drop `allow-scripts` — the preview is static content, no scripts needed.
- **`doc.body.innerHTML = ''`** clears any previous preview before rendering. Otherwise successive Preview clicks accumulate copies of the document.
- **Two `compile` calls** (one in Preview, one in Download) are *not* wasted work. If you click Preview then immediately click Download, both calls compile from the current registration state. Between the clicks, nothing caches.

## Preview fidelity vs. Word fidelity

`docx-preview` is a **preview**, not a WYSIWYG renderer. It produces HTML/CSS that looks like the compiled document, but:

- Font metrics don't match Word exactly. Text wraps at slightly different points.
- Table layouts can differ in column width distribution.
- Complex features (some embedded objects, advanced numbering, themes) may not render.
- The browser's font fallback is different from Word's.

For most review flows this is fine — the user is checking "is the content right, is the structure right, does it roughly look right." If you need pixel-perfect fidelity, there is no in-browser substitute for opening the downloaded file in Word.

Treat the preview as a sanity check, not a final proof. Frame it that way in your UI too — "Preview (approximate)" or "Preview — final appearance may vary slightly in Word" reduces support questions.

## Rendering into a `<div>` instead

If you don't want the iframe, render into a regular div. The only change is the target element:

```jsx
const containerRef = useRef(null)

const runPreview = async () => {
    const blob = await compile('docx')
    const { renderAsync } = await import('docx-preview')
    containerRef.current.innerHTML = ''
    await renderAsync(blob, containerRef.current, null, {
        className: 'docx-preview',
        inWrapper: true,
    })
}

return <div ref={containerRef} />
```

Be prepared for `docx-preview`'s CSS to influence surrounding elements. Scope its styles with a parent selector if needed.

## Caching the compiled Blob

The minimal implementation above calls `compile('docx')` twice on two consecutive clicks. For a heavy document that's ~500 ms to a few seconds of extra work. You can cache the Blob in local state and invalidate on content changes:

```jsx
const [cachedBlob, setCachedBlob] = useState(null)

const getBlob = async () => {
    if (cachedBlob) return cachedBlob
    const blob = await compile('docx')
    setCachedBlob(blob)
    return blob
}

// Invalidate when upstream content changes:
useEffect(() => {
    setCachedBlob(null)
}, [content])
```

This is an app-level optimization, not something Press builds in. Press's `useDocumentCompile` always compiles fresh — caching "same inputs → same output" would require tracking inputs, and the whole point of the registration pattern is that Press doesn't know what your inputs are.

## See also

- **[`examples/preview-iframe/`](../../examples/preview-iframe/)** — a runnable Vite demo of this pattern, including `docx-preview` wired up.
- **[`tests/integration/preview-flow.test.jsx`](../../tests/integration/preview-flow.test.jsx)** — automated structural check that the demo's contract (PK magic bytes, `isCompiling` transitions, distinct Blobs across calls) holds.
- **[Core API — `useDocumentCompile`](../api/core.md)** — the hook's full signature and error model.
- **[`docx-preview` on npm](https://www.npmjs.com/package/docx-preview)** — the third-party library. Read its options for fine-grained control over the preview.
