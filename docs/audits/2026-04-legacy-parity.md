# Legacy parity audit — 2026-04

**Status:** partial (static analysis complete, runtime XML diff pending).
**Author:** Claude (R5 research step).
**Last updated:** 2026-04-15.
**Scope:** `@uniweb/press` versus the legacy `@uniwebcms/report-sdk` + `DocumentGenerator` pipeline, measured against three production foundations.

R5 of the phase-1.6 restructure plan (`../design/restructure-2026-04.md` §5 R5) asks: "how good is Press vs. the legacy?" This document is the first pass at a concrete answer. It is deliberately split into a **static** pass (this file, committed now) and a **runtime** pass (deferred) so the static findings can drive discussion and adapter changes before anyone sets up a legacy build environment.

The static pass identifies three real gaps and two decisions the user needs to make before Press can fully replace the legacy foundations.

## Method

The plan's audit method is:

1. Pick the primary docx reference (richest of the three).
2. Port it mechanically to `@uniweb/press` + `@uniweb/press/docx`.
3. Produce legacy output `.docx` by running the original in its original environment.
4. Diff the two `.docx` files at the XML level.
5. Classify every discrepancy.
6. Repeat.

Steps 1, 2, and 5 are doable from source alone. Steps 3 and 4 require a running legacy environment: webpack module-federation remotes loading `@uniwebcms/report-sdk@1.3.4`, a Uniweb platform that can invoke `PrinterCore.getPageReport()`, and a test harness for each foundation. That environment is not currently set up on this machine, and setting it up is its own multi-day project. Rather than block R5 indefinitely on environment work, this audit does steps 1, 2, and 5 from source — and flags the runtime-dependent findings so they can be re-verified later.

The static pass is still useful because most legacy features map to **code that produces specific XML elements** in Press's adapter. If Press's adapter contains no code for a feature, an XML diff would show that same gap — static analysis just finds it earlier.

**What this audit covers:**

- The full attribute vocabulary used by the three reference foundations, cross-referenced against `src/ir/attributes.js`.
- The full component API surface used (imports, props, patterns), cross-referenced against `src/docx/` and `src/adapters/docx.js`.
- One mechanical port (UNB/ResearchFunding) written out as a code listing, to validate the translation pattern end to end.
- The xlsx registration-side shape from the `innovation-modules/Publications` reference, as scoping data for phase 2.

**What this audit does NOT cover:**

- Binary docx output comparison. Needs a running legacy.
- Paragraph-level layout rendering ("does this produce a visually-correct two-column layout?"). Depends on the `format` prop decision below.
- Citation formatting (`citation-js` replaced by `@citestyle` in the modern stack — that migration is tracked separately).

## Reference foundation catalog

Three production foundations were walked, covering 9 docx-producing components + 2 xlsx-producing components.

### `~/Uniweb/workspace/.assets/report-system/report-modules/`

Faculty reporting foundations for three universities (UNB, SMU, UOTTAWA). Built as webpack module-federation remotes that load `@uniwebcms/report-sdk@1.3.4`.

