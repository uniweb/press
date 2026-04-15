# `@uniweb/press/ir` — IR layer

The intermediate representation between registered JSX and format adapters. Exposed for authors writing their own format adapters — typical foundation code never imports from here.

```js
import {
    htmlToIR,
    attributesToProperties,
    attributeMap,
    compileOutputs,
} from '@uniweb/press/ir'
```

## When to read this document

You are probably **not** the target audience if:

- You're building a Uniweb foundation that outputs `.docx` files.
- You're adding a new builder component to the existing docx pipeline.

You **are** the target audience if:

- You want to generate a format the built-in `docx` adapter doesn't cover (`rtf`, `markdown`, a custom XML format, …).
- You want to reuse Press's registration layer and the HTML → IR walker, but produce your own output from the resulting IR.
- You're reading the source of `src/adapters/docx.js` and wondering what input shape it expects.

## The IR shape

The IR is a plain JavaScript tree — arrays of nodes, where each node is `{ type, ...properties, children? }`. A simple paragraph looks like:

```js
{
    type: 'paragraph',
    children: [
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'World', bold: 'true' },
    ],
}
```

A few notes on the shape:

- **`type`** comes from a `data-type="..."` attribute in the rendered HTML. The built-in builder components set `data-type` on their outermost element, so `<Paragraph>` becomes `type: 'paragraph'`, `<TextRun>` becomes `type: 'text'`, etc.
- **Properties** (`bold`, `italics`, `heading`, `spacing`, `bullet`, `width`, `borders`, …) come from `data-*` attributes, parsed through `attributeMap` (see below).
- **`children`** is an array of IR nodes. Present for paragraph-like and container nodes; absent for leaf text nodes that carry their content in a `content` string.
- **Strings like `'true'`, `'400'`, `'HEADING_1'`** are kept as strings at the IR level. Adapters are expected to parse them (`toInt`, `toHeadingLevel`, etc.) as needed. This keeps the IR format-neutral — a numeric cast that's correct for docx isn't necessarily correct for every future format.

Recognised node types include `paragraph`, `text`, `table`, `tableRow`, `tableCell`, `externalHyperlink`, `internalHyperlink`, `image`, and any custom type you set via `data-type`. Unknown types pass through the walker unchanged, so the IR layer doesn't need to know about every future builder.

## `htmlToIR(html)`

Parse an HTML string into an IR tree.

```js
import { htmlToIR } from '@uniweb/press/ir'

const html = '<p data-type="paragraph"><span data-type="text">Hello</span></p>'
const ir = htmlToIR(html)
// → [{ type: 'paragraph', children: [{ type: 'text', content: 'Hello' }] }]
```

Returns an array of root-level IR nodes. Uses [`parse5`](https://parse5.js.org/) under the hood so it runs in Node and is unit-testable without jsdom.

Internally, `htmlToIR` walks the parse5 DOM, reads `data-type` to determine the node type, passes the element's attributes through `attributesToProperties`, and recurses into children. Elements without a `data-type` become generic containers (type matching the tag name) that pass children through unchanged — useful for structural wrappers like `<section>` that you don't want in the IR.

## `attributesToProperties(attrs)` and `attributeMap`

Translate parse5 attribute lists into IR properties according to a declarative mapping.

```js
import { attributesToProperties, attributeMap } from '@uniweb/press/ir'

const attrs = [
    { name: 'data-heading', value: 'HEADING_1' },
    { name: 'data-spacing-before', value: '200' },
]
const props = attributesToProperties(attrs, attributeMap)
// → { heading: 'HEADING_1', spacing: { before: '200' } }
```

`attributeMap` is the exhaustive list of `data-*` attributes the IR layer recognizes. It handles:

- **Scalar attributes** — `data-heading`, `data-bold`, `data-italics`, `data-underline`, `data-style`, …
- **Nested attributes** — `data-spacing-before`, `data-spacing-after` map to `{ spacing: { before, after } }`; similarly for `bullet`, `numbering`, `width`, `margins`, `positionaltab`, `transformation`.
- **Per-side attributes** — `data-borders-top-style`, `data-borders-left-color`, etc. map to `{ borders: { top: { style }, left: { color } } }`.
- **Floating-image positioning** — `data-floating-horizontal-align`, `data-floating-horizontal-offset-value`, etc.

Custom adapters can extend the map by importing it and adding entries before calling `htmlToIR`, or by post-processing the IR themselves after calling the default walker. For a new builder component that introduces new data attributes, extend `attributeMap` in `src/ir/attributes.js` so the walker picks up the keys — see the "adding a builder component" runbook in the package's `CLAUDE.md`.

## `compileOutputs(store, format)`

Walks a registration store and produces the adapter input shape for the given format. This is the function `useDocumentCompile` calls internally before dynamic-importing an adapter.

```js
import { compileOutputs } from '@uniweb/press/ir'

const input = compileOutputs(store, 'docx')
// → { sections: IRNode[][], header: IRNode[]|null, footer: IRNode[]|null }
```

For HTML-based formats (`docx`, and any custom format that goes through the IR walker):

```ts
{
    sections: IRNode[][]      // one IR tree per registered body fragment, in order
    header:   IRNode[] | null // merged IR tree from header registrations (last wins)
    footer:   IRNode[] | null // merged IR tree from footer registrations (last wins)
}
```

For `xlsx` (the built-in xlsx branch, even though no xlsx adapter ships yet):

```ts
{
    sections: Array<{ title, headers, data }>  // registered data objects, in order
}
```

Any other format value falls through to the HTML-based branch. If you need a format-specific shape, either extend `compileOutputs` itself (by contributing to `src/ir/compile.js`) or call `store.getOutputs(format)` directly and do your own compilation — the `store` in context is documented in the [core API reference](./core.md).

Arguments:

- **`store`** — the registration store from `DocumentContext`. Typically obtained via `useContext(DocumentContext)` inside a component that needs to trigger compilation.
- **`format`** — the format identifier passed to `useDocumentOutput`.

Returns the adapter input object. Does not fetch, transform, or bundle an adapter — the caller is responsible for handing the result to a compile function.

## Writing a custom adapter

The [custom adapter guide](../guides/custom-adapter.md) walks through a full end-to-end example. The short version:

1. Create `compileMyFormat(compiledInput, documentOptions) → Promise<Blob>` — reads the IR (or whatever shape `compileOutputs` produced for your format), produces your output.
2. Make sure the function is reachable via a dynamic import so large dependencies stay out of the main bundle.
3. Hook it into `useDocumentCompile` (for applications that embed Press) or call it directly (for build-time use).

The IR layer is format-neutral: it exposes the walker and the compile helper, and intentionally does not know what "a document" means. Adapters own that.

## See also

- **[Custom adapter guide](../guides/custom-adapter.md)** — a worked example: writing an adapter that turns the IR into Markdown.
- **[Core API](./core.md)** — `DocumentContext` and the provider's `getOutputs` method, which `compileOutputs` calls.
- **[Concepts](../concepts.md)** — why Press doesn't force a single IR across all formats.
- **The source of truth:** `src/ir/parser.js`, `src/ir/attributes.js`, and `src/ir/compile.js`. The IR is simple enough that the code is the authoritative reference for the edge cases.
