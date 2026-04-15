# Writing a custom adapter

How to generate a format Press doesn't ship out of the box. The docx adapter is the reference implementation; this guide walks through a smaller example that turns the IR into Markdown.

## When you actually need a custom adapter

Most foundation work is covered by the built-in docx adapter plus whatever builder components you add. You need a custom adapter when:

- You want to produce a format whose shape doesn't match docx — Markdown, plain text, RTF, a custom XML, a JSON archive.
- You want to reuse Press's registration layer (so sections declare their output via `useDocumentOutput` from inside React) but plug in a different compile back-end.
- You want to produce a format that Press *will* eventually support but doesn't today (e.g., you need xlsx before the built-in adapter lands).

You do **not** need a custom adapter for:

- A new kind of docx content (a new table layout, a citation block, a caption style). Those are new builder components plus any needed `data-*` attribute additions to `src/ir/attributes.js`. See the "adding a builder component" runbook in [`CLAUDE.md`](../../CLAUDE.md).
- A visual variation of an existing docx feature. That's a prop on an existing builder or a new `data-*` attribute.

## Two places a custom adapter can live

Custom adapters come in two flavors:

1. **Application-level.** You're building an app that uses Press and needs to support an extra format. The adapter lives in your own code, not inside Press. You import from `@uniweb/press/ir` to reuse the IR walker and compile helper.
2. **Inside Press.** You're contributing a new built-in format (e.g., the eventual xlsx or pdf adapter). The adapter lives in `src/adapters/` and is reachable only via `useDocumentCompile`'s dynamic import map.

This guide covers the application-level case because the contribution path has additional constraints (no entry in `package.json` exports, entry in the `ADAPTERS` map, etc. — all documented in [`CLAUDE.md`](../../CLAUDE.md)).

## Example: a Markdown adapter

Goal: take the same section components that produce docx and generate a Markdown version of the same content.

### The compile function

Your adapter is a function that takes the output of `compileOutputs(store, 'markdown')` and produces a Blob (or a string, or whatever your app wants). The signature that matches Press's convention is:

```js
async function compileMarkdown(compiledInput, options = {}) {
    // compiledInput shape: { sections: IRNode[][], header, footer }
    const parts = []
    for (const section of compiledInput.sections) {
        parts.push(irToMarkdown(section))
    }
    const text = parts.join('\n\n')
    return new Blob([text], { type: 'text/markdown;charset=utf-8' })
}
```

`compileOutputs(store, 'markdown')` falls through to the HTML-based branch because Markdown isn't the built-in xlsx format. That means it calls `renderToStaticMarkup(fragment)` and `htmlToIR(html)` on each registered JSX fragment, exactly as the docx path does. Your adapter receives a tree of plain IR nodes it can walk into text.

### Walking the IR

The IR is arrays of `{ type, ...props, children? }`. A minimal walker:

```js
function irToMarkdown(nodes) {
    return nodes.map(nodeToMarkdown).join('\n\n')
}

function nodeToMarkdown(node) {
    switch (node.type) {
        case 'paragraph': {
            const text = (node.children || []).map(inlineToMarkdown).join('')
            if (node.heading) {
                const level = headingLevel(node.heading)
                return '#'.repeat(level) + ' ' + text
            }
            if (node.bullet) {
                return '- ' + text
            }
            return text
        }
        case 'text':
            return inlineToMarkdown(node)
        case 'externalHyperlink': {
            const label = (node.children || []).map(inlineToMarkdown).join('')
            return `[${label}](${node.link || ''})`
        }
        case 'image':
            return `![${node.altText || ''}](${node.src || ''})`
        case 'table':
            return tableToMarkdown(node)
        default:
            // Unknown node type — recurse children if any, otherwise drop.
            if (node.children) return irToMarkdown(node.children)
            return ''
    }
}

function inlineToMarkdown(node) {
    if (node.type !== 'text') {
        if (node.children) return node.children.map(inlineToMarkdown).join('')
        return ''
    }
    let text = node.content || ''
    if (node.bold === 'true') text = `**${text}**`
    if (node.italics === 'true') text = `*${text}*`
    return text
}

function headingLevel(v) {
    // IR values come in as strings like 'HEADING_1'
    const match = String(v).match(/HEADING_(\d)/)
    return match ? parseInt(match[1], 10) : 1
}

function tableToMarkdown(node) {
    // Simple implementation: one row per table row, cells joined with |
    const rows = (node.children || []).filter((c) => c.type === 'tableRow')
    return rows
        .map((row) => {
            const cells = (row.children || [])
                .filter((c) => c.type === 'tableCell')
                .map((cell) => {
                    const inner = (cell.children || [])
                        .map(nodeToMarkdown)
                        .join(' ')
                    return inner.replace(/\n+/g, ' ').trim()
                })
            return '| ' + cells.join(' | ') + ' |'
        })
        .join('\n')
}
```