| Component | Lines | Role | Notes |
|---|---|---|---|
| **UNB/DynamicSection** | 269 | Primary rich example. Exercises 8 legacy `format` modes: `two-level-indentation`, `two-column-layout`, `two-column-layout-wide`, `two-column-layout-justified`, `ordered-list`, `unordered-list`, `left-indentation`, `group-items`. Uses H1–H4, Paragraphs, Images, Links, Lists, TextRun, emptyLine. Numbering references (`numbering`, `en-dash`), `data-style` on Paragraphs. | **Unmigrable to Press today** — the `format` prop has no equivalent. |
| **UNB/ResearchFunding** | 109 | Cleanest table example. Nested `<div data-type='table'/tableRow/tableCell>` with `data-width-size`, `data-width-type='pct'`, `data-margins-*`, `data-borders-*-{style,size,color}`. Uses `convertMillimetersToTwip`, `makeCurrency`, `makeRange`, `makeParentheses`, `join` from the legacy sdk. | Portable to Press with minor helper inlining. See "Mechanical port" below. |
| **UNB/Citation** | 245 | CSL bibliography via `useEffect` + `MutationObserver` + `SafeHtml`. Numbered list via `data-numbering-reference='numbering'` in ascending sort, descending via `format={{ mode: 'ordered-list-reversed', numberingNumber }}`. | Partial — the ascending branch uses only known attributes; the descending branch requires the `format` prop. |
| **UNB/Header** | 54 | Positional tab alignment with page-number fields (`_currentPage`/`_totalPages`), `website.localize()` for labels, `firstPageOnly` metadata via `block.output.docx = { firstPageOnly, docx }`. | Portable. Press's `{ role: 'header', applyTo: 'first' }` maps directly. |
| **UNB/Section** | 55 | Baseline generic renderer — `H1`–`H4`, `Paragraphs`, `Images`, `Links`, `Lists` from `parseBlockContent(block)`. Renders child blocks via `block.getChildBlockRenderer()`. | Portable. Equivalent to Press `StandardSection` + `ChildBlocks` pattern. |
| **SMU/Section** | 55 | Near-duplicate of UNB/Section with `title` instead of `pretitle` at the top. | Portable. |
| **SMU/DynamicSection** | 142 | Subset of UNB/DynamicSection patterns. Same `format` prop dependency. | **Unmigrable** for the same reason. |
| **SMU/Citation** | ~245 | Structurally identical to UNB/Citation. | Same partial status. |
| **SMU/Submission** | 128 | Runtime-instantiated recipient data from `website.outputParams`, `data-style='groupTitle'` and `'groupItems'` on Paragraphs, `reconstructData()` helper that splits semicolon-separated strings into row objects. | **Partial** — Press silently drops `data-style` on Paragraphs (see gap #2 below). |

### `~/Proximify/innovation-modules/src/Publications/`

xlsx + chart case. Legacy pattern: same component produces a Nivo chart for the React preview *and* a flat `{ title, headers, data }` object for xlsx via `block.xlsx = …` mutation.

| Component | Lines | Role | Notes |
|---|---|---|---|
| **PublicationsInRange** | 67 | Filters publications by date range (from `website.reportDownloadOptions.{start_date, end_date}`), parses via `citation-js`, emits a one-row xlsx with total count. React preview is a `<SafeHtml>` rendering of the APA bibliography. | Portable. Registration shape for phase-2 xlsx adapter. |
| **Charts** | 225 | Fetches full profiles via `uniweb.useCompleteProfiles`, aggregates publications by type across faculty members, emits a multi-column xlsx with headers and one data row. Preview is a responsive Nivo pie chart + bar chart. | Portable. This is the canonical "different shapes per medium" example from `concepts.md` §Mode 3. |

## Vocabulary cross-reference

Every `data-*` attribute used by the nine reference foundations, cross-referenced against `src/ir/attributes.js`.

| Attribute | Foundations | In `attributeMap`? | docx adapter reads it? | Status |
|---|---|---|---|---|
| `data-type="paragraph"` | All | Consumed by parser | Yes | ✅ |
| `data-type="table"` / `tableRow` / `tableCell` | ResearchFunding | Consumed by parser | Yes | ✅ |
| `data-type="emptyLine"` | DynamicSection, ResearchFunding, Submission | Default fallthrough | **No** — dropped by `irToSectionChildrenAsync`'s switch (falls to default paragraph case, produces an empty paragraph) | ⚠️ Ships empty paragraph, probably intended as a vertical space. Functionally equivalent. Verify at runtime. |
| `data-type="contentWrapper"` | DynamicSection, Citation | Consumed by parser? | Parser treats unknown types as generic containers whose children pass through | ⚠️ Probably fine but untested. |
| `data-heading="HEADING_1"` … `"HEADING_4"` | DynamicSection, Citation, UNB/SMU Section | Default fallthrough → `heading` property | Yes (`irToParagraph` reads `node.heading`) | ✅ |
| `data-bold` / `data-italics` / `data-underline` | Emitted by Paragraph `data` prop parser | Default fallthrough + `data-underline` explicit | Yes | ✅ |
| `data-spacing-before` / `data-spacing-after` | (builder default) | Yes | Yes | ✅ |
| `data-bullet-level` | DynamicSection | Yes | Yes | ✅ |
| `data-numbering-reference` | DynamicSection (`'numbering'` / `'en-dash'`), Citation (`'numbering'`) | Yes | Passed to `DocxParagraph({ numbering: { reference } })` | ⚠️ **Gap #3** — the reference name is forwarded but Press's `Document` constructor never defines the corresponding numbering configs. Word falls back to its defaults. |
| `data-numbering-level` | DynamicSection, Citation | Yes | Yes | ⚠️ Same gap #3. |
| `data-numbering-instance` | DynamicSection, Citation | Yes | Yes | ⚠️ Same gap #3. |
| `data-positionaltab-alignment` | Header | Yes | Yes | ✅ |
| `data-positionaltab-relativeto` | Header | Yes | Yes | ✅ |
| `data-positionaltab-leader` | Header | Yes | Yes | ✅ |
| `data-width-size` / `data-width-type` | ResearchFunding | Yes | Yes (tableCell) | ✅ |
| `data-margins-{top,bottom,left,right}` | ResearchFunding | Yes | Yes (tableCell) | ✅ |
| `data-borders-{side}-{style,size,color}` | ResearchFunding | Yes | Yes (tableCell) | ✅ |
| `data-transformation-{width,height}` | (Image builder default) | Yes | Yes | ✅ |
| `data-alttext-description` | (Image builder default) | Yes | Yes | ✅ |
| `data-image-type` | (unused by references but in vocab) | Yes | Yes | ✅ |
| `data-floating-*` | (unused by references but in vocab) | Yes | Not read by adapter | ⚠️ Adapter gap — declared in IR but never passed to the docx Paragraph's `floating` option. Low priority (references don't use it). |
| **`data-style`** | DynamicSection (`'leftIndentation'`, `'groupTitle'`, `'groupItems'`), Submission (same), SMU Header (`'twoColumnLayoutJustified'` inline) | Default fallthrough → `style` property | **Only TextRun reads `node.style`** (`irToTextRunPair`, line 298). `irToParagraph` (line 202) **silently ignores** it. | ⚠️ **Gap #2** — `<Paragraph data-style='groupTitle'>` is a no-op in Press. Four reference components depend on this. |
| **`format={{ mode, ... }}`** (not a data-* attr; a React prop) | DynamicSection (6 modes), Citation (`ordered-list-reversed`) | N/A — prop, not attribute | `<Paragraph>` has no `format` prop | ❌ **Gap #1** — the biggest unmigrated feature. |

