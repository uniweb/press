# `@uniweb/press/docx` — builder components

React components for describing document content. They emit ordinary JSX with `data-*` attributes that encode docx-specific concerns (heading levels, borders, spacing, image transforms, hyperlinks). The same JSX renders as the browser preview and is walked to produce the downloaded `.docx` file.

```js
import {
    Paragraph,
    Paragraphs,
    TextRun,
    H1, H2, H3, H4,
    Image, Images,
    Link, Links,
    List, Lists,
} from '@uniweb/press/docx'
```

Importing from `@uniweb/press/docx` does **not** pull the ~3.4 MB `docx` library into your bundle. That library lives in the format adapter and is loaded dynamically the first time `compile('docx')` runs.

## `<Paragraph>` and `<Paragraphs>`

The most common builder. Renders a block-level text container.

```jsx
<Paragraph>Plain text with no marks.</Paragraph>

<Paragraph data="Awarded in <strong>2004</strong> with <em>honors</em>." />

<Paragraph as="div">
    Use the <code>as</code> prop to change the rendered HTML element.
</Paragraph>
```

Props:

- **`data`** — optional string. If present, the string is parsed for inline marks (`<strong>`, `<b>`, `<em>`, `<i>`, `<u>`, `<sub>`, `<sup>`) and rendered as a sequence of styled `<TextRun>` children. If absent, the component renders `children` directly.
- **`as`** — optional tag name (default `'p'`). Use `as="div"` when you want an HTML block that isn't a `<p>` — most commonly inside the table pattern below.
- **`children`** — used when `data` is not provided.
- **`...rest`** — any extra `data-*` attribute is forwarded to the rendered element and picked up by the IR walker. This is how you express layout, spacing, borders, bullets, and numbering:

```jsx
<Paragraph data-spacing-before="200" data-spacing-after="100">
    Paragraph with 200/100 twip spacing around it.
</Paragraph>

<Paragraph data-bullet-level="0">Bullet list item at level 0.</Paragraph>

<Paragraph
    data-numbering-reference="decimal"
    data-numbering-level="0"
>
    Numbered list item.
</Paragraph>
```

### `<Paragraphs>`

Renders an array of paragraph strings. A convenience wrapper when you have pre-parsed content:

```jsx
<Paragraphs data={['First paragraph.', 'Second <strong>paragraph</strong>.']} />

// Forward extra props to every child via dataProps:
<Paragraphs
    data={content.paragraphs}
    dataProps={{ 'data-spacing-after': '100' }}
/>
```

## `<TextRun>`

Inline styled text span. Maps to a docx `TextRun`.

```jsx
<Paragraph>
    Awarded in <TextRun bold>2004</TextRun>,
    <TextRun italics>summa cum laude</TextRun>, with distinction.
</Paragraph>
```

Props:

Run formatting — all booleans, each setting the matching `data-*` attribute:

- **`bold`** — sets `data-bold="true"`.
- **`italics`** — sets `data-italics="true"`.
- **`underline`** — sets `data-underline="true"`.
- **`strike`** — sets `data-strike="true"`. Emits `<w:strike/>`.
- **`smallCaps`** — sets `data-smallcaps="true"`. Emits `<w:smallCaps/>`.
- **`allCaps`** — sets `data-allcaps="true"`. Emits `<w:caps/>`.
- **`subscript`** / **`superscript`** — set `data-subscript` / `data-superscript`. Emit `<w:vertAlign w:val="subscript"/>` / `"superscript"`. The two are mutually exclusive, since a run has one vertical alignment; if both are set, `subscript` wins.

Direct formatting. Prefer a `role` (below) when you'd describe the text as *being* something — a label, a title. Reach for these when the value is one-off or computed; see [the named-styles note](../architecture/word-styles-decision.md) for where the boundary sits.

- **`color`** — hex, with or without a leading `#`, or a theme key (`'accent'`, `'body'`, `'muted'`, `'softBorder'`). Theme keys resolve against the active `<DocumentProvider theme={…}>`; literals pass through with any `#` stripped.
- **`size`** — font size in **half-points**, so 28pt is `56`. `convertPointsToHalfPoints` (exported from `@uniweb/press/docx`) keeps that doubling visible at the call site.
- **`font`** — family name (`'Calibri'`) or a theme key (`'body'`, `'heading'`, `'mono'`).

