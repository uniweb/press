# Migration from phase 1

Phase-1 code does not run unmodified against the current (phase 1.6) surface. There are no deprecation shims — Press was unpublished during the transition, so the cleanest break was the shortest break.

This document is for readers holding phase-1 examples who need to update them mechanically. For the architectural reasoning, read [Concepts](./concepts.md). For the current API, start at the [core API reference](./api/core.md) or [Quick start](./quick-start.md).

## Import table

| Phase 1 | Phase 1.6 |
|---|---|
| `@uniweb/press/react` | `@uniweb/press` (hooks, provider, download utility) + `@uniweb/press/docx` (builder components) |
| `@uniweb/press/sdk` — `instantiateContent` | `@uniweb/loom` (root export) |
| `@uniweb/press/sdk` — `parseStyledString` | No public export; the `<Paragraph data="…">` prop is the API |
| `@uniweb/press/sdk` — `makeCurrency`, `makeRange`, `makeParentheses`, `join` | Deleted. Use Loom (`AS currency`, `{+? a ' - ' b}`, `JOINED BY`, etc.) or inline the handful of lines. |
| `@uniweb/press` — `htmlToIR`, `attributeMap` | `@uniweb/press/ir` |
| `@uniweb/press/react` — `DownloadButton` | Removed. Write your own `<button>` calling `useDocumentCompile` + `triggerDownload`. |
| `@uniweb/press/react` — `useDocumentDownload` | Replaced by `useDocumentCompile` + `triggerDownload` (separate primitives) |
| `@uniweb/press/react` — `Section` (CSS wrapper) | Deleted. The name is reused for a register-and-render helper in `@uniweb/press/sections`. |

## Mechanical conversion

### Imports

**Before:**

```js
import {
    DocumentProvider,
    DownloadButton,
    useDocumentOutput,
    Paragraph, H1, Image, Link,
    Section,
} from '@uniweb/press/react'
import {
    instantiateContent,
    parseStyledString,
    makeCurrency, join,
} from '@uniweb/press/sdk'
import { htmlToIR, attributeMap } from '@uniweb/press'
```

**After:**

```js
import {
    DocumentProvider,
    useDocumentOutput,
    useDocumentCompile,
    triggerDownload,
} from '@uniweb/press'
import { Paragraph, H1, Image, Link } from '@uniweb/press/docx'
import { instantiateContent } from '@uniweb/loom'
import { htmlToIR, attributeMap } from '@uniweb/press/ir'
// DownloadButton: no replacement. Write a <button>, see below.
// parseStyledString: no replacement. Use <Paragraph data="...">.
// makeCurrency, makeRange, join: deleted. Use Loom or inline.
// Section (the CSS wrapper): deleted.
```

### `DownloadButton` replacement

**Before:**

```jsx
<DocumentProvider>
    <Cover block={coverBlock} />
    <DownloadButton format="docx" fileName="report.docx">
        Download
    </DownloadButton>
</DocumentProvider>
```

**After:**

```jsx
function DownloadControls() {
    const { compile, isCompiling } = useDocumentCompile()
    const handleDownload = async () => {
        const blob = await compile('docx', { title: 'Report' })
        triggerDownload(blob, 'report.docx')
    }
    return (
        <button onClick={handleDownload} disabled={isCompiling}>
            {isCompiling ? 'Generating…' : 'Download'}
        </button>
    )
}

// …

<DocumentProvider>
    <Cover block={coverBlock} />
    <DownloadControls />
</DocumentProvider>
```

A few lines of hand-written JSX replace the library-provided component. The trade is that `compile` returns a Blob instead of triggering a download directly — which unlocks the [preview pattern](./guides/preview-pattern.md): one compile call can feed both a preview renderer and a download button.

### `useDocumentDownload` replacement

**Before:**

```jsx
function MyButton() {
    const { download, isCompiling } = useDocumentDownload({
        format: 'docx',
        fileName: 'report.docx',
        documentOptions: { title: 'Report' },
    })
    return (
        <button onClick={download} disabled={isCompiling}>
            Download
        </button>
    )
}
```

**After:**

```jsx
function MyButton() {
    const { compile, isCompiling } = useDocumentCompile()
    const download = async () => {
        const blob = await compile('docx', { title: 'Report' })
        triggerDownload(blob, 'report.docx')
    }
    return (
        <button onClick={download} disabled={isCompiling}>
            Download
        </button>
    )
}
```

The shape is nearly identical. The differences:

- `compile(format, options)` — format is a positional argument, not part of an options bag.
- No `fileName` — the caller chooses the filename at `triggerDownload` time, not at hook construction time.
- `compile` returns a Blob. If you don't call `triggerDownload`, nothing gets saved. This is the change that enables preview-before-download.

### `instantiateContent` moved to Loom