## Three gaps confirmed by static analysis

### Gap #1 — the legacy `format` prop

Legacy `@uniwebcms/report-sdk`'s `<Paragraph>` accepted a `format` prop:

```jsx
<Paragraph data={data} format={{ mode: 'twoLevelIndentation', list: list }} />
<Paragraph data={data} format={{ mode: 'twoColumnLayoutWide', list: firstList }} />
<Paragraph data={entry} format={{ mode: 'ordered-list-reversed', numberingNumber: parsedHTML.length - index }} />
```

Six+ modes observed across the references:

| Mode | Purpose | Observed in |
|---|---|---|
| `twoLevelIndentation` | Two-level hanging indent over a list of paragraphs | UNB/DynamicSection |
| `twoColumnLayout` / `twoColumnLayoutWide` / `twoColumnLayoutJustified` | Two-column layout of a list (e.g., label + value columns in a CV entry) | UNB/DynamicSection, SMU Header inline |
| `left-indentation` | Indent continuation lines from the left | UNB/DynamicSection |
| `group-items` | Group title + indented item paragraphs | UNB/DynamicSection, Submission |
| `ordered-list` / `unordered-list` | Ordered/unordered list, each paragraph a list item | UNB/DynamicSection |
| `ordered-list-reversed` | Numbered list with descending numbering (N, N-1, ..., 1) | UNB/Citation, SMU/Citation |

These are not cosmetic. `UNB/DynamicSection` dispatches its entire rendering strategy based on `format`; without it the component cannot produce faculty reports at all. `UNB/Citation` uses it specifically for descending-date bibliographies.

**Press has no `format` prop** on any builder, and `src/ir/attributes.js` has no corresponding entry. A mechanical port of DynamicSection would produce docx missing exactly the layout the content authors depend on.

**Three options for addressing this:**

1. **Add `format` as a Paragraph prop.** Port the legacy mode expansions into the Press adapter. Components port mechanically. Down side: a giant switch statement lives inside Press's adapter, coupling it to one foundation's mental model.
2. **Extract modes into dedicated builder components.** New builders: `<TwoColumnLayout>`, `<TwoLevelIndent>`, `<LeftIndent>`, `<ReversedOrderedList>`, `<GroupItems>`. Each encapsulates one mode's data-attribute emission. Components port mostly mechanically; reads more idiomatically. Down side: multiplies the builder surface.
3. **Drop the `format` prop entirely and let foundations express these layouts via existing primitives.** Means DynamicSection's rewrite is non-trivial — every mode needs manual re-expression in terms of paragraph indent/numbering/tab attributes that may or may not exist. Down side: not mechanical; affects every foundation that uses `format`.

My recommendation: **option 2.** It's the cleanest boundary for adding functionality without bloating `<Paragraph>`, and it makes the mode surface discoverable. The migration is still mechanical — one codemod that turns `<Paragraph format={{ mode: 'twoColumnLayout', list }}>` into `<TwoColumnLayout data={list}>` per mode. This does not block Press shipping because it's a new-component addition, not a breaking change. Each mode can land independently as the audit deepens — starting with `twoColumnLayout` and `group-items` because those are used by the most components.

