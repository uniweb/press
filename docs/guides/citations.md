# Citations

How to render bibliographies in both the preview and the downloaded `.docx`, using Press for the section structure and [`@citestyle/*`](https://github.com/Uniweb/csl) for the formatting.

## Why Press doesn't ship citation formatting

Three reasons:

1. **Citation formatting needs structural output.** APA, Chicago, Vancouver, and friends don't just insert a name and date — they produce `{ text, html, parts, links }` where each piece is formatted, capitalized, and punctuated according to rules that depend on author count, date presence, container type, publication venue, and a dozen other fields. Template placeholders can't express that.
2. **Citations look different in preview vs. docx.** Preview wants HTML with clickable DOIs and italicized journal titles. Docx wants plain text with positional tabs for hanging indents. They're two representations of the same underlying data — exactly the kind of problem Press's JSX-and-register pattern already solves at the section level.
3. **Tree-shaking wins on the per-style-import model.** Importing `citestyle/styles/apa` directly keeps the foundation bundle small. A Press-level abstraction that wraps every style would force the bundle to pay for styles it doesn't use.

So the Press + citations pattern is: **format at the component level, not inside Press.** Each component that renders a bibliography calls `@citestyle/*` directly, gets back structured output, and uses Press's registration machinery to put the docx version in the compiled document.

## The pattern

```jsx
import { format } from 'citestyle'
import * as apa from 'citestyle/styles/apa'
import { useDocumentOutput } from '@uniweb/press'
import { H2, Paragraphs } from '@uniweb/press/docx'
import { SafeHtml } from '@uniweb/kit'

export default function Publications({ block, content }) {
    const publications = content?.data?.publications || []
    const formatted = publications.map((pub) => format(apa, pub))

    // docx version: plain text per entry
    const docxMarkup = (
        <>
            <H2>Publications</H2>
            <Paragraphs data={formatted.map((entry) => entry.text)} />
        </>
    )
    useDocumentOutput(block, 'docx', docxMarkup)

    // Preview version: HTML with clickable DOIs, italicized journal titles
    return (
        <section>
            <h2>Publications</h2>
            <ol>
                {formatted.map((entry, i) => (
                    <SafeHtml key={i} as="li" value={entry.html} />
                ))}
            </ol>
        </section>
    )
}
```

The same `formatted` array powers both. Preview reads `entry.html` (with markup for links and italics); docx reads `entry.text` (plain text suitable for `<Paragraph>` children). Two representations, one source.

## What the structured output looks like

A `format(style, entry)` call returns roughly:

```ts
{
    text: string          // plain text, suitable for docx
    html: string          // HTML with <em>, <a>, etc., suitable for preview
    parts: {
        authors: string
        year: string
        title: string
        venue: string
        // …etc, per style
    }
    links: Array<{ label, href }>  // DOIs, URLs
}
```

`text` is what you feed to `<Paragraphs>`. `html` is what you feed to `<SafeHtml>` (from `@uniweb/kit`, which renders HTML safely with sanitization). `parts` lets you build richer layouts — e.g., putting the year in a sidebar column — and `links` surfaces clickable references for the preview.

See [`@citestyle/core`](https://github.com/Uniweb/csl/tree/main/citestyle) for the exact shape and per-style variations.

## A richer preview with parts

If you want italicized venues and bolded years in the preview while keeping plain text in the docx, use `parts` instead of `html`:

```jsx
return (
    <section>
        <h2>Publications</h2>
        <ol>
            {formatted.map((entry, i) => (
                <li key={i}>
                    {entry.parts.authors} (<strong>{entry.parts.year}</strong>).{' '}
                    {entry.parts.title}.{' '}
                    <em>{entry.parts.venue}</em>.
                </li>
            ))}
        </ol>
    </section>
)
```

The docx version is unchanged — it still uses `entry.text`, which already includes the correct punctuation. The preview version has finer control because you're composing parts by hand.

## Hanging indents in the docx output

APA and Chicago style want bibliography entries with a hanging indent: the first line flush left, continuation lines indented. The docx adapter supports this through paragraph properties, but the builder API for it is an `indent` data attribute:

```jsx
<Paragraphs
    data={formatted.map((entry) => entry.text)}
    dataProps={{ 'data-indent-hanging': '720', 'data-indent-left': '720' }}
/>
```

Values are in twips (1/20 of a point). 720 twips = 0.5 inch. Applied to every paragraph in the array via `dataProps`.

## Ordered vs. unordered lists

Style-specific: some formats (IEEE, Vancouver) use numbered references; APA and Chicago use alphabetical. Choose the list type at the component level:

```jsx
// Numbered (IEEE)
const docxMarkup = (
    <>
        <H2>References</H2>
        {formatted.map((entry, i) => (
            <Paragraph
                key={i}
                data-numbering-reference="decimal"
                data-numbering-level="0"
                data={entry.text}
            />
        ))}
    </>
)
```

The docx adapter turns the numbering attributes into real numbered list items. The preview uses a plain `<ol>`. Same order, same numbering scheme, both representations correct.

## In-text citations

Press doesn't manage in-text citations (e.g., `(Smith, 2024)` embedded in a paragraph). That's also a component-level concern: you format them with `@citestyle/*` at the point of use, embed them as `<TextRun>` children inside a `<Paragraph>`, and the result lands in both preview and docx automatically.

```jsx
const { intextCitation } = format(apa, pub)  // "(Smith, 2024)"

<Paragraph>
    Prior work {intextCitation} established a baseline for
    this approach.
</Paragraph>
```

There's no cross-reference or numbering scheme to maintain — the citation is a literal string at every point of use. Numbering and ordering happen *once*, in the bibliography component, via `format(style, entry)`.

## Caching formatted results

If the same publication list is rendered in multiple components (in-text citations in the body and a full bibliography at the end), call `format` once per entry and pass the results down as props. Don't re-format on every render — it's cheap but not free, and components that re-render often will pay the cost unnecessarily.

```jsx
function Report({ publications }) {
    const formatted = useMemo(
        () => publications.map((pub) => format(apa, pub)),
        [publications],
    )

    return (
        <DocumentProvider>
            <Body formatted={formatted} />
            <Bibliography formatted={formatted} />
        </DocumentProvider>
    )
}
```

## See also

- **[`@citestyle/core`](https://github.com/Uniweb/csl)** — the upstream library. Browse the style list, the `format` signature, and the per-style output shapes.
- **[/docx reference](../api/docx.md)** — `<Paragraphs>` and `dataProps`, used for bulk-applying indent attributes.
- **[`@uniweb/kit`'s `<SafeHtml>`](https://github.com/uniweb/kit)** — safe HTML rendering for the preview side.
- **[Concepts](../concepts.md) — "What Press deliberately doesn't do"** — the rationale for keeping citations out of Press.