**Before:**

```js
import { Loom } from '@uniweb/loom'
import { instantiateContent } from '@uniweb/press/sdk'
```

**After:**

```js
import { Loom, instantiateContent } from '@uniweb/loom'
```

The function's signature, behavior, and duck-typed engine contract are unchanged. It just lives one package over — which is where it always belonged architecturally, since it's a template-engine concern, not a document-generation concern.

### `parseStyledString` is gone

`parseStyledString(html)` returned an array of `{ content, bold, italics, underline }` parts. Every caller in phase 1 fed those parts into `<TextRun>` children.

The phase 1.6 `<Paragraph data="…">` and `<H1 data="…">`…`<H4 data="…">` props do this internally. If you were calling `parseStyledString` to avoid writing `<Paragraph>…</Paragraph>` with nested marks, just use the `data` prop:

```jsx
// Before:
const parts = parseStyledString('Awarded in <strong>2004</strong>')
return (
    <Paragraph>
        {parts.map((p, i) => (
            <TextRun key={i} bold={p.bold} italics={p.italics}>
                {p.content}
            </TextRun>
        ))}
    </Paragraph>
)

// After:
return <Paragraph data="Awarded in <strong>2004</strong>" />
```

If you were using `parseStyledString` to build something that *isn't* a Paragraph (a table cell, a link label, a custom component), the function is still in the source tree at `src/docx/parseStyledString.js` — it's just not a public export. Copy it into your own code, or import it from the relative path if you're working inside the Press repo. For external consumers the right move is to keep the string and let the `data` prop parse it at the point of use.

### Utility helpers (`makeCurrency`, `join`, …) are gone

The four utilities in phase-1 `@uniweb/press/sdk` were:

- `makeCurrency(value, withSymbol)` — "$1,000.00" formatter.
- `makeParentheses(value)` — wrap non-empty value in parens.
- `makeRange(start, end)` — "2020 - 2025", with graceful fallback.
- `join(array, separator)` — `array.filter(Boolean).join(separator)`.

All four were deleted. Loom covers them more expressively:

| Phase-1 call | Loom equivalent |
|---|---|
| `makeCurrency(amount)` | `{amount AS currency USD}` |
| `makeParentheses(text)` | `{+? '(' text ')'}` |
| `makeRange(start, end)` | `{+? start ' - ' end}` (collapses gracefully when either is missing) |
| `join(arr, ', ')` | `{arr JOINED BY ', '}` or `{+:', ' arr}` |

If you don't use Loom and don't want to add it, the functions are three to five lines each — inline them at the call site. The reason they were removed from Press is that there were zero internal consumers, and keeping them as a public export would have made the surface area larger than the value they added.

### IR utilities moved to `/ir`

**Before:**

```js
import { htmlToIR, attributeMap, attributesToProperties } from '@uniweb/press'
```

**After:**

```js
import { htmlToIR, attributeMap, attributesToProperties, compileOutputs } from '@uniweb/press/ir'
```

The root `@uniweb/press` is now format-agnostic core only — provider, hooks, download utility. IR utilities are one import specifier over. This also unlocks `compileOutputs`, which is what `useDocumentCompile` calls internally and what custom-adapter authors reach for when building a non-docx format — see the [custom adapter guide](./guides/custom-adapter.md).

## Things that didn't change

- **`DocumentProvider` semantics.** Same WeakMap-backed store, same registration-order preservation, same Strict-Mode behavior.
- **`useDocumentOutput` signature.** Still `(block, format, fragment, options?)`. Still a no-op outside a provider. Still idempotent.
- **Builder component JSX shape.** `<Paragraph>`, `<H1>`, `<TextRun>`, `<Image>`, `<Link>`, `<List>` and their array wrappers all render the same HTML with the same `data-*` attributes. Import source changes from `@uniweb/press/react` to `@uniweb/press/docx`; nothing else.
- **The `data-*` attribute vocabulary.** ~30 attributes inherited verbatim from the legacy `@uniwebcms/report-sdk`. No renames, no removals. A component that worked in phase 1 will produce the same IR and the same `.docx` output in phase 1.6.
- **docx adapter output.** Same `docx` library version, same IR → docx mapping, same feature set. The phase-1.6 restructure reorganized where the code lives and how it's reached, not what it produces.

This last point is important: if you're concerned that upgrading will change the appearance of a downloaded `.docx`, it won't. The adapter is byte-identical. The surface around it is what changed.

## See also

- **[Concepts](./concepts.md)** — the full rationale behind the phase 1.6 restructure.
- **[Quick start](./quick-start.md)** — the phase-1.6 hello-world from scratch, to double-check your converted code.
- **[Core API](./api/core.md)** — `DocumentProvider`, `useDocumentOutput`, `useDocumentCompile`, `triggerDownload`.