**Decision required from the user.** Until this is settled, the three most-complex reference components (DynamicSection, SMU/DynamicSection, Citation for descending sort) cannot fully port.

### Gap #2 — `data-style` silently dropped on Paragraph

`src/adapters/docx.js:irToParagraph` (line 202) does not read `node.style`. Only `irToTextRunPair` (line 298) does. So:

```jsx
<Paragraph className='pl-8 underline' data={groupTitle} data-style='groupTitle' />
```

…produces an IR node `{ type: 'paragraph', style: 'groupTitle', children: [...] }`, which `irToParagraph` converts to a `DocxParagraph` with no style set. The `groupTitle` name is gone by the time the docx is written.

This affects:

- **UNB/DynamicSection** — `leftIndentation`, `groupTitle`, `groupItems`
- **SMU/DynamicSection** — same
- **SMU/Submission** — `groupTitle`, `groupItems`
- **(SMU Header inline `<div data-style='twoColumnLayoutJustified'>`)** — a stray one-off use on a non-Paragraph element

**Fix is minimal:** add one line to `irToParagraph` around line 202:

```js
if (node.style) options.style = node.style
```

That forwards the style name to `DocxParagraph({ style })`. This alone makes Word look up a paragraph style by that name — which leads to:

### Gap #3 — numbering configs and paragraph styles are undefined

Even after fixing gap #2, `DocxParagraph({ style: 'groupTitle' })` only works if the enclosing `Document` has a `groupTitle` style defined. Press's `Document` constructor never defines any:

```js
// src/adapters/docx.js — buildDocument()
return new Document({
    ...options,
    sections: [sectionOptions],
})
```

No `styles: { paragraphStyles: [...] }`, no `numbering: { config: [...] }`. The legacy `unirepo/js/frontend/plain/DocumentGenerator/docxGenerator.js` had both — a paragraph-styles registry and a numbering-configs registry that defined every name referenced by legacy foundations (`groupTitle`, `leftIndentation`, `numbering`, `en-dash`, `groupItems`, `twoColumnLayout*`, etc.).

This is a real bug in Press for any foundation that uses named styles or named numbering references. It manifests as Word silently falling back to defaults: numbered lists use Word's generic `1, 2, 3` instead of whatever style the foundation intended; paragraph-style references produce un-styled paragraphs.

**Fix direction:** add two configuration surfaces to the docx adapter:

1. A `paragraphStyles` option on `compileDocx(compiledInput, options)` that the caller fills with `{ id, name, basedOn, run: {...}, paragraph: {...} }` objects.
2. A `numbering` option with `{ config: [{ reference, levels: [...] }] }`.

Both get passed through to `new Document({ styles: { paragraphStyles }, numbering })`. Foundations that need named styles declare them once (per foundation) and foundations that don't pay no cost.

The legacy `docxGenerator.js` has the concrete values for each name referenced by the legacy SDK — those can be ported directly so that existing foundations work unchanged after the gap is closed. I did not copy them into this audit because they require a pass over `unirepo/js/frontend/plain/DocumentGenerator/docxGenerator.js` which is out of scope for the static pass; that's a concrete follow-up work item, not a design question.

**Decision required from the user.** Two questions:

1. Are paragraph styles and numbering configs a *framework* concern (Press ships default definitions for all legacy names, so foundations that do nothing extra get legacy parity) or a *foundation* concern (Press exposes the hooks, foundations declare their own)?
2. If it's a framework concern, how is the set of "legacy names" maintained? If a new foundation introduces a new style name, does it PR against Press?

My recommendation: **foundation concern, with helpers**. Press exposes `paragraphStyles` and `numbering` options on `compile('docx', options)` and documents the legacy names + their `docxGenerator.js` bodies as copy-pasteable defaults in a guide. Foundations that want legacy parity paste the defaults; foundations that want to diverge write their own. This keeps Press format-focused and avoids the "Press owns every foundation's vocabulary" pitfall.

## Intentional differences (not bugs)

Features where Press deliberately diverges from the legacy and the mechanical port has a clean one-line fix. These are documented in `docs/migration-from-phase-1.md` but summarized here for R5 completeness.

