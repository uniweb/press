# Style pack — paragraph styles and numbering for common bibliography patterns

A copy-paste reference for foundations that want to produce properly-styled bibliography entries in the downloaded `.docx`. The definitions here match what the legacy `@uniwebcms/report-sdk` foundations expected, and what the modern [`citestyle`](https://www.npmjs.com/package/citestyle) package pairs naturally with.

This is **not** a Press feature — it's a set of recipes you paste into your foundation's download controls. Press ships the plumbing (the `paragraphStyles` and `numbering` options on `compile('docx', options)`) and leaves the definitions to the foundation so every docusite can pick its own vocabulary without Press taking a side.

## Why you need this

Press's docx builders let you write `<Paragraph data-style="bibliography">Entry text…</Paragraph>` and the style name (`"bibliography"`) flows through the compile pipeline to Word — but Word looks the name up in the document's style table, and **Press's `compile()` does not ship any named styles by default.** Without a matching `paragraphStyles` definition, Word falls back to its generic "Normal" style and the intended hanging indent disappears.

The fix is one extra key on the `compile()` options bag. Press passes it straight through to the docx library's `Document` constructor, where it becomes a real style definition that Word honours.

## The shape

Both `paragraphStyles` and `numbering` are arrays. Their item shapes match the [docx library's interfaces](https://docx.js.org/#/) for `ParagraphStyle` and `NumberingConfig`.

```js
const { compile } = useDocumentCompile()

await compile('docx', {
    title: 'Annual Report',
    creator: 'Dr. Jane Example',
    paragraphStyles: [ /* ... */ ],
    numbering: [ /* ... */ ],
})
```

Press validates that these are non-empty arrays and wraps them in the right top-level keys (`styles: { paragraphStyles }` and `numbering: { config }`) before calling `new Document(...)`. If you pass an empty array or omit the key entirely, Press behaves as if it were never set.

## Recipe 1 — hanging indent for author-date bibliographies

For APA, MLA, Chicago (author-date), Harvard, and any style that renders a flat alphabetically-sorted list with each entry flush-left on the first line and indented on continuation lines.

```js
import { convertPointsToHalfPoints } from '@uniweb/press/docx'

const HALF_INCH = 720 // twips; 720 = 0.5 inch

export const paragraphStyles = [
    {
        id: 'bibliography',
        name: 'Bibliography',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: {
            size: convertPointsToHalfPoints(11),
        },
        paragraph: {
            indent: {
                left: HALF_INCH,
                hanging: HALF_INCH,
            },
            spacing: {
                before: 0,
                after: 120, // 6 pt after each entry
            },
        },
    },
]
```

Section components reference this style by its `id`:

```jsx
import { Paragraph } from '@uniweb/press/docx'

function Bibliography({ entries }) {
    return (
        <>
            {entries.map((entry) => (
                <Paragraph
                    key={entry.id}
                    data={entry.text}
                    data-style="bibliography"
                />
            ))}
        </>
    )
}
```

`entry.text` is what `citestyle`'s `formatAll(style, items)` returns per entry. The same `entries` array also has `.html` (for the web preview) and `.parts` (for rich layouts).

## Recipe 2 — numbered list for IEEE / Vancouver / numeric styles

For styles that number each entry (`1. Smith, J. (2024). …`) and use the hanging indent to align continuation lines under the start of the title text.

```js
export const numbering = [
    {
        reference: 'biblio-numbering',
        levels: [
            {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: 'start',
                style: {
                    paragraph: {
                        indent: {
                            left: 720,
                            hanging: 720,
                        },
                    },
                },
            },
        ],
    },
]
```

Section components reference this numbering by its `reference` key:

```jsx
<Paragraph
    data={entry.text}
    data-numbering-reference="biblio-numbering"
    data-numbering-level="0"
/>
```

The docx adapter translates the three `data-numbering-*` attributes into a `numbering: { reference, level }` options block on the docx `Paragraph`, which Word resolves against the `config` you supplied.

Do **not** combine `data-style="bibliography"` and `data-numbering-reference="…"` on the same paragraph — the numbering config already carries its own paragraph indentation, and two overlapping indent specs fight each other in Word.

## Putting both together

The typical docusite ships both styles from one module so downloads work regardless of which citation style the user has selected:

```js
// foundation/src/components/docx-style-pack.js
import { convertPointsToHalfPoints } from '@uniweb/press/docx'

const HALF_INCH = 720

export const paragraphStyles = [
    {
        id: 'bibliography',
        name: 'Bibliography',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: convertPointsToHalfPoints(11) },
        paragraph: {
            indent: { left: HALF_INCH, hanging: HALF_INCH },
            spacing: { before: 0, after: 120 },
        },
    },
]

export const numbering = [
    {
        reference: 'biblio-numbering',
        levels: [
            {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: 'start',
                style: {
                    paragraph: {
                        indent: { left: HALF_INCH, hanging: HALF_INCH },
                    },
                },
            },
        ],
    },
]

export const stylePack = { paragraphStyles, numbering }
```

And in the layout that drives the download:

```jsx
import { stylePack } from '#components/docx-style-pack.js'

async function handleDownload() {
    const blob = await compile('docx', {
        title: 'Annual Report',
        creator: 'Dr. Jane Example',
        ...stylePack,
    })
    triggerDownload(blob, 'annual-report.docx')
}
```

The section component then picks the right reference per entry based on which citation style the user selected. For APA/MLA/Chicago, it uses `data-style="bibliography"`; for IEEE/Vancouver, `data-numbering-reference="biblio-numbering"`.

## Growing the pack

Add new styles by extending the `paragraphStyles` array. Common candidates for docusite foundations:

- **`groupTitle`** — bold, small-caps, left-indented heading for subsection labels in grouped lists (matches the legacy `data-style='groupTitle'` convention).
- **`groupItems`** — deeper left indent, regular weight, for the entries under a `groupTitle`.
- **`leftIndentation`** — generic left-indented paragraph for asides and long quotations.
- **`coverTitle`** — larger run size and extra spacing-after, used on a docusite's title page.

Each is three or four lines of style definition in the same shape as `bibliography`. Ship them as part of the foundation's style pack; they flow into `compile()` the same way.

## See also

- **[Core API — `useDocumentCompile`](../api/core.md#usedocumentcompile)** — how the options bag reaches the adapter.
- **[/docx reference — unit helpers](../api/docx.md#unit-helpers)** — `convertPointsToHalfPoints`, `convertMillimetersToTwip`, and friends used when writing style definitions.
- **[The docx library's `ParagraphStyle` and `NumberingConfig` interfaces](https://docx.js.org/#/usage/styling-with-js)** — the authoritative shape reference. Everything under `paragraphStyles[*]` and `numbering[*]` passes through unchanged.
- **[`citestyle` on npm](https://www.npmjs.com/package/citestyle)** — the modern structured-output citation formatter that produces the `{ html, text, parts, links }` shape you render alongside the styles here. See Press's [citations guide](./citations.md) for the full pattern.
