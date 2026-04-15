# `@uniweb/press` — core API reference

The format-agnostic core. Four exports: a context provider, two hooks, and a DOM utility.

```js
import {
    DocumentProvider,
    useDocumentOutput,
    useDocumentCompile,
    triggerDownload,
} from '@uniweb/press'
```

## `<DocumentProvider>`

Context provider that holds all section registrations. Wrap any part of the React tree that contains section components whose output you want to collect.

```jsx
import { DocumentProvider } from '@uniweb/press'

function Report() {
    return (
        <DocumentProvider>
            <Cover block={cover} />
            <Summary block={summary} />
            <Findings block={findings} />
            <DownloadControls />
        </DocumentProvider>
    )
}
```

Props:

- **`children`** — the subtree to wrap.

The provider owns a `WeakMap<block, Map<format, entry>>` plus a parallel array that preserves registration order. It exposes `register`, `getOutputs`, and `clear` through context — these are internal; consumers use the hooks below instead.

Under React Strict Mode the provider's subtree is rendered twice during development. Registration is idempotent (a second call with the same `block + format` overwrites the first entry), so the double render produces the same store as a single render.

## `useDocumentOutput(block, format, fragment, options?)`

The registration hook. Call it from inside a section component to declare "here is my output for this format." The fragment is whatever representation the format wants — JSX for docx, a plain data object for xlsx.

```jsx
import { useDocumentOutput } from '@uniweb/press'
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
```

Arguments:

- **`block`** — any object used as the WeakMap key. Typically a content object, a section id, or a plain `{ id }`. When the block is garbage collected, its registration is cleared automatically.
- **`format`** — string identifier, e.g. `'docx'`. Not validated against a known list — foundations can register custom formats the core knows nothing about.
- **`fragment`** — the format-specific payload. JSX for docx; plain objects for xlsx; whatever makes sense for a custom adapter.
- **`options`** — optional registration options:
  - **`role`** — `'body'` (default), `'header'`, or `'footer'`. Body entries become the document's main content; header and footer entries map to the docx section header and footer.
  - **`applyTo`** — intent for header/footer entries: `'all'` (default), `'first'`, `'odd'`, or `'even'`. *Currently only `all` and `first` are honored by the docx adapter.*

Called outside of a `<DocumentProvider>`, the hook logs a development warning and returns — it does not throw. This makes sections safe to nest in trees where the provider is conditional.

## `useDocumentCompile()`

Returns an object with a `compile` function and an `isCompiling` boolean:

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

### `compile(format, documentOptions?)`

Compiles all registrations for the given format into a `Blob`.

- **`format`** — a known format identifier (`'docx'`; `'xlsx'` and `'pdf'` when those adapters ship). Unknown formats throw `Unsupported document format: "X"`.
- **`documentOptions`** — passed through to the adapter. For docx, these go to the `Document` constructor (`title`, `subject`, `creator`, `description`, `keywords`, etc.).

Returns `Promise<Blob>`. Errors propagate — both loading errors (the dynamic import failing) and compilation errors (a malformed IR tree, a bad docx option).

**`compile` does not trigger a download.** It returns a Blob so you can do anything with it: save it, feed it to `docx-preview`, upload it somewhere, or discard it. Pair with `triggerDownload` to save a file. See the [preview pattern guide](../guides/preview-pattern.md) for the render-into-iframe flow.

The first time `compile('docx')` runs, the adapter is fetched via dynamic import, producing a separate bundle chunk. Subsequent calls reuse the loaded module.

### `isCompiling`

`true` while a `compile` call is in flight, `false` otherwise. Useful for disabling buttons during compilation. The flag transitions `false → true → false` across a single compile call, and is guaranteed to reset to `false` in a `finally` block even if compilation throws.

## `triggerDownload(blob, fileName)`

DOM utility that turns a Blob into a browser download. Creates a temporary `<a>` element, sets its `href` to an object URL pointing at the blob, clicks it, removes it, and revokes the URL.

```js
import { triggerDownload } from '@uniweb/press'

triggerDownload(blob, 'annual-report.docx')
```

- **`blob`** — any `Blob`. Not restricted to docx; works for xlsx, pdf, plain text, JSON, or anything else you have in blob form.
- **`fileName`** — the name the browser should use for the saved file.

In environments without a DOM (Node, SSR, some test runners), `triggerDownload` is a no-op. It checks `typeof document === 'undefined'` and returns early, so you can call it unconditionally from isomorphic code without guards.

## Error handling

The registration path (`useDocumentOutput`) is forgiving — missing providers are warnings, not errors. The compile path (`useDocumentCompile`) is stricter:

| Condition | Result |
|---|---|
| `compile` called outside `<DocumentProvider>` | Throws `useDocumentCompile: called outside of a <DocumentProvider>` |
| `compile(format)` with an unknown format | Throws `Unsupported document format: "X"` |
| Adapter dynamic import fails | Throws the underlying network/module-resolution error |
| Adapter compile function throws | Rethrows |

In all error cases, `isCompiling` resets to `false` via a `finally` block.

## See also

- **[/docx reference](./docx.md)** — the builder components that produce fragments for docx compilation.
- **[/sections reference](./sections.md)** — higher-level templates that combine registration and rendering in one call.
- **[/ir reference](./ir.md)** — the IR layer for authors writing a custom format adapter on top of the registration core.
- **[Concepts](../concepts.md)** — the registration pattern and why compile is separate from download.