| Legacy | Press | Fix in a ported component |
|---|---|---|
| `block.output.docx = docx` (render-side mutation) | `useDocumentOutput(block, 'docx', markup)` hook | Replace the two lines `const docx = htmlToDocx(renderToStaticMarkup(markup)); block.output.docx = docx;` with `useDocumentOutput(block, 'docx', markup);`. Saves three imports (`ReactDOMServer`, `htmlToDocx`, and the serializer dance). |
| `block.output.docx = { firstPageOnly: applyTo === 'first', docx }` (Header) | `useDocumentOutput(block, 'docx', markup, { role: 'header', applyTo: applyTo === 'first' ? 'first' : 'all' })` | One call, one options bag. |
| `block.xlsx = { title, headers, data }` | `useDocumentOutput(block, 'xlsx', { title, headers, data })` | Same pattern for the xlsx path. Works today in registration; the adapter is phase 2. |
| `parseBlockContent(block)` → destructured fields | `block.content` is already the parsed shape | Delete the call and read from `block.content` (or from the destructured `content` prop). |
| `makeCurrency`, `makeRange`, `makeParentheses`, `join` | Deleted — use Loom expressions upstream or inline | See migration doc. In ResearchFunding's case all four inline to a couple of lines; no functional loss. |
| `convertMillimetersToTwip(n)` | Not exported by Press | Two options: (a) inline as `Math.round(n * 56.6929)`; (b) add a small public helper at `@uniweb/press/docx` — ~5 lines, useful for table margins/spacing. **Recommendation: (b).** Cheap and obviously useful. |
| `<Paragraph className='…'>` (Tailwind preview classes) | Same — Press's Paragraph passes className through | No change. Preview styling just works. |
| `block.getChildBlockRenderer()` (legacy Uniweb API) | `<ChildBlocks from={block} />` from `@uniweb/kit` | One-line substitution, already documented in `docs/api/sections.md`. |

## Mechanical port — UNB/ResearchFunding

The cleanest rich example. Demonstrates that (1) the table attribute vocabulary translates 1:1 and (2) the `makeCurrency`/`makeRange`/etc. helpers inline cleanly.

### Before — `~/Uniweb/workspace/.assets/report-system/report-modules/src/UNB/components/ResearchFunding/index.js`

```jsx
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import {
    parseBlockContent,
    htmlToDocx,
    makeCurrency,
    makeParentheses,
    join,
    makeRange,
    Paragraph,
    Section,
    TextRun,
    convertMillimetersToTwip,
    SourceTooltip,
} from '@uniwebcms/report-sdk'

export default function ResearchFunding({ block, extra }) {
    const { id, input } = block
    const { title } = parseBlockContent(block)
    const fundingData = block.input.data || []

    const tRows = []
    fundingData.forEach((data) => {
        const {
            funding_start_date, funding_end_date, funding_sources,
            funding_title, other_investigators,
        } = data
        const dateCell = makeRange(funding_start_date, funding_end_date)

        funding_sources?.forEach((source) => {
            const {
                funding_organization,
                converted_total_funding,
                converted_portion_of_funding_received,
            } = source
            const sourceCell = join([funding_organization, makeParentheses(funding_title)])
            const amount = [makeCurrency(converted_total_funding)]
            if (converted_portion_of_funding_received) {
                amount.push(join(['total', makeParentheses(join([
                    makeCurrency(converted_portion_of_funding_received), 'UNB portion',
                ]))]))
            }
            if (other_investigators?.length) {
                amount.push(makeParentheses(join([
                    'Joint with ',
                    join(other_investigators.map((i) => i.investigator_name), ', '),
                ])))
            }
            tRows.push([dateCell, sourceCell, join(amount)])
        })
    })

    const cellWidth = [25, 50, 25]
    const markup = (
        <>
            <div data-type='table'>
                {tRows.map((row, rIndex) => (
                    <div key={rIndex} className='flex' data-type='tableRow'>
                        {row.map((cell, cIndex) => (
                            <div
                                key={cIndex}
                                data-type='tableCell'
                                data-width-size={cellWidth[cIndex]}
                                data-width-type='pct'
                                data-margins-top={convertMillimetersToTwip(1)}
                                data-margins-bottom={convertMillimetersToTwip(1)}
                                data-margins-left={convertMillimetersToTwip(6)}
                                data-margins-right={convertMillimetersToTwip(5)}
                                data-borders-top-style='none'
                                data-borders-bottom-style='none'
                                data-borders-left-style='none'
                                data-borders-right-style='none'
                            >
                                <Paragraph data={cell} />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </>
    )

    const htmlString = ReactDOMServer.renderToStaticMarkup(markup)
    const docx = htmlToDocx(htmlString)
    if (tRows.length) block.output.docx = docx
    return <Section>{markup}</Section>
}
```

### After — port to `@uniweb/press` (disposable; not committed to Press itself)