Everything else:

- **`role`** — references a named OOXML character style, e.g. `role="Label"`. See [Typography roles](./typography-roles.md); inline props above override it.
- **`style`** — string style id, e.g. `"Hyperlink"` for clickable link styling. Takes precedence over `role`.
- **`children`** — text content.
- **`...rest`** — forwarded as `data-*` attributes. Used for positional tabs:

```jsx
<TextRun data-positionaltab-alignment="right" data-positionaltab-leader="dot">
    page 3
</TextRun>
```

## `<H1>`, `<H2>`, `<H3>`, `<H4>`

Heading components. Each renders the corresponding `<h1>`–`<h4>` with `data-heading="HEADING_N"`.

```jsx
<H1>Annual Report</H1>
<H2>Executive summary</H2>
<H3>Methodology</H3>

// data prop for inline marks, same as <Paragraph>:
<H1 data="Fiscal <strong>2025</strong> results" />

// Extra data-* props pass through:
<H1 data-spacing-after="200">Title with explicit spacing</H1>
```

There are deliberately no `<H5>` / `<H6>`. Add them if you need them — see [the package's CLAUDE.md](../../CLAUDE.md) for the "adding a builder component" runbook.

## `<Image>` and `<Images>`

Renders an image reference that the docx adapter fetches asynchronously during compile.

```jsx
<Image data={{ url: '/cover.png', alt: 'Cover image' }} width={400} height={300} />

// Bare URL string also works:
<Image data="/cover.png" />

// Array convenience wrapper:
<Images
    data={[
        { url: '/fig1.png', alt: 'Figure 1' },
        { url: '/fig2.png', alt: 'Figure 2' },
    ]}
/>
```

Props:

- **`data`** — either a `{ value | url, alt? }` object or a plain URL string. Returns `null` when `data` is missing or the URL is empty.
- **`width`** — image width in docx units (default `400`).
- **`height`** — image height in docx units (default `300`).

The browser preview renders a regular `<img src=…>`. The docx adapter reads `data-src`, `data-transformation-width`, `data-transformation-height`, and `data-alttext-description` from the rendered HTML, fetches the image bytes asynchronously via `fetch(url).arrayBuffer()`, and embeds them in the document.

## `<Link>` and `<Links>`

Hyperlink component with automatic external/internal detection.

```jsx
// External: href starts with "http"
<Link data={{ label: 'Research Office', href: 'https://example.edu' }} />

// Internal: href is an in-document anchor
<Link data={{ label: 'See Section 3', href: '#section-3' }} />

// Bare string shortcut — label and href are the same
<Link data="https://example.edu" />

// Array wrapper
<Links
    data={[
        { label: 'Home', href: 'https://example.edu' },
        { label: 'Contact', href: 'https://example.edu/contact' },
    ]}
/>
```

The component renders an `<a>` with `data-type="externalHyperlink"` or `data-type="internalHyperlink"` plus a nested `<span data-type="text" data-style="Hyperlink">` for the label. The docx adapter emits an `ExternalHyperlink` or `InternalHyperlink` with a styled `TextRun` child.

**An in-document link needs a target, and it resolves by name.** Word matches `<w:hyperlink w:anchor="x">` against `<w:bookmarkStart w:name="x"/>`, so the link only works if some paragraph carries the matching bookmark:

```jsx
<Link data={{ label: 'See Section 3', href: '#section-3' }} />   // the link
<Paragraph data-bookmark="section-3">Section 3</Paragraph>       // the target
```

Write the href either way — `#section-3` or `section-3`. The leading `#` is the HTML spelling and is dropped before it reaches the anchor; the bookmark name never carries one. A link with no matching bookmark compiles cleanly and simply doesn't navigate, so it is worth checking the pair exists.

The same applies inside a `data` string: `<a href="#section-3">…</a>` becomes an in-document anchor, while anything else — including a URL that merely carries a fragment, like `https://example.edu/report#part-2` — stays an external link.

## `<List>` and `<Lists>`

Nested bullet lists. Each list item can carry paragraphs, images, links, and child lists.

```jsx
<List
    data={[
        { paragraphs: ['First item'] },
        {
            paragraphs: ['Second item, with a sublist below'],
            lists: [
                [
                    { paragraphs: ['Nested item A'] },
                    { paragraphs: ['Nested item B'] },
                ],
            ],
        },
    ]}
/>

// Array wrapper
<Lists data={[list1, list2]} />
```

Each item shape:

```ts
{
    paragraphs?: string[]
    links?: Array<{ label, href }>
    imgs?: Array<{ url, alt }>     // or `images`, both accepted
    lists?: Array<ListItem[]>      // nested sub-lists
}
```

Indentation is visual-only in the preview. The docx adapter applies `data-bullet-level` to each paragraph so the generated docx has proper bullet nesting.

## Tables via `<Paragraph as="div">`

Tables are not their own component. They're expressed through nested `<Paragraph as="div">` elements with `data-type` attributes — a deliberate choice that keeps the builder component surface small while still supporting the full table model the docx library offers.

```jsx
<Paragraph as="div" data-type="table">
    <Paragraph as="div" data-type="tableRow">
        <Paragraph
            as="div"
            data-type="tableCell"
            data-width-size="40"
            data-width-type="pct"
            data-borders-bottom-style="single"
            data-borders-bottom-size="4"
            data-borders-bottom-color="000000"
        >
            <Paragraph>
                <TextRun bold>Source</TextRun>
            </Paragraph>
        </Paragraph>
        <Paragraph
            as="div"
            data-type="tableCell"
            data-width-size="60"
            data-width-type="pct"
        >
            <Paragraph>
                <TextRun bold>Amount</TextRun>
            </Paragraph>
        </Paragraph>
    </Paragraph>
    {/* ... more rows ... */}
</Paragraph>
```

Supported data attributes inside a cell include `data-width-size` / `data-width-type` (DXA, percentage, auto, nil), `data-margins-top`/`data-margins-bottom`/`data-margins-left`/`data-margins-right`, and per-side borders via `data-borders-{side}-{style|size|color}`. See `src/ir/attributes.js` in the source tree for the exhaustive `attributeMap`.

## Special text nodes

Two strings carry special meaning in text content: `_currentPage` and `_totalPages`. The docx adapter replaces them with docx page-number fields. Use them inside a `TextRun`:

```jsx
<Paragraph>
    Page <TextRun>_currentPage</TextRun> of <TextRun>_totalPages</TextRun>
</Paragraph>
```

Typically used inside header or footer registrations:

```jsx
useDocumentOutput(block, 'docx', (
    <Paragraph>
        Page <TextRun>_currentPage</TextRun>
    </Paragraph>
), { role: 'footer' })
```

## Compile options

`compile('docx', options)` forwards most keys straight to the docx library's `Document` constructor — `title`, `subject`, `creator`, `description`, `keywords`, etc. A handful are consumed by the adapter itself:

- **`paragraphStyles`** — `Array<ParagraphStyle>` — named styles paragraphs can reference via `data-style="…"`. Wrapped into `new Document({ styles: { paragraphStyles } })`. See the [style-pack guide](../guides/style-pack.md) for recipes.
- **`numbering`** — `Array<NumberingConfig>` — numbering definitions paragraphs can reference via `data-numbering-reference="…"`. Wrapped into `new Document({ numbering: { config } })`.
- **`pageMargin`** — `Object` — page margin overrides merged into the section's `properties.page.margin`. Shape matches the docx library's `IPageMarginAttributes`. All keys are twips (1 inch = 1440): `top`, `right`, `bottom`, `left`, `header`, `footer`, `gutter`, `mirror`. Omit to keep the library's defaults.

The `header` and `footer` keys inside `pageMargin` define the **carrier-paragraph slot** used by registered headers/footers. Both must be non-zero (Word's default is 720 twips / 0.5 inch) or a floating image anchored inside that slot may be dropped when Word lays out the page.

```js
await compile('docx', {
    title: 'Annual Report',
    pageMargin: {
        top: 1800,    // 1.25" — clears a 1.17" banner image on page 1
        bottom: 1584, // 1.10" — clears a 0.57" footer strip
        left: 1440,   // 1.00"
        right: 1440,  // 1.00"
        header: 720,  // 0.50" carrier-paragraph slot
        footer: 720,  // 0.50" carrier-paragraph slot
    },
})
```

## Stage 6 builders — typography, page chrome, brand

The builders below were added in Stage 6 of the press-professional-docx work. Each gets its own dedicated reference; this section is a pointer with the one-line summary so the API barrel reads cleanly.

### `<Paragraph role="…">` and `<TextRun role="…">`

Reference an OOXML named style by role name. At compile time the role resolves to a Word style (`<w:pStyle>` / `<w:rStyle>`) the recipient can edit from Word's Styles pane. Built-in roles: `Title`, `Heading1`-`Heading3`, `Body`, `Display`, `BodyStrong`, `Label`, `Caption`, `TableHeader`, `TotalLine`. Foundations extend the registry per institution.

```jsx
<Paragraph role="Title"><TextRun>Annual Activity Report</TextRun></Paragraph>
<TextRun role="Label">DEPARTMENT</TextRun>
<TextRun role="Display">42</TextRun>
```

Full reference: **[Typography roles](./typography-roles.md)**.

### `<PageHeader>`, `<PageFooter>`, `<PageNumber/>`, `<TotalPages/>`

Page chrome builders. `<PageHeader>` and `<PageFooter>` are layout-transparent — they're React fragments that signal intent. The actual routing happens via the role tag in `useDocumentOutput`'s options:

```jsx
useDocumentOutput(block, 'docx', <PageHeader>{logo}</PageHeader>, { role: 'header' })
useDocumentOutput(block, 'docx', <PageFooter>{footerJsx}</PageFooter>, { role: 'footer' })
```

`<PageNumber/>` and `<TotalPages/>` emit Word field codes (`PAGE` / `NUMPAGES`) that Word evaluates on print/preview.

For different-first-page chrome, register the first-page variant with `applyTo: 'first'`.

### `<BrandLogo>`

A right-aligned brand image with sensible defaults for placing a logo in a page header or cover block:

```jsx
<BrandLogo url={institution.logo} width={cm(4)} align="right" />
```

Emits a bare `<img data-type="image" data-alignment="…">` (NOT wrapped in a Paragraph — see the cookbook's "Images dropped from the output" section for why). The adapter wraps in a paragraph with the right alignment when emitting the ImageRun.

### `pageSizes` presets

Common paper sizes in twips, ready to spread into `pageSize`:

```js
pageSizes.A4      // { width: 11906, height: 16838 } — 21.0 × 29.7 cm
pageSizes.A5      // 14.8 × 21.0 cm
pageSizes.A3      // 29.7 × 42.0 cm
pageSizes.LETTER  // 8.5 × 11 in
pageSizes.LEGAL   // 8.5 × 14 in
pageSizes.TABLOID // 11 × 17 in
```

### Unit helpers

```js
cm(2)   // → twips for 2 cm
mm(20)  // → twips for 20 mm
inch(1) // → twips for 1 inch
pt(11)  // → twips for 11 pt
```

Use these in `columnWidths`, `pageMargin`, `tabStops`, and anywhere docx expects twips.

### Paragraph polish props (`tabStops`, `indent`, `<Tab/>`)

```jsx
<Paragraph
    tabStops={[
        { position: cm(8), type: 'center' },
        { position: cm(16), type: 'right', leader: 'dot' },
    ]}
    indent={{ left: cm(2), firstLine: cm(1), hanging: cm(0.5) }}
>
    Left text<Tab/>centered<Tab/>right text
</Paragraph>
```

`<Tab/>` is the JSX-friendly alternative to writing `{'\t'}` literally (which React's whitespace handling can swallow). The paragraph's tab stops align text on each tab.

## See also

- **[docx cookbook](../guides/docx-foundation-cookbook.md)** — task-oriented walkthrough for foundation authors building real documents.
- **[/format reference](./format.md)** — date / range / currency builders.
- **[Typography roles reference](./typography-roles.md)** — the role catalog, OOXML routing, override mechanisms.
- **[Architecture: Word styles decision](../architecture/word-styles-decision.md)** — why typography routes through OOXML named styles instead of inline formatting.
- **[/sections reference](./sections.md)** — `Section` and `StandardSection` remove the register-and-render boilerplate around these builders.
- **[/ir reference](./ir.md)** — the `attributeMap` that defines which `data-*` attributes the IR walker recognizes.
- **[Multi-block reports guide](../guides/multi-block-reports.md)** — how multiple sections compose into one document.
- **[Concepts](../concepts.md)** — why builders use `data-*` attributes instead of a typed React prop surface.
- **[AI prompt](../ai-prompt.md)** — self-contained prompt for asking Claude / another LLM for Press JSX.
