# Building a docx-producing foundation — cookbook

A task-oriented guide for foundation authors who need to produce professional Word documents: annual activity reports, faculty CVs, business documents, anything where the deliverable is a `.docx` file someone opens in Word and edits or signs off on.

Aimed at developers who know React but have not used Press before. Reads top-to-bottom for a first pass; later sections (typography, page chrome, dates, logo) work as standalone references.

The worked example throughout is a **faculty annual activity report** — an academic CV for a defined period (a year, or several), with aggregated sections for publications, supervision, academic service, media interviews, and a signoff. Multi-page, Letter or A4 depending on institution, branded per institution. Every Press capability earns its place against this shape.

---

## Hello world

The smallest foundation that produces a Word file from one section.

A foundation has two surfaces. **Section components** describe how to render content (one component per `type` declared in markdown frontmatter). The **foundation default export** declares which formats the foundation supports and how compile options for each are built.

### One section

```jsx
// src/sections/Cover/index.jsx
import { useDocumentOutput } from '@uniweb/press'
import { Paragraph, TextRun } from '@uniweb/press/docx'

export default function Cover({ content, block }) {
    const { title, paragraphs = [] } = content

    const tree = (
        <>
            <Paragraph role="Title">
                <TextRun>{title}</TextRun>
            </Paragraph>
            {paragraphs.map((p, i) => (
                <Paragraph key={i}>
                    <TextRun>{p}</TextRun>
                </Paragraph>
            ))}
        </>
    )

    useDocumentOutput(block, 'docx', tree)
    return <section className="cover">{tree}</section>
}
```

Four points worth noticing:

1. **The same JSX is the React preview AND the docx fragment.** `tree` is rendered once for the on-page preview (the `return`), and registered for the docx compile (the `useDocumentOutput` call). No per-format duplication.
2. **`role="Title"`** routes through Word's named-style channel. The recipient can edit the Title style in Word's Styles pane and have every reference update. (More on this in [Typography](#typography-and-the-styles-pane).)
3. **`<TextRun>` children, not bare strings as `<Paragraph>`'s `data` prop.** The `data` prop is for HTML strings with inline marks (`<strong>`, `<em>`); structured JSX is more common in foundation code.
4. **`useDocumentOutput` runs at React render.** This is intentional — registrations need to be visible during the SSR pass that the compile pipeline runs.

### One foundation

```jsx
// src/foundation.js
import { defineFoundationConfig } from '@uniweb/build'
import { buildDocxOptions } from './compile-options.js'

export default defineFoundationConfig({
    outputs: {
        docx: {
            extension: 'docx',
            getOptions: buildDocxOptions,
        },
    },
})
```

```js
// src/compile-options.js
export function buildDocxOptions(website, hostHints = {}) {
    return {
        adapterOptions: {
            title: hostHints.title ?? 'Annual Activity Report',
            creator: hostHints.creator ?? 'University',
            loadAsset: hostHints.loadAsset,
        },
    }
}
```

That's it. `getOptions` gets called once per compile to produce the document-level options bag — title, creator, theme, page setup, header/footer, asset loader. Per-section content registers itself via `useDocumentOutput`.

### Compile

If you're using `unipress` as the host, `unipress compile <doc-dir> --format docx` produces the file. If you're driving Press directly from a React app, see [the quick-start guide](../quick-start.md) for the in-page flow.

---

## The five things every professional docx needs

Skim this section first. Each subsection has a worked example, and the rest of the cookbook builds on these primitives.

### 1. Tables that look like tables

Press's `<Table>` / `<Tr>` / `<Td>` produce real OOXML tables with cell shading, borders, fixed column widths, vertical alignment, header rows that repeat across page breaks, and column/row spans.

```jsx
import { Table, Tr, Td, cm, Paragraph, TextRun } from '@uniweb/press/docx'

<Table
    columnWidths={[cm(8), cm(2), cm(3), cm(3)]}
    borders={{
        top: { style: 'single', size: 4, color: 'softBorder' },
        bottom: { style: 'single', size: 4, color: 'softBorder' },
        left: { style: 'single', size: 4, color: 'softBorder' },
        right: { style: 'single', size: 4, color: 'softBorder' },
        insideHorizontal: { style: 'single', size: 4, color: 'softBorder' },
        insideVertical: { style: 'single', size: 4, color: 'softBorder' },
    }}
>
    <Tr header>
        <Td shading="accent" valign="center">
            <Paragraph><TextRun role="TableHeader">Title</TextRun></Paragraph>
        </Td>
        <Td shading="accent" valign="center">
            <Paragraph data-alignment="right"><TextRun role="TableHeader">Year</TextRun></Paragraph>
        </Td>
        {/* … */}
    </Tr>
    <Tr>
        <Td valign="center"><Paragraph><TextRun>Paper title</TextRun></Paragraph></Td>
        <Td valign="center"><Paragraph data-alignment="right"><TextRun>2024</TextRun></Paragraph></Td>
        {/* … */}
    </Tr>
</Table>
```

Three features worth committing to muscle memory:

- **`<Tr header>`** marks the row as `<w:tblHeader/>` so it repeats at the top of each page when the table breaks. Crucial for multi-page activity reports.
- **`columnWidths={[cm(8), cm(2), cm(3), cm(3)]}`** locks the layout to fixed twips. Without this Word's autofit redistributes columns to fit content, ruining alignment. The default behavior when `columnWidths` is set is `layout="fixed"`.
- **`shading="accent"`** and **`color: 'softBorder'`** are theme keys, not literal hex. They resolve at compile time. See [Theme & typography](#theme-and-the-document-look) below.

For colSpan'd footer rows (the totals pattern in invoices), use `<Td colSpan={3}>`. The `<Tr>` cloning logic is span-aware so per-column widths still line up.

### 2. Typography that scales

Foundations don't set font + size + color on every TextRun. They define a small typography registry at the document level, and section components reference roles:

```jsx
<Paragraph role="Title"><TextRun>Annual Activity Report</TextRun></Paragraph>
<Paragraph role="Heading1"><TextRun>Publications</TextRun></Paragraph>
<Paragraph><TextRun role="Label">DEPARTMENT</TextRun> <TextRun>Computer Science</TextRun></Paragraph>
<Paragraph><TextRun role="Display">42</TextRun> <TextRun role="Caption">peer-reviewed publications</TextRun></Paragraph>
```

Each role resolves at compile time to a Word named style (`<w:pStyle w:val="Title">` for paragraph-level, `<w:rStyle w:val="Label">` for inline). The recipient can edit each style in Word's Styles pane. Inline overrides (`color="accent"`) still work and win over the role's resolved value.

Press ships a sensible default registry; foundations override per institution. See [Typography & the Styles pane](#typography-and-the-styles-pane).

### 3. Page chrome that does the document-level work

Page header (logo, running title), page footer (Page X of Y, vendor info), page size, margins, orientation. Most of this lives in `compile-options.js`, not in section JSX:

```js
export function buildDocxOptions(website, hostHints = {}) {
    const cfg = website.config.activity_report
    const country = cfg?.country ?? 'CA'
    return {
        theme: resolveTheme(cfg),
        adapterOptions: {
            title: hostHints.title ?? 'Annual Activity Report',
            creator: cfg?.institution ?? 'University',
            // Letter for North America, A4 elsewhere.
            pageSize: country === 'US' || country === 'CA'
                ? { width: 12240, height: 15840 } // pageSizes.LETTER
                : { width: 11906, height: 16838 }, // pageSizes.A4
            pageOrientation: 'portrait',
            pageMargin: {
                top: cm(2.5), bottom: cm(2.5),
                left: cm(2), right: cm(2),
                header: cm(1.2), footer: cm(1.2),
            },
            loadAsset: hostHints.loadAsset,
        },
    }
}
```

Header and footer are registered separately by the cover section (see [Page header & footer](#page-header-and-footer)). Page-number fields use `<PageNumber/>` and `<TotalPages/>` builders.

### 4. Dates and currency without timezone bugs

Use the format builders. Don't write `String(date)` or `String(amount)`:

```jsx
import { DateText, DateRangeText, Currency } from '@uniweb/press/format'

<TextRun><DateText value={record.appointed_on} format="long" /></TextRun>
<TextRun>
    <DateRangeText period={record.period} format="medium" />
</TextRun>
<TextRun><Currency value={grant.amount} code="CAD" /></TextRun>
```

`DateText` formats via `Intl.DateTimeFormat` with `timeZone: 'UTC'` so a `2026-03-31` ISO doesn't drift to "March 30" under EST. Locale and currency code default to `theme.locale` + `theme.currency`; pass explicit props to override per-call.

If a bare `Date` object reaches a `<TextRun>` (because YAML parsed an ISO string into one and you forgot to format it), Press coerces it to ISO `YYYY-MM-DD` rather than letting React stringify it as `"Sat Feb 28 2026 19:00:00 GMT-0500 …"`. That's a safety net, not the right way — wrap dates in `<DateText>` with an explicit format.

### 5. Logo, branding, and per-institution theming

A theme channel carries colors, fonts, locale, currency, and a typography registry. Foundations resolve the institution's branding from the host config and pass the theme through `compile-options.js`. The full mechanism is in [Theme & the document look](#theme-and-the-document-look).

For the logo specifically, drop a path in the host config:

```yaml
# document.yml or similar host-config file
activity_report:
  institution:
    name: University of X
    logo: assets/logo.png
    accent_color: '0B5394'
    body_font: 'Calibri'
```

The cover section reads it and registers a page-header fragment:

```jsx
import { PageHeader, BrandLogo, cm } from '@uniweb/press/docx'

if (institution?.logo) {
    useDocumentOutput(
        block,
        'docx',
        <PageHeader>
            <BrandLogo url={institution.logo} width={cm(4)} align="right" />
        </PageHeader>,
        { role: 'header' },
    )
}
```

Bytes flow through `loadAsset` — the path resolves to a file the host (e.g. unipress) reads from disk.

---

## The activity-report shape

Here's how an annual activity report decomposes onto Press primitives. Every part below appears as a slice in the foundation; how the slices map to markdown files is up to you.

```
┌─────────────────────────────────────────┐
│ COVER                                   │  Slice: Cover
│   [Institution logo, right-aligned]     │   - Registers page header (logo)
│                                         │   - Registers page footer (Page X of Y)
│   ANNUAL ACTIVITY REPORT                │   - Title + faculty meta
│                                         │
│   Dr. Jane Example                      │
│   Department of Computer Science        │
│   Reporting period: 2024-01 to 2024-12  │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ SUMMARY                                 │  Slice: Summary
│   42 peer-reviewed publications         │   - Display + Caption roles
│   8 graduate students supervised        │   - 2x2 grid of stats via Table
│   12 invited talks                      │
│   $850K research funding                │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ PUBLICATIONS                            │  Slice: PublicationsTable
│   [Big sortable table]                  │   - <Tr header> repeats
│                                         │   - <Currency> for funding column
│                                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ SUPERVISION                             │  Slice: SupervisionTable
│   PhD / MSc / BSc grouped               │   - colSpan for category headers
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ SERVICE & MEDIA                         │  Slice: ServiceTable
│   Committees, reviews, interviews       │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ SIGNOFF                                 │  Slice: Signoff
│   [Faculty signature line]              │   - role="Caption" for date stamps
│   [Department head signature line]      │
│   Submitted: 2025-01-15                 │
└─────────────────────────────────────────┘
```

The patterns repeat: title via `role="Title"`, headings via `role="Heading1"`, tables via `<Table>` + `<Tr header>`, dates via `<DateText>`, currency via `<Currency>`. Five slice components cover the whole report.

---

## Typography and the Styles pane

This is the most foundation-author-facing capability and the easiest to get wrong by reflex (most React developers reach for inline `style={...}` first). Read it once.

### The model

Word documents are inherently *style-driven*. A Word user opening any docx expects to right-click "Heading 1" in the Styles pane and change its font / color / size, and have every heading update. They expect `Title` to be a real thing, not a paragraph someone happened to set to 28pt.

Press matches that model. `theme.typography` is a registry of role definitions:

```js
{
    Title:       { font: 'heading', size: 56, bold: true, color: 'accent' },
    Heading1:    { font: 'heading', size: 32, bold: true, color: 'body' },
    Heading2:    { font: 'heading', size: 26, bold: true, color: 'body' },
    Body:        { font: 'body', size: 22, color: 'body' },          // 11pt
    Display:     { font: 'body', size: 28, bold: true, color: 'body' }, // 14pt
    BodyStrong:  { font: 'body', size: 22, bold: true, color: 'body' },
    Label:       { font: 'body', size: 18, bold: true, color: 'muted', allCaps: true },
    Caption:     { font: 'body', size: 18, color: 'muted' },
    TableHeader: { font: 'heading', size: 20, bold: true, color: 'surface' },
    TotalLine:   { font: 'heading', size: 26, bold: true, color: 'surface' },
}
```

(Sizes are half-points: 11pt = 22.) Each role becomes a Word named style. Press chooses the right OOXML mechanism:

- `Title`, `Heading1-6`, `Hyperlink`, `Strong`, `ListParagraph` → docx's built-in default slots (`default.title`, `default.heading1`, etc.). This is what makes "edit Title in Word's Styles pane" actually work — Word's built-in style overrides flow there.
- `Body` / `Normal` → `<w:rPrDefault>` / `<w:pPrDefault>` — the document-wide default. This is what pins the body font (Calibri or whatever the institution prefers) so every run inherits without each one declaring it.
- Everything else (`Display`, `Label`, `Caption`, `TableHeader`, `TotalLine`) → custom paragraph or character styles, addressable by name from the Styles pane.

### Using roles

```jsx
<Paragraph role="Title"><TextRun>Annual Activity Report</TextRun></Paragraph>
<Paragraph role="Heading1"><TextRun>Publications</TextRun></Paragraph>
<TextRun role="Label">DEPARTMENT</TextRun>
<TextRun role="Display">42</TextRun>
```

Inline overrides still work and win over the role's resolved style:

```jsx
<TextRun role="Label" color="accent">SIGNED</TextRun>  // accent color overrides the Label's muted gray
```

### Defining roles per institution

The institution's branding lives in the foundation's `compile-options.js`:

```js
const DEFAULT_ACTIVITY_REPORT_THEME = {
    colors: {
        accent: '0B5394',     // institution primary
        body: '212121',
        muted: '6B7280',
        softBorder: 'D1D5DB',
        surface: 'FFFFFF',
    },
    fonts: {
        body: 'Calibri',
        heading: 'Calibri',
    },
    typography: {
        // Inherits from Press defaults; override what differs.
        Title:    { font: 'heading', size: 64, bold: true, color: 'accent' }, // bigger 32pt
        Heading1: { font: 'heading', size: 36, bold: true, color: 'accent' },
    },
    locale: 'en-CA',
    currency: 'CAD',
}

function resolveTheme(cfg) {
    return {
        ...DEFAULT_ACTIVITY_REPORT_THEME,
        colors: {
            ...DEFAULT_ACTIVITY_REPORT_THEME.colors,
            ...(cfg?.theme?.colors || {}),
        },
        fonts: {
            ...DEFAULT_ACTIVITY_REPORT_THEME.fonts,
            ...(cfg?.theme?.fonts || {}),
        },
        typography: {
            ...DEFAULT_ACTIVITY_REPORT_THEME.typography,
            ...(cfg?.theme?.typography || {}),
        },
    }
}

export function buildDocxOptions(website, hostHints = {}) {
    const cfg = website.config.activity_report
    return {
        theme: resolveTheme(cfg),
        adapterOptions: { /* … */ },
    }
}
```

A faculty at University X gets University X's accent color and font. A faculty at University Y gets Y's. Same foundation, two looks.

### When recipients don't use the Styles pane

Some recipients will never know the Styles pane exists. They right-click → Font, change a heading. That still works — direct formatting in Word always wins over the style. The role system is what enables *uniform* edits across the document; non-uniform edits still happen the way Word users expect.

The point: roles don't constrain the recipient. They unlock a power-user workflow without breaking the casual one.

### See also

- [Typography roles reference](../api/typography-roles.md) — every role, resolved values, OOXML routing.
- [Architecture: Word styles decision](../architecture/word-styles-decision.md) — why this design.

---

## Theme and the document look

The `<DocumentProvider theme={...}>` carries five things:

| Field | What | Used by |
|---|---|---|
| `colors` | Brand palette (accent, body, muted, softBorder, surface, surfaceAlt) | TextRun color, Td shading, table borders |
| `fonts` | Font families (body, heading, mono) | TextRun font |
| `typography` | Role registry — paragraph and run-level named styles | `<Paragraph role>`, `<TextRun role>` |
| `locale` | BCP-47 (default `en-CA`) | DateText, DateRangeText, Currency |
| `currency` | ISO 4217 (default `CAD`) | Currency |

For `unipress` and similar hosts, you don't mount `<DocumentProvider>` yourself — `compileSubtree` does it from the value `getOptions` returns. For an in-page flow (browser-side download button), wrap your tree:

```jsx
const blocks = website.pages.flatMap((page) => page.bodyBlocks || [])

<DocumentProvider theme={resolveTheme(cfg)}>
    <ActivityReport blocks={blocks} />
    <DownloadButton />
</DocumentProvider>
```

Theme keys (`color="accent"`, `shading="softBorder"`) resolve at React render time. The IR walker and docx adapter never see theme keys — only literal hex.

---

## Page header and footer

Page chrome lives at the document level but registers from a section. The cover section is the natural owner — it runs once per document and has access to the institution metadata.

```jsx
import {
    PageHeader, PageFooter, PageNumber, TotalPages,
    BrandLogo, Paragraph, TextRun, Tab, cm,
} from '@uniweb/press/docx'
import { useDocumentOutput } from '@uniweb/press'

function Cover({ content, block }) {
    const { institution, faculty, period } = content.__ar  // foundation-injected
    const tree = (
        <>
            <Paragraph role="Title"><TextRun>Annual Activity Report</TextRun></Paragraph>
            <Paragraph role="Heading2"><TextRun>{faculty.name}</TextRun></Paragraph>
            <Paragraph><TextRun role="Caption">{faculty.department}</TextRun></Paragraph>
        </>
    )

    // Body
    useDocumentOutput(block, 'docx', tree)

    // Page header — institution wordmark + logo
    if (institution?.logo) {
        useDocumentOutput(
            block,
            'docx',
            <PageHeader>
                <BrandLogo url={institution.logo} width={cm(4)} align="right" />
            </PageHeader>,
            { role: 'header' },
        )
    }

    // Page footer — three-column tabbed: institution / faculty / page X of Y
    useDocumentOutput(
        block,
        'docx',
        <PageFooter>
            <Paragraph
                tabStops={[
                    { position: cm(8), type: 'center' },
                    { position: cm(16), type: 'right' },
                ]}
            >
                <TextRun role="Caption">{institution.name}</TextRun>
                <Tab />
                <TextRun role="Caption">{faculty.name}</TextRun>
                <Tab />
                <TextRun role="Caption">Page </TextRun>
                <PageNumber />
                <TextRun role="Caption"> of </TextRun>
                <TotalPages />
            </Paragraph>
        </PageFooter>,
        { role: 'footer' },
    )

    return <section className="cover">{tree}</section>
}
```

Three details worth keeping straight:

- **Three registrations from the same section.** Press's store keys by `(block, format, role)` — body, header, and footer for the same block don't collide.
- **`<PageHeader>` and `<PageFooter>` are layout-transparent.** They're React fragments. The role tag in the registration options is what routes them; the components are just there so the JSX reads naturally.
- **`<PageNumber/>` and `<TotalPages/>`** emit Word field codes. Word evaluates them on print/preview — they don't fix at compile time.

For a different-first-page header (full INVOICE banner on page 1, slim "INV-0001 — Page X of Y" thereafter), pass `applyTo: 'first'` on the first-page registration:

```jsx
useDocumentOutput(block, 'docx', <PageHeader>{firstPageHeader}</PageHeader>, {
    role: 'header',
    applyTo: 'first',
})
useDocumentOutput(block, 'docx', <PageHeader>{everyPageHeader}</PageHeader>, {
    role: 'header',
})
```

---

## Dates, ranges, and currency

```jsx
import { DateText, DateRangeText, Currency } from '@uniweb/press/format'

// Short date: 2024-01-15 -> "1/15/2024" (en-US) / "2024-01-15" (en-CA)
<DateText value={record.published_on} format="short" />

// Medium: "Jan 15, 2024"
<DateText value={record.published_on} format="medium" />

// Long: "January 15, 2024"
<DateText value={record.published_on} format="long" />

// ISO: "2024-01-15" — useful for filenames, DB-style fields
<DateText value={record.published_on} format="iso" />

// Date range: 2024-01-15 -> 2024-12-31  rendered as "Jan 15, 2024 – Dec 31, 2024"
<DateRangeText from={period.from} to={period.to} format="medium" />
// or
<DateRangeText period={period} format="medium" />

// Currency — uses theme.locale / theme.currency by default
<Currency value={grant.amount} />

// Override per call:
<Currency value={1234.56} code="EUR" locale="de-DE" />  // "1.234,56 €"
```

For the rare case where you need a string outside JSX (a cell header derived from a date, a filename), use the imperative `formatters`:

```js
import { formatters } from '@uniweb/press/format'

const filename = `report-${formatters.date(period.to, { format: 'iso' })}.docx`
```

### Why not `String(date)` or `toLocaleDateString`?

- **Timezone drift.** `2024-12-31` ISO + `toLocaleDateString` in EST gives "Dec 30, 2024". The format builders force `timeZone: 'UTC'` so date-only inputs render the calendar date you wrote.
- **`String(date)` leaks the JS runtime format.** `"Sat Feb 28 2024 19:00:00 GMT-0500 (Eastern Standard Time)"` shows up in a polished document and looks broken.
- **Locale-blind.** "Jan 15, 2024" vs "15 January 2024" vs "15.1.2024" — recipients in different locales expect different. The theme's `locale` is the single point of control.

### See also

- [`@uniweb/press/format` reference](../api/format.md)

---

## A note on the slice pattern

Foundations that produce a multi-section document (cover, summary, publications, supervision, …) typically don't put all the JSX in one section component. Instead, they:

1. Define a small handler in `foundation.js` that injects domain data into the content shape (e.g. `content.__ar = { institution, faculty, period, publications, … }`).
2. Use `block.properties.kind` (or a similar param in markdown frontmatter) to identify which slice each block represents.
3. Have one section component (`ActivityReport`) that branches on `kind` to a per-slice renderer (`Cover`, `Summary`, `PublicationsTable`, …).

This keeps the foundation's outward surface minimal (one `type: ActivityReport` for content authors) and the section component focused.

For a worked example, see `framework/unipress/foundations/business-docs/src/sections/Invoice/index.jsx` — the same shape applied to invoices (cover / line-items / totals / payment slices). Reading it once is the fastest way to internalize the pattern.

---

## Same-source preview

The big payoff of "same JSX for preview and docx" is that the browser preview matches the compiled file. To make that work:

- **Don't put format-specific JSX in a `format === 'docx'` branch.** If you want different layouts per format, use separate fragments and register them under different format keys (`useDocumentOutput(block, 'docx', docxTree); useDocumentOutput(block, 'html', htmlTree)`).
- **Press builders all render reasonable HTML.** `<Paragraph>` renders `<p>`. `<Table>` / `<Tr>` / `<Td>` render `<div>`s with flexbox so they look like a table in the browser. `<Image>` renders `<img>`.
- **The preview doesn't get page chrome.** PageHeader, PageFooter, PageNumber, TotalPages render as React fragments / spans in the browser; they show up in the docx output via the role-based registration. That mirrors how Word treats them — invisible until the document is paginated.

For a non-Uniweb React app driving Press, the [preview-iframe example](../../examples/preview-iframe/) shows the on-page download flow.

---

## Commonly hit issues

These are the IR-walker contracts that bite if you don't know them.

### Images dropped from the output

**Symptom:** You wrap `<Image>` in a `<Paragraph>` (or any other element) for layout. The image is missing from the docx.

**Why:** The IR walker treats `<Image>` as a section-level element. If it appears inside another paragraph, it's in inline context — and the docx adapter deliberately drops images there because OOXML inline images need synchronous handling that the async fetch path doesn't support.

**Fix:** Keep `<Image>` (and `<BrandLogo>`) at the top level of the section's children. For alignment, pass `data-alignment="right"` on the `<Image>` itself; the adapter applies it to the carrier paragraph it builds:

```jsx
// Wrong — image dropped:
<Paragraph data-alignment="right">
    <Image data={{ url: 'logo.png' }} />
</Paragraph>

// Right — image at section level, alignment via data attribute:
<Image data={{ url: 'logo.png' }} data-alignment="right" />

// Or use the BrandLogo wrapper which does this for you:
<BrandLogo url="logo.png" align="right" />
```

### Body text comes out as Times New Roman

**Symptom:** You set `theme.fonts.body = 'Calibri'` but the compiled docx renders body text in Times New Roman.

**Why:** The Body role hasn't been routed to OOXML's `<w:rPrDefault>`. In practice this happens when a foundation passes `paragraphStyles` directly without a theme — the synthesizer is skipped and Press falls back to legacy passthrough.

**Fix:** Always pass `theme` in `getOptions`:

```js
return {
    theme: resolveTheme(cfg),       // <-- this triggers style synthesis
    adapterOptions: { /* … */ },
}
```

Verify with: open the docx, unzip, look at `word/styles.xml`. There should be `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/>…`.

### Header registration overwrites body

**Symptom:** A section that registers both a body and a page-header fragment ends up with one or the other in the output, but not both.

**Why:** Older versions of Press keyed registrations by `(block, format)` — the role tag was invisible. Two `useDocumentOutput(block, 'docx', …)` calls with different roles overwrote each other.

**Fix:** This was fixed in Press's Stage 6.4 commit; registrations now key by `(block, format, role)`. If you're on an older Press, upgrade. (The fix is in the `createStore` function in `src/DocumentProvider.jsx`.)

### "Sat Feb 28 2026 19:00:00 GMT-0500 …" in the output

**Symptom:** A date appears as the JS Date.toString() leak.

**Why:** A `Date` object reached `<TextRun>` directly (`<TextRun>{invoice.due}</TextRun>`) and was stringified by React.

**Fix:** Wrap dates in `<DateText>` with an explicit format. The `<TextRun>` safety net coerces bare Dates to ISO if the wrapper is missed, but it's a floor, not a feature. See [Dates, ranges, and currency](#dates-ranges-and-currency).

### Empty `<w:hdr>` or `<w:ftr>` in the output

**Symptom:** Page header/footer is registered but renders empty.

**Why:** Almost always one of:
1. The image inside is wrapped in a `<Paragraph>` (see "Images dropped" above).
2. The fragment's data depends on a context that wasn't re-applied during compile (locale, theme). Press's `wrapWithProviders` re-applies `BasePathContext` and `ThemeContext` automatically; custom contexts need `<DocumentProvider>` extension.

### A whole section comes out empty

**Symptom:** A section renders fine in the browser preview but produces an empty paragraph in the docx.

**Why:** Most often: the JSX uses a builder that's expected to render section-level children (`<Image>`, `<Table>`) inside a wrapper element with no docx-equivalent (a custom `<div>` without `data-type`).

**Fix:** Press's IR walker treats any element with no recognized `data-type` as a transparent container — it still walks children. If a wrapper drops children, the wrapper has its own `data-type` that the adapter doesn't know about. Switch to a Press builder.

---

## Where to go next

- **Reference**: [`@uniweb/press/docx`](../api/docx.md), [`@uniweb/press/format`](../api/format.md), [typography roles](../api/typography-roles.md).
- **Architecture**: [Word styles decision](../architecture/word-styles-decision.md), [overview](../architecture/overview.md), [principles](../architecture/principles.md).
- **Worked examples**: `framework/unipress/foundations/business-docs/src/sections/Invoice/index.jsx` (the invoice cookbook in code form). Also see [the multi-block report guide](./multi-block-reports.md) for the cross-section aggregation patterns that activity reports use heavily.
- **AI-assisted authoring**: [`docs/ai-prompt.md`](../ai-prompt.md) — a self-contained prompt that primes Claude (or another LLM) on Press's vocabulary so you can ask it for JSX blocks and get answers that compile.