```jsx
import { useDocumentOutput } from '@uniweb/press'
import { Paragraph } from '@uniweb/press/docx'

// Legacy helpers, inlined. In a real foundation these would live in
// src/components/helpers.js and be shared across report sections.
const mmToTwip = (mm) => Math.round(mm * 56.6929)
const fmtCurrency = (v) => {
    const n = parseFloat(String(v).replace(/,/g, ''))
    if (Number.isNaN(n)) return `$${v}`
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const parens = (t) => (t ? `(${t})` : '')
const joinNonEmpty = (arr, sep = ' ') => arr.filter(Boolean).join(sep)
const range = (a, b) => (a && b ? `${a} - ${b}` : a || b || '')

export default function ResearchFunding({ content, block }) {
    const fundingData = content.data?.funding || []

    const tRows = []
    fundingData.forEach((data) => {
        const {
            funding_start_date, funding_end_date, funding_sources,
            funding_title, other_investigators,
        } = data
        const dateCell = range(funding_start_date, funding_end_date)

        funding_sources?.forEach((source) => {
            const {
                funding_organization,
                converted_total_funding,
                converted_portion_of_funding_received,
            } = source
            const sourceCell = joinNonEmpty([funding_organization, parens(funding_title)])
            const amount = [fmtCurrency(converted_total_funding)]
            if (converted_portion_of_funding_received) {
                amount.push(joinNonEmpty(['total', parens(joinNonEmpty([
                    fmtCurrency(converted_portion_of_funding_received), 'UNB portion',
                ]))]))
            }
            if (other_investigators?.length) {
                amount.push(parens(joinNonEmpty([
                    'Joint with ',
                    joinNonEmpty(other_investigators.map((i) => i.investigator_name), ', '),
                ])))
            }
            tRows.push([dateCell, sourceCell, joinNonEmpty(amount)])
        })
    })

    const cellWidth = [25, 50, 25]
    const markup = (
        <div data-type='table'>
            {tRows.map((row, rIndex) => (
                <div key={rIndex} className='flex' data-type='tableRow'>
                    {row.map((cell, cIndex) => (
                        <div
                            key={cIndex}
                            data-type='tableCell'
                            data-width-size={cellWidth[cIndex]}
                            data-width-type='pct'
                            data-margins-top={mmToTwip(1)}
                            data-margins-bottom={mmToTwip(1)}
                            data-margins-left={mmToTwip(6)}
                            data-margins-right={mmToTwip(5)}
                            data-borders-top-style='none'
                            data-borders-bottom-style='none'
                            data-borders-left-style='none'
                            data-borders-right-style='none'
                        >
                            <Paragraph data={cell} />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )

    if (tRows.length) useDocumentOutput(block, 'docx', markup)
    return <div className='max-w-4xl mx-auto'>{markup}</div>
}
```

### What changed

- **Five imports → two.** `ReactDOMServer`, `htmlToDocx`, `parseBlockContent`, `Section`, `SourceTooltip`, and the legacy utility helpers all go away.
- **Props signature.** `{ block, extra }` → `{ content, block }`. `input` / `parseBlockContent(block)` → destructured `content`. `content.data` is the normalized data shape the modern Uniweb runtime hands to section components.
- **No more render-time mutation.** `block.output.docx = docx` → `useDocumentOutput(block, 'docx', markup)`. Conditional registration (`if (tRows.length)`) is preserved exactly.
- **No more manual HTML serialization.** `renderToStaticMarkup` + `htmlToDocx` → the hook hands the JSX off to the compile pipeline which does those steps internally.
- **Helpers inlined.** Five tiny functions that together are ~15 lines. Could also be a shared `components/helpers.js` file — this is a foundation-level decision, not a Press one.
- **`convertMillimetersToTwip` inlined** too. If Press ships a public helper in a follow-up (see "Intentional differences" above), the inline can be replaced with an import.
- **No outer `<Section>` wrapper.** The Uniweb runtime wraps each section in `<section>` with the right context class. The component returns just the inner layout (`<div className='max-w-4xl mx-auto'>`).
- **The JSX inside `markup` is byte-identical.** Every `data-type`, `data-width-size`, `data-margins-*`, and `data-borders-*` attribute is unchanged. The IR walker should produce structurally identical output to the legacy `htmlToDocx` for this component — *conditional on gaps #2 and #3 not applying here, which they don't* (no `data-style`, no numbering references).

### What the port reveals