A production-quality adapter would handle nested lists, numbered list items, positional tabs, images with alt text, and the edge cases around empty cells. For a first pass this covers the common shapes.

### Wiring it up in an application

The simplest integration skips `useDocumentCompile` entirely and calls the compile function directly from a component that has access to the document context:

```jsx
import { useContext, useState } from 'react'
import { DocumentProvider } from '@uniweb/press'
// DocumentContext is not a public export, so reach for it via a small
// helper component that captures the store:
import { DocumentContext } from '@uniweb/press/_internal' // not a real import

// In practice, use a helper component to capture the store:
function useDocumentStore() {
    return useContext(DocumentContext)
}

function MarkdownControls() {
    const store = useDocumentStore()
    const [isCompiling, setIsCompiling] = useState(false)

    const handleCopy = async () => {
        setIsCompiling(true)
        try {
            const { compileOutputs } = await import('@uniweb/press/ir')
            const compiled = compileOutputs(store, 'markdown')
            const blob = await compileMarkdown(compiled)
            const text = await blob.text()
            await navigator.clipboard.writeText(text)
        } finally {
            setIsCompiling(false)
        }
    }

    return (
        <button onClick={handleCopy} disabled={isCompiling}>
            Copy as Markdown
        </button>
    )
}
```

`DocumentContext` is not in Press's public exports — this is the one place where an application-level custom adapter has to reach a little deeper. The simplest workaround is a tiny component that subscribes with `useContext(DocumentContext)` imported directly from Press's source. A cleaner approach (and the one contributing a built-in adapter would take) is to add an entry to the `ADAPTERS` map in `src/useDocumentCompile.js` — see the "adding a format adapter" runbook in [`CLAUDE.md`](../../CLAUDE.md).

### Registering under a custom format

Section components that want to contribute to Markdown output register under the `'markdown'` format key:

```jsx
function Cover({ block, content }) {
    const markup = (
        <>
            <H1 data={content.title} />
            <Paragraph data={content.body} />
        </>
    )

    // Register for both the built-in docx path and the custom markdown path.
    // The SAME JSX works for both because htmlToIR doesn't know the difference.
    useDocumentOutput(block, 'docx', markup)
    useDocumentOutput(block, 'markdown', markup)

    return <section>{markup}</section>
}
```

Or, if the markdown version diverges from the docx version:

```jsx
useDocumentOutput(block, 'markdown', (
    <>
        <H1>{content.title}</H1>
        <Paragraph>{content.bodyPlain}</Paragraph>
    </>
))
```

## If the format doesn't fit the IR

Not every format is a tree of paragraphs and text runs. If your target is tabular (xlsx), structured (JSON), or binary, the HTML → IR pipeline may be the wrong shape entirely. In that case:

1. Register sections with plain data objects instead of JSX:

    ```jsx
    useDocumentOutput(block, 'xlsx', {
        title: content.title,
        headers: ['Year', 'Count'],
        data: content.tableRows,
    })
    ```

2. Bypass `compileOutputs` and walk the store yourself:

    ```js
    const outputs = store.getOutputs('xlsx')
    // outputs is an array of { block, fragment, options }, in registration order.
    const sections = outputs.map((o) => o.fragment)
    ```

    Or add a branch to `compileOutputs` in `src/ir/compile.js` (the way the built-in xlsx branch does) if you're contributing the adapter to Press itself.

3. Compile those raw fragments into whatever your format needs.

The IR walker is an optimization for HTML-based formats that benefit from the shared data-attribute vocabulary. If your format doesn't, skip it.

## See also

- **[/ir reference](../api/ir.md)** — `htmlToIR`, `attributeMap`, `compileOutputs` in detail.
- **[`src/adapters/docx.js`](../../src/adapters/docx.js)** — the built-in adapter, ~500 lines, a longer and more complete example of walking the IR into a real document format.
- **[`CLAUDE.md`](../../CLAUDE.md)** — the "adding a format adapter" runbook for contributing an adapter back to Press.
- **[Concepts](../concepts.md)** — why Press doesn't force a single IR across all formats.