1. **The mechanical-port claim holds for non-`format`, non-style, non-numbering components.** ResearchFunding is ~90% unchanged JSX. The delta is mostly imports and the one-line registration replacement.
2. **Helper inlining is genuinely small.** Five utilities, ~15 lines total. Not worth a dependency.
3. **`convertMillimetersToTwip` is used, and there's a live case for re-exporting it.** Unit conversions for margins and spacing come up in any real foundation with tables. Add it to `@uniweb/press/docx` as a public helper.
4. **The `content.data.funding` path is a guess.** I assumed the foundation's block declares a data source whose response lands at `content.data.funding`. The legacy read `block.input.data`, which predates Uniweb's modern content shape. In a real port, the foundation's `meta.js` would declare the fetch, and the correct path comes from that. This is a foundation-side concern, not a Press concern.

## xlsx registration-side audit (for phase 2 scoping)

The `innovation-modules/Publications` foundation is the reference for how foundations use xlsx. Press's registration side already works for xlsx (`useDocumentOutput(block, 'xlsx', shape)` and `compileOutputs` branches on xlsx to pass shapes through unchanged); only the adapter is missing. This section documents what the adapter eventually needs to consume.

### Shape

Both legacy components set:

```js
block.xlsx = {
    title: string,            // sheet name (also used as the legacy sheet title)
    headers: string[],        // column headers, row 1
    data: Array<Array<any>>,  // rows 2+, each inner array is one row
}
```

The modern equivalent:

```js
useDocumentOutput(block, 'xlsx', { title, headers, data })
```

The `compileOutputs` branch in `src/ir/compile.js` already collects these into `{ sections: Array<{title, headers, data}> }`. The adapter must turn that into a multi-sheet workbook, one sheet per registered fragment.

### Specifics from the references

- **PublicationsInRange** — single-row output: `title: 'Total number in selected period'`, `headers: ['Total number']`, `data: [[filteredCount]]`. Minimal case; validates the degenerate shape works.
- **Charts** — multi-column output: `title: 'Number of publications by type'`, `headers: [...types]` (dynamic, from `profile.getSectionInfo(path).label`), `data: [[...counts]]`. One row, one column per section type. Validates dynamic header generation.

### Features observed

- **One `block.xlsx` per block = one sheet per block.** Sheet name from `title`. No multi-sheet registration from a single block.
- **No cell formatting.** No bold headers, no column widths, no number formats, no formulas, no frozen panes, no merged cells. The legacy `xlsx@0.18.5` library used by the legacy `xlsxGenerator.js` had none of this either — the foundations never asked for more.
- **Dynamic data source.** Both components fetch via `uniweb.useCompleteProfiles('members/cv', ids)` and iterate profiles inline. The xlsx shape is computed from that fetch result, not from pre-declared config. The modern equivalent is `EntityStore.resolve` + block-level fetch configs; Press doesn't care which you use.
- **Report download options flow in via `website.reportDownloadOptions`.** Start and end dates for the publication filter come from there. This is Uniweb-runtime machinery, not a Press concern — by the time Press sees the block, the component has already narrowed the data.

### Open questions for the xlsx adapter (phase 2)

1. **Library choice.** Legacy used `xlsx@0.18.5`. Modern candidates: `exceljs` (more features, richer styling, ~700 KB min), `xlsx-populate` (similar to legacy, ~400 KB min), or a small custom writer for the degenerate cases these references exercise. Given how minimal the legacy use is, a small custom writer might be enough — but supporting column widths and number formats becomes important the moment a real foundation has a column that needs them. Recommend `exceljs` unless bundle size is a hard constraint.
2. **Sheet title vs sheet name.** Legacy used `title` as both. exceljs separates them (sheet name is the tab label, sheet title is metadata). Decide per-field.
3. **Dynamic column widths.** Not in the reference foundations but obvious next step. Trivial with `exceljs`.
4. **Cell formatting for headers.** Bold + fill + bordered header row is standard and cheap. Ship as default; allow foundations to opt out.

None of these block phase-2 adapter work — the registration side is settled and backward-compatible with anything the adapter eventually chooses.

## Beyond-legacy opportunities

Features where Press could surpass the legacy if the audit is ever turned into a forward-looking design pass.

- **Numbering config registration as a first-class API.** Foundations declare their numbering styles once per foundation (not per call), and the registration flows into the adapter through `compile('docx', { numbering: [...] })`. Solves gap #3 cleanly.
- **Native paragraph-style registration, similarly.** Same shape.
- **Table of contents generation.** The `docx` library supports `TableOfContents` natively; Press's adapter never uses it. A `<TableOfContents>` builder that emits a docx TOC field would be a few dozen lines.
- **Page breaks and section properties.** The adapter today emits one `SectionType.CONTINUOUS` wrapping everything. No support for page breaks, orientation switches, or per-section margins. Legacy references don't use these — but the moment a multi-page report with a landscape appendix comes up, this is the gap.
- **`applyTo: 'odd'` and `'even'` for headers/footers.** Plan notes these are roadmap. Cheap to add.
- **A small `convertMillimetersToTwip` helper** on `@uniweb/press/docx`. Same for inches, points, cm. Called out above.
- **Charts in docx via SVG → PNG.** Legacy didn't do this. A foundation with a bar-chart-inside-docx use case would drive this (none of the references does — Publications/Charts embeds charts *in the preview* only).
- **A "legacy style pack" guide** under `docs/guides/` that gives paste-in paragraph styles and numbering configs matching the legacy docxGenerator names (`groupTitle`, `groupItems`, `leftIndentation`, `numbering`, `en-dash`, …). Foundations porting from the legacy use this as their starting point; foundations starting fresh pick their own names.

## What remains after this audit

### Runtime verification (blocked on environment setup)

The static pass can't confirm XML-level fidelity for components that *do* port cleanly. The runtime pass needs:

1. A running legacy environment capable of invoking the three foundations end to end. Options:
   - Re-use an existing UNB or SMU production tenant if one is still online.
   - Set up a minimal legacy host locally: webpack module-federation + `@uniwebcms/report-sdk@1.3.4` + a stub Uniweb platform that can load the foundation and call `PrinterCore.getPageReport()`.
2. A runnable Press port of at least one foundation inside a modern Uniweb workspace (the ResearchFunding port above is a candidate).
3. A script to diff the two `.docx` outputs at the XML level: `unzip`, extract `word/document.xml` and `word/numbering.xml`, normalize whitespace/id ordering, `diff -u`. The diff should be empty for ResearchFunding if gaps #2 and #3 don't apply and the static pass is correct.

Pragmatically: this is a separate work package. I don't have the legacy environment available and setting it up is its own mini-project. The static findings are useful now; runtime verification is a follow-up.

### Decisions required from the user

1. **Gap #1 — the `format` prop.** Option 1 (Paragraph prop), 2 (extract to builder components — my recommendation), or 3 (drop entirely)?
2. **Gap #3 — paragraph styles and numbering configs.** Framework-defined defaults or foundation-declared via `compile` options (my recommendation)?
3. **`convertMillimetersToTwip` helper.** Ship as public helper on `@uniweb/press/docx`?
4. **Runtime verification.** Is setting up a legacy environment in scope, or does R5 ship "partial" as is?
5. **`applyTo: 'odd'` / `'even'` header/footer support.** Roadmap per the plan; confirm still deferred.

Until these decisions land, R5 output is:

- This audit document.
- Three code-visible gaps and their recommended fixes.
- The mechanical-port pattern validated on one reference foundation.
- Enough xlsx shape data for phase-2 adapter scoping.
- A list of beyond-legacy opportunities filed against future work.

### Adapter changes that could land as part of R5

Without waiting for the bigger decisions, three small changes are uncontroversial and could land now:

1. **Fix gap #2.** One-line change in `src/adapters/docx.js:irToParagraph` to forward `node.style` to `DocxParagraph({ style })`. No risk — paragraphs without a `data-style` attribute are unchanged.
2. **Add `convertMillimetersToTwip` (and `convertInchesToTwip`, `convertCentimetersToTwip`) to `@uniweb/press/docx`.** Re-exported from the `docx` library. Two-line addition to the barrel.
3. **Pass `paragraphStyles` and `numbering` options through `compile('docx', options)` to `new Document(...)`.** Scaffold for gap #3's eventual fix. No-op if callers don't pass them; unlocks gap-#3 experiments as soon as someone does.

I have not made these changes in this pass because R5 is primarily an audit, not an adapter-modification phase. If you want any of them landed now, tell me and I'll ship them as a follow-up commit.

## References

- `../design/restructure-2026-04.md` §5 R5 — the plan that scopes this audit.
- `../../kb/framework/reference/documents-legacy-references.md` (currently; renamed under the R4d proposal) — the legacy code pointer file. R5 leaned on this heavily for the `report-sdk` source locations.
- `~/Uniweb/workspace/.assets/report-system/report-modules/` — the three reference docx foundations.
- `~/Proximify/innovation-modules/src/Publications/` — the xlsx reference foundation.
- `../../src/ir/attributes.js` — Press's `attributeMap`, cross-referenced throughout.
- `../../src/adapters/docx.js` — Press's docx adapter, the source of the gap #2 and gap #3 findings.
- `../../src/ir/compile.js` — the compile pipeline that routes registrations to the adapter.
