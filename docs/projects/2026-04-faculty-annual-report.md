# Faculty Annual Report — modern docusite template

**Status:** approved; open questions answered. Ready for Slice 0.
**Author:** Claude.
**Last updated:** 2026-04-15.
**Scope:** a single reference foundation + test site that replaces the legacy UNB/SMU faculty-annual-report foundations with a modern **docusite** — a Uniweb URL whose content is also a downloadable `.docx` document.

This is a forward-looking design. It grows out of the R5 legacy parity audit (`../audits/2026-04-legacy-parity.md`) but is not bound by the legacy implementation; the goal is *same or better output, using modern concepts*, not a 1:1 code port.

## 1. What this is

A **reference foundation** + **test site** + **test CV** that together:

1. Generate a faculty annual report — the same kind of document the legacy UNB/SMU foundations produced — for a fictional researcher, using modern Uniweb primitives.
2. Prove out the modern docusite pattern end-to-end so the rest of the parity work has a working template to extend.
3. Ship as an official template in `framework/templates/` once stable, becoming the first template in a new "docusite" category.

Concretely, the deliverables are:

- One foundation package: `faculty-annual-report-foundation` (name TBD).
- One test site with a fictional CV as a YAML collection.
- A handful of Press changes landed incrementally as the vertical slices surface them.
- A visual review confirming the modern output matches or exceeds the legacy for the same content.
- Migration into `framework/templates/faculty-annual-report/` at the end.

## 2. What a docusite is

A Uniweb URL whose content is *also* a downloadable document. **This is not an academic website in the general sense** — it's a dynamic document that happens to have a URL, can be rendered in a browser, and can be previewed in an iframe. Every page in the docusite corresponds to a section in the downloaded file. The same content powers both renderings. The user reads it on the web and downloads the same information as a `.docx` (or `.xlsx`, `.pdf`, anything Press supports).

This is a generalization of the legacy "report foundation" pattern, cleaned up and formalized. Key properties:

- **The docusite is a document-with-a-URL, not a website-with-a-download-button.** Navigation, hero sections, footers, marketing pages, blog patterns — all the machinery of a general-purpose website — are absent. The sandbox base template should be the minimal **`starter`**, not `academic` or anything heavier. Every section type we build exists to serve the downloadable document.
- **Dual representation.** Every section renders a React preview *and* registers a docx fragment via `useDocumentOutput`. The preview is the browsing experience; the fragment is the downloadable file. They may share JSX (Press builder components doing double duty) or diverge (Kit + design for the preview, Press builders for the compiled output, with the same underlying data).
- **Download-time parameterization.** A user can change *what goes in the download* without changing the content — filter by date range, swap citation style, include or omit sections, customize recipient info for a cover letter. These are **download-time options**, scoped to the docusite and orthogonal to the site's content.
- **Preview can be richer than the download.** Tooltips, filters, expandable cards, animated charts — things that only make sense on a screen — live in the preview only. The download flattens them to static representations or omits them entirely.
- **Download can be richer than the preview.** Footnotes, page numbering, cover letters, appendices with full detail — things that only make sense in a printed or downloaded file — live in the download only. The preview hides them or shows them in a collapsed form.
- **One source of content.** Both renderings read from the same `content`, `params`, and `content.data` inputs. Content authors don't maintain two versions of anything.

The term "docusite" is new here. If a better name emerges, use it; the concept is the contribution.

## 3. The test CV — Charles Darwin

The test profile is **Charles Darwin**, loosely modernized so the CV shape fits a contemporary faculty annual report while the data itself stays rooted in the historical record. Using a beloved and instantly recognizable researcher makes the test fun to work with and easy to verify — a reader can glance at a generated report and immediately tell whether the Galápagos work landed in the right section.

Darwin's real historical life doesn't map cleanly onto modern academic categories — he was an independent gentleman-scholar, not a faculty member. The test CV resolves this by keeping the real work (publications, awards, Royal Society involvement, the Beagle voyage) and gently anachronizing the framing (giving him "positions", "teaching", "service") just enough to exercise every section type. It's deliberately playful — a feature, not a bug.

**Real Darwin material used throughout:**

- **Publications.** His actual books and papers. The well-known ones: *Journal of Researches* (1839), *The Structure and Distribution of Coral Reefs* (1842), *Geological Observations on South America* (1846), *On the Origin of Species* (1859), *The Descent of Man* (1871), *The Expression of the Emotions in Man and Animals* (1872). **Plus his later plant work**, which is less famous but real and well-documented: *Insectivorous Plants* (1875), *The Movements and Habits of Climbing Plants* (1875), *The Different Forms of Flowers on Plants of the Same Species* (1877), *The Power of Movement in Plants* (1880), *The Formation of Vegetable Mould through the Action of Worms* (1881). Target: ~20 entries total across books and papers, all real, formatted as CSL-JSON.
- **Employment.** Real: naturalist on HMS Beagle (1831–1836), then independent scholar at Down House. In the test CV these become modern "positions" with start/end dates.
- **Education.** Real: Cambridge BA (1831), abandoned medical degree at Edinburgh (1825–1827).
- **Awards.** Real: Royal Medal (1853), Wollaston Medal (1859), Copley Medal (1864), Baly Medal (1879).
- **Service.** Real: Royal Society fellowship, Geological Society, Linnean Society, Zoological Society. In the test CV these become modern "service" entries with roles and date ranges.
- **Funding.** Not a modern concept for Darwin. Fictionalized as plausible research expenses from his notebooks and estate — e.g., "Glass-house construction, Down House (1862–1863)" for the plant experiments. Keeps the ResearchFunding section exercised without pretending.
- **Teaching.** Darwin didn't teach. The section is either omitted (demonstrates download-time section inclusion, slice 7) or fictionalized as Cambridge tutoring and public lectures. Decide during slice 5.

### Loom use

Per open question 5, the test CV exercises **`@uniweb/loom`** in at least one section. The natural place is the Cover or the Publications counts. Examples the sandbox should demo:

```markdown
# Annual report: {personal.first_name} {personal.family_name}

During the period {dateRange.start} to {dateRange.end}, {personal.first_name} published
{COUNT OF publications} works — {COUNT OF publications WHERE refereed} of them refereed —
and was awarded {TOTAL OF funding.amount AS currency GBP} in research support
across {COUNT OF funding} grants.
```

Loom resolves the placeholders against the collections-derived content. The foundation's content handler calls `instantiateContent(content, loom, vars)` per `@uniweb/loom`'s `instantiateContent` API before Press sees the content, so Press compiles a fully-resolved tree without any placeholder awareness. This demonstrates the docusite pattern composing cleanly with Loom upstream.

### Data layout

### Data layout

The CV lives in the site package as a set of **YAML collections**, declared in `site.yml`. Each collection is a folder of markdown files, one file per item. This gives the content author pattern described in `framework/cli/partials/agents.md` § "Collections", which the modern Uniweb runtime supports natively.

```
site/
├── collections/
│   ├── personal/        ← one file, Darwin's basic info
│   │   └── darwin.md
│   ├── education/       ← 2-3 items (Edinburgh, Cambridge)
│   │   ├── cambridge.md
│   │   └── edinburgh.md
│   ├── employment/      ← 2 items (Beagle, Down House)
│   │   ├── beagle-naturalist.md
│   │   └── down-house.md
│   ├── funding/         ← 4-6 items (plausible historical expenses)
│   │   ├── glass-house-1862.md
│   │   ├── beagle-publications-1839.md
│   │   └── ...
│   ├── publications/    ← ~20 items in CSL-JSON shape (real Darwin works)
│   │   ├── origin-of-species-1859.md
│   │   ├── insectivorous-plants-1875.md
│   │   ├── climbing-plants-1875.md
│   │   ├── different-forms-of-flowers-1877.md
│   │   ├── power-of-movement-in-plants-1880.md
│   │   ├── worms-1881.md
│   │   └── ...
│   ├── teaching/        ← optional; decided at slice 5
│   │   └── ...
│   ├── service/         ← Royal Society, Linnean, Geological, etc.
│   │   ├── royal-society-fellow.md
│   │   ├── geological-society.md
│   │   └── ...
│   └── awards/          ← Royal Medal, Wollaston, Copley, Baly
│       ├── royal-medal-1853.md
│       ├── wollaston-1859.md
│       ├── copley-1864.md
│       └── baly-1879.md
├── pages/
│   └── report/          ← the report page (one page, many sections)
│       ├── cover.md
│       ├── personal.md
│       ├── education.md
│       ├── employment.md
│       ├── funding.md
│       ├── publications.md
│       ├── teaching.md
│       ├── service.md
│       ├── awards.md
│       └── appendix.md
└── site.yml
```

Each page-section markdown file is mostly frontmatter (`type:`, `data:` fetch config) with minimal content body — the content comes from the collections. The section component receives the resolved collection items as `content.data` and renders them.

Target volume: ~20 publications, ~6 grants, ~10 courses, ~15 service entries, ~5 awards, 3 degrees, 3 positions. Enough to exercise every feature without bloating the test site.

### Frontmatter shape per collection

Each collection uses a small, discoverable set of fields. Drafted below; refined in implementation.

**`personal/darwin.md`:**
```yaml
---
first_name: Charles
family_name: Darwin
title: Naturalist and Independent Researcher
affiliation: Down House, Kent
email: charles@example.org
born: 1809-02-12
---
```

**`education/cambridge.md`:**
```yaml
---
degree: Bachelor of Arts
institution: Christ's College, University of Cambridge
year: 1831
field: Theology (with natural history under Henslow)
---
```

**`employment/beagle-naturalist.md`:**
```yaml
---
title: Naturalist
organization: HMS Beagle (voyage around the world)
start: 1831-12-27
end: 1836-10-02
description: |
  Collected specimens and geological observations across South America,
  the Galápagos Islands, Tahiti, New Zealand, and Australia. The
  observations formed the basis for subsequent work on species variation.
---
```

**`funding/glass-house-1862.md`:**
```yaml
---
title: Construction of heated glass-house for experimental botany
source: Personal estate
role: Principal Investigator
amount: 200
currency: GBP
start: 1862-03-01
end: 1863-05-01
description: |
  Required to extend observations of insectivorous plants and climbing
  plants under controlled conditions. Later served experiments for
  The Power of Movement in Plants (1880).
---
```

**`publications/insectivorous-plants-1875.md`** — CSL-JSON frontmatter, ready for `citestyle` consumption:
```yaml
---
type: book
title: Insectivorous Plants
author:
  - { family: Darwin, given: Charles }
issued: { date-parts: [[1875]] }
publisher: John Murray
publisher-place: London
refereed: false
---
```

**`publications/origin-of-species-1859.md`:**
```yaml
---
type: book
title: On the Origin of Species by Means of Natural Selection
author:
  - { family: Darwin, given: Charles }
issued: { date-parts: [[1859]] }
publisher: John Murray
publisher-place: London
refereed: false
---
```

Publications use the exact CSL-JSON field names so they can be fed to `citestyle`'s `formatAll(style, items)` directly without a transform. The `refereed` field is a foundation-level convention (not CSL-JSON) used by Loom expressions and filter logic; citestyle ignores it.

**`teaching/naturalist-course-1832.md`** (fictionalized):
```yaml
---
code: NAT-300
title: Field Methods in Natural History
term: voyage
year: 1832
level: apprentice
description: |
  Practical instruction in specimen collection and preservation
  during the Beagle voyage, delivered to the ship's crew.
---
```

**`service/royal-society-fellow.md`:**
```yaml
---
role: Fellow
organization: Royal Society of London
type: external
start: 1839-01-24
end: 1882-04-19
---
```

**`awards/copley-medal-1864.md`:**
```yaml
---
title: Copley Medal
organization: Royal Society of London
year: 1864
description: |
  Awarded for "important researches in geology, zoology, and botanical
  physiology, as contained in his various works".
---
```

## 4. Section types

Nine core section types plus a layout and a cover. Each table row covers: name, what data it consumes, preview behavior, docx behavior, and what Press features it exercises.

| Section | Data source | Preview | Docx output | Press features used |
|---|---|---|---|---|
| **Cover** | `site.yml` + `personal/darwin.md` | Title slide with name, affiliation, date range | Title page with metadata for Word (title, creator, subject) | `H1`, `Paragraph`, `compile` options → Word metadata |
| **PersonalInfo** | `personal/darwin.md` | Compact card with portrait, contact info, links | Formal header block with name, title, affiliation | `H1`/`H2`, `Paragraph` with inline marks |
| **Education** | `collections/education/*` | Timeline or vertical list | Chronological list, newest first, one paragraph per degree | `H2`, `Paragraphs`, probably a new `<DefinitionList>` or hanging-indent pattern |
| **Employment** | `collections/employment/*` | Timeline or vertical list | Chronological list, date + title on left, institution on right | Same as Education |
| **ResearchFunding** | `collections/funding/*` + date filter | Sortable/filterable table with totals | Table with date range, title/org, amount columns; grouped by role | Table vocabulary (cell widths, margins, borders) — already supported, this is the R5 mechanical-port validation |
| **Publications** | `collections/publications/*` + date filter + citation style | Grouped-by-type list with clickable DOIs, full HTML from `citestyle.formatAll` | Numbered list of plain-text entries with hanging indent, one per publication | **NEW: `<CitationList items={…} style={…}>`** wrapping citestyle; paragraph style + numbering config for hanging indents |
| **Teaching** | `collections/teaching/*` + date filter | Sortable table, enrollment chart | Table with code/title/term/enrollment columns | Same table vocabulary as ResearchFunding |
| **Service** | `collections/service/*` | Grouped list (department / university / external) | Same grouping as bulleted list | `Paragraphs` with `data-bullet-level`, maybe a group-heading pattern |
| **Awards** | `collections/awards/*` | Chronological list | Chronological list | Trivial — `H2`, `Paragraphs` |
| **Appendix** | tagged data blocks in `appendix.md` | Collapsed-by-default accordion | Each data block as its own subsection | `H3`, `Paragraphs`, `<TableOfContents>` reference |

The layout (`ReportLayout`) wraps the whole page in a `<DocumentProvider>`, renders a header with the download controls and the options panel, places the section children, and renders a footer with page-number fields (visible in the download only).

The specific builder components each section uses are decided per-slice — we don't pre-design the layout builder set. It's likely:

- `<Paragraph>`, `<Paragraphs>`, `<H1>`–`<H4>`, `<TextRun>`, `<Link>`, `<Image>`, `<List>` (all existing).
- **`<CitationList>`** (new) — the biggest win from citestyle integration, replaces the entire legacy Citation component pattern.
- **Maybe `<DefinitionList>`** — for Education/Employment/Service label-value layouts. Could also be expressed as a two-column table with existing primitives.
- **Maybe `<HangingParagraph>`** — if Publications doesn't get enough from paragraph style + numbering config alone.
- **`<TableOfContents>`** — beyond-legacy feature; cheap to add once we're there.

We don't ship `<TwoColumnLayout>`, `<TwoLevelIndent>`, `<ReversedOrderedList>`, or `<GroupItems>` preemptively. If a section needs one of those effects we build it inline with existing primitives and only extract a reusable builder if the pattern repeats.

## 5. Download-time options

The user customizes the download before clicking it. These options affect both the preview (since sections re-render when options change) and the compiled output.

### Options shape

```js
{
  dateRange: { start: '2020-01-01', end: '2025-12-31' },  // filters publications, funding, teaching
  citationStyle: 'apa',  // 'apa' | 'mla' | 'chicago' | 'vancouver' | 'ieee' — default apa
  includedSections: ['cover', 'education', 'publications', ...],  // default: all
  recipientName: 'Dr. Chair Name',  // for cover letter use cases
  recipientTitle: 'Department Chair',
  // additional tenant-specific fields go here
}
```

### Implementation

**A React context at the foundation level.** Not baked into Press — Press stays format-agnostic, and download options are a report-domain concept owned by the foundation. The foundation exports a small `<DocumentOptionsProvider>` wrapping the layout, a `<DocumentOptionsPanel>` for editing, and a `useDocumentOptions()` hook for reading. Section components that need filtering call the hook.

Flow:

1. User changes a filter (e.g., start date).
2. Context state updates.
3. Section components subscribed to the context re-render.
4. They re-run their filtering/sorting logic against `content.data` and the new options.
5. They register a fresh fragment via `useDocumentOutput`, overwriting the previous entry at the same block.
6. The preview updates automatically (normal React render).
7. When the user clicks Download, `compile('docx')` walks the *current* registrations. They reflect the current options.

This uses Press exactly as designed — the registration pattern is idempotent, so re-registering with new content is free. No Press changes needed.

### Why not in Press itself

Press doesn't own report-domain concepts like "citation style" or "date range." A generic Press provider couldn't know which fields a given foundation's report needs. Keeping options in the foundation also means different foundations can have totally different option schemas without Press getting in the way. The docusite pattern is a foundation-level convention; Press provides the registration primitive that makes it work.

### The download options form

A small React form component rendered alongside the download button. For the reference foundation, it's a panel with date pickers, a citation-style dropdown, and a checkbox list of sections. Foundations that want fewer or different options override or replace it.

The initial options come from URL query params (so a shareable URL restores state), from `localStorage` (so returning users don't start over), and from foundation defaults — in that order of precedence. Press doesn't care how the options arrive; it just sees section fragments updating.

## 6. Citations

citestyle everywhere. No `citation-js`. No `citeproc-js`. No runtime XML interpretation.

### Library

`citestyle` (unscoped npm package) — the one the Proximify team designed and published. Source at `~/Uniweb/csl`. Canonical API docs at `packages/citestyle/README.md`. The key function for this foundation is:

```js
import { formatAll } from 'citestyle'
import * as apa from 'citestyle/styles/apa'

const entries = formatAll(apa, items)
// → [{ html, text, parts, links }, ...]
```

One call returns an array where each entry is already separated, already has structured output. Compared to the legacy `citation-js` pattern — which returned a flat HTML string that had to be post-processed via `MutationObserver` to split into entries — this is dramatically simpler and smaller.

### Style selection

The citation style comes from `useDocumentOptions().citationStyle`. The Publications component lazy-imports the matching citestyle module by name:

```jsx
function Publications({ content, block }) {
    const { dateRange, citationStyle } = useDocumentOptions()
    const [style, setStyle] = useState(null)

    useEffect(() => {
        // Lazy import only the selected style — avoids bundling all styles.
        import(`citestyle/styles/${citationStyle}`).then(setStyle)
    }, [citationStyle])

    if (!style) return null

    const items = filterByDateRange(content.data.publications || [], dateRange)
    const entries = formatAll(style, items)
    // ... render preview + register docx
}
```

Default: APA. Styles pre-compiled by `citestyle`: `apa`, `mla`, `chicago-author-date`, `ieee`, `vancouver`, `harvard`, `ama`, `nature`, `science`. The dropdown lists all nine; users pick one.

### Preview and docx

Preview uses `entry.html` inside `<SafeHtml>` (from `@uniweb/kit`) for live DOIs, italicized journal titles, and CSS-class-driven styling. Docx uses `entry.text` inside `<Paragraph data={entry.text}>` — plain text with punctuation baked in by the style, suitable for a flat numbered list.

For numbered styles (IEEE, Vancouver), the docx uses numbering config with `data-numbering-reference` and `data-numbering-level`. For author-date styles (APA, MLA, Chicago, Harvard, …), the docx uses a hanging-indent paragraph style. Both mechanisms need the Press numbering/style pack landed (gap #3 from R5).

### Where citestyle helps beyond citations

The `parts` field returned by `formatAll` gives decomposed authors/year/title/container. If the preview wants a richer card layout (e.g., title on top line, venue on second line, year as a badge), it composes from `parts` instead of rendering `html` directly. The docx keeps using `text` because Word doesn't care about semantic structure. Two different layouts from the same source data — mode 3 from the Press concepts doc.

## 7. Theme

The site owns the theme (`theme.yml`), per Uniweb convention. The foundation ships an **example `theme.yml`** inside its package (not consumed at runtime — reference only) showing which tokens matter for reports and which the content author is expected to override per tenant.

Example reference `theme.yml`:

```yaml
colors:
  primary: '#00529b'       # University blue
  secondary: '#8e969c'
  accent: '#c8102e'
  neutral: slate

fonts:
  heading: "'Playfair Display', Georgia, serif"
  body: "'Source Sans Pro', system-ui, sans-serif"

contexts:
  light:
    section: '#fdfdfd'

vars:
  # Report-specific tokens (the foundation reads these):
  report-page-margin-top: '18mm'
  report-page-margin-bottom: '18mm'
  report-page-margin-left: '25mm'
  report-page-margin-right: '25mm'
  report-cover-padding-top: '4rem'
  report-body-font-size: '11pt'
  report-heading-font-size: '14pt'
```

The foundation's docx output reads these vars at compile time (in a content handler that runs before registrations) and passes them through to `compile('docx', { paragraphStyles, sectionProperties })`. This keeps per-tenant branding in the site, where it belongs.

Two example `theme.yml` variants ship alongside the test site — one sober (classic serif, navy + cream, the "formal Victorian" look suited to Darwin), one modern (sans-serif, primary-coloured accents) — to demonstrate that one foundation can serve multiple tenants through theme alone.

## 8. Modern primitives used

The foundation uses *only* modern infrastructure. Concretely:

| Concern | Modern primitive | Replaces legacy |
|---|---|---|
| Component shape | `function MySection({ content, params, block })` | `parseBlockContent(block)` + mutable `block.output`/`block.xlsx` |
| Data fetching | `content.data` populated from `data:` fetch config in `meta.js` or page frontmatter | `uniweb.useCompleteProfiles(...)` + hand-rolled `profile.at(path)` |
| Dynamic text | Loom expressions in markdown + foundation content handlers (`instantiateContent`) | `{placeholder}` strings resolved manually in component code |
| Registration | `useDocumentOutput(block, format, fragment)` | `block.output[format] = ...` |
| Compilation | `useDocumentCompile()` + `triggerDownload` | `<DownloadButton>` |
| Preview typography | `@uniweb/kit` — `H1`–`H6`, `P`, `Prose`, `Link`, `Visual` | Plain HTML tags + hand-rolled theme maps |
| Docx builders | `@uniweb/press/docx` — `H1`–`H4`, `Paragraph`, `Paragraphs`, `TextRun`, `Image`, `Link`, `List`, tables via `data-type` attributes | `@uniwebcms/report-sdk` React builders |
| Citations | `citestyle` — `formatAll`, `format`, `createRegistry` | `citation-js` + `MutationObserver` |
| Section wrapping | Uniweb runtime wraps each section in `<section>` automatically; customize with `Component.className` and `Component.as` | Legacy `<Section>` component |
| Download options | Foundation-level React context with `useDocumentOptions()` hook | `website.outputParams` / `website.reportDownloadOptions` |
| Theme | `site/theme.yml` with semantic tokens + palette shades | Hand-rolled Tailwind theme config per university |
| Framework registration | Vite + `@uniweb/runtime` + `@uniweb/build` + direct npm imports | Webpack + module federation + `@uniwebcms/module-sdk` |

None of the legacy infrastructure is carried forward.

## 9. Press feature gaps surfaced (just-in-time delivery)

From the R5 audit, the Press changes this foundation needs are:

- **Ship now (uncontroversial, needed before slice 1 lands):**
  1. Fix gap #2 — forward `node.style` in `irToParagraph` (one line).
  2. Scaffold `paragraphStyles` and `numbering` pass-through in `compile('docx', options)` (no-op unless used).
  3. Re-export `convertMillimetersToTwip`, `convertInchesToTwip`, `convertCentimetersToTwip` from the `docx` library at `@uniweb/press/docx`.

- **Ship when the slice needs it:**
  - Slice 4 (Publications): concrete `paragraphStyles` and `numbering` definitions for hanging-indent bibliography + numbered list. Lands as a "legacy style pack" doc guide with a copy-paste block, then possibly a small helper module the foundation imports.
  - Slice 6 (Appendix + TOC): `<TableOfContents>` builder. New file at `src/docx/TableOfContents.jsx`.
  - Slice 6 (page breaks): `data-page-break` and `data-section-type` attributes in `attributeMap`, plumbed through to the adapter's section options.
  - Slice 7 (download options): nothing — handled entirely in the foundation via React context.

- **Do not pre-build:** the six legacy `format` modes (`twoLevelIndentation`, `twoColumnLayout*`, `left-indentation`, `group-items`, `ordered-list-reversed`). If a slice turns out to need one of these specific layouts, we build only that one, as an inline pattern in the foundation first, and extract it to a builder only if it repeats.

The R5 audit has the full details of each gap.

## 10. Implementation plan — vertical slices

Each slice is a single PR or single commit. Each one adds end-to-end functionality for one or two sections, lands any Press changes it needs, and produces a visible output.

### Slice 0 — Press P1 fixes

Three small Press changes that land before any foundation code:

1. Fix gap #2 in `src/adapters/docx.js:irToParagraph` (one line).
2. Add `paragraphStyles` and `numbering` option pass-through in `compile('docx', options)` and the corresponding plumbing through `useDocumentCompile`.
3. Re-export three unit-conversion helpers at `@uniweb/press/docx`.

Plus tests for each. No visible foundation yet.

### Slice 1 — scaffold + Cover + PersonalInfo

1. Use the sandbox script to create a sandbox project based on one of the existing templates (probably `academic`, since it's closest to research reporting).
2. Rename it to `faculty-annual-report`, strip it down to a minimal foundation + site.
3. Add the first two section types — `Cover` and `PersonalInfo` — each with a React preview and a docx registration.
4. Add a minimal `ReportLayout` that wraps the page in a `<DocumentProvider>`, plus a crude download button (no options form yet).
5. Add the `collections/personal/darwin.md` file and wire `PersonalInfo` to read from it.
6. `pnpm dev` shows the report; clicking Download produces a two-page `.docx` with the cover and personal info.

Exit: visible output, valid docx, pipeline proven.

### Slice 2 — Education + Employment

1. Add `collections/education/` and `collections/employment/` with three items each.
2. Build the `Education` and `Employment` section types. Preview uses Kit; docx uses Press builders.
3. Evaluate whether the two sections would benefit from a shared `<DefinitionList>` (or similar) builder. If yes, build it — either inline in the foundation or as a new `src/docx/DefinitionList.jsx` depending on how generic it ends up. If no, leave it.

Exit: 4 sections, still no options form, still producing a valid growing docx.

### Slice 3 — ResearchFunding

1. Add `collections/funding/` with six items covering different role/source combinations.
2. Port the R5 audit's ResearchFunding mechanical translation into the foundation. Helpers (`mmToTwip`, `fmtCurrency`, `range`, …) live in `foundation/src/components/helpers.js`.
3. Verify the docx output is table-rich (borders, margins, cell widths).

Exit: 5 sections. First real exercise of Press's table attribute vocabulary. First place unit helpers are needed — validates slice 0.

### Slice 4 — Publications (citestyle integration)

1. Add `collections/publications/` with ~20 items in CSL-JSON shape.
2. Build the `Publications` section type:
   - Lazy-imports `citestyle/styles/apa` (and other styles — see slice 7).
   - Calls `formatAll(style, items)` once the style is loaded.
   - Preview: maps entries to `<SafeHtml value={entry.html}>` inside a typed list.
   - Docx: maps entries to `<Paragraph data={entry.text}>` with numbering-config attributes.
3. Ship the "legacy style pack" guide under `press/docs/guides/` with the paragraph style definitions needed for hanging-indent bibliographies and numbered citation lists.
4. Pass the style pack to `compile('docx', { paragraphStyles, numbering })` from the foundation.

Exit: 6 sections. First exercise of citestyle. First real exercise of `paragraphStyles` and `numbering` compile options.

### Slice 5 — Teaching + Service + Awards

Three smaller section types in one slice. Each is a straightforward list or table with no new Press features. Awards is nearly trivial; Teaching and Service both use simple data-row layouts (maybe reusing the slice-2 `DefinitionList` or slice-3 table pattern).

Exit: 9 sections.

### Slice 6 — Appendix + TOC + page breaks

1. Build `<TableOfContents>` as a new `src/docx/TableOfContents.jsx` — thin wrapper around the `docx` library's native TOC field.
2. Add `data-page-break` and `data-section-type` attributes to Press's `attributeMap`, plumb through to the docx adapter's section options.
3. Use both in the foundation's `ReportLayout`: TOC after the Cover, page breaks between major sections.
4. Add an `Appendix` section that renders tagged YAML data blocks from a single markdown file.

Exit: 10 sections. First beyond-legacy features.

### Slice 7 — download options form + citation style switcher

1. Build `<DocumentOptionsProvider>` and `useDocumentOptions()` as foundation-level helpers.
2. Build `<DocumentOptionsPanel>` — a simple form with date-range pickers, a citation-style dropdown (all 9 citestyle pre-compiled styles), and section checkboxes.
3. Wire every section that filters by date or citation style to read from the hook and re-register on change.
4. Verify the preview updates live as options change; verify the next `compile('docx')` reflects them.

Exit: report is now parameterizable at download time. First use of lazy-imported citestyle styles beyond APA.

### Slice 8 — theme polish + second theme variant

1. Polish the default `theme.yml` — real fonts, real colors, sensible margins.
2. Create a second variant (`theme-alternate.yml`) showing a visibly different branding.
3. Verify switching `site.yml` to the alternate theme changes the report's appearance end-to-end.

Exit: proves one foundation serves multiple tenants through theme alone.

### Slice 9 — visual review vs legacy

1. Generate the report against Charles Darwin with the default theme.
2. Generate a legacy report against the same data (if a legacy environment can be stood up — the R5 audit flagged this as blocked on setup; the backup plan is visual review of the modern output alone against a reference PDF of what a legacy report used to look like).
3. Classify every visible difference. Fix regressions, accept improvements.

Exit: modern output passes visual review.

### Slice 10 — migrate to templates package

1. Move the foundation from the sandbox into `framework/templates/faculty-annual-report/`.
2. Write a `template.json` manifest.
3. Add a minimal README describing the test CV + how to scaffold a real report.
4. Verify `npx uniweb create my-report --template faculty-annual-report` produces a working project.

Exit: shipped.

## 11. Acceptance criteria

- A user can run `uniweb add site` (or similar) from the `faculty-annual-report` template and get a working report site with a fictional CV.
- The rendered web version shows all 10 sections, reads correctly, and updates live when download options change.
- The downloaded `.docx` is valid, opens in Microsoft Word without errors, and contains all 10 sections in the correct order with correct content.
- At least two different theme variants visibly change the report's appearance.
- At least three citation styles produce visibly different bibliography output in both the preview and the docx.
- Date-range filtering visibly removes items from the preview and the docx.
- Visual review against a legacy reference (or a reference PDF) passes without significant regressions.
- The foundation ships as a template consumable via the modern CLI.

## 12. What this document is NOT

- **Not a Press architectural spec.** Press changes are tracked in their own commits and the restructure plan. Slice 0 is the only place Press gets touched in this project.
- **Not a per-section implementation spec.** Each slice decides its own component internals; this doc only fixes the inputs and outputs.
- **Not a legacy feature checklist.** R5's legacy audit has the complete inventory. Parity is a goal; feature-by-feature matching is not a requirement. If a legacy feature has no modern justification, we drop it.
- **Not a final naming commitment.** "docusite" as a term is a draft; Faculty Annual Report is the template name but the user-facing copy can evolve; Darwin is the test subject, chosen for fun and ease of verification.

## 13. Decisions (all resolved)

All eight open questions have been answered. Recorded here for the execution record.

1. **Template name:** `faculty-annual-report`. ✓
2. **Sandbox base:** **`starter`**, not `academic`. The docusite is a document-with-a-URL, not a general-purpose website. The heavy academic template would need to be stripped of nav, hero, marketing patterns, etc. — starting from `starter` (one generic `Section` type, two trivial pages) is cleaner. ✓
3. **Test subject:** **Charles Darwin**, using real historical data lightly anachronized to fit a modern faculty annual report. ✓
4. **Publications source:** **Real Charles Darwin works**, including his later plant studies (*Insectivorous Plants*, *Climbing Plants*, *Different Forms of Flowers*, *Power of Movement in Plants*, *Worms*) alongside the better-known *Origin*, *Descent*, *Journal of Researches*, etc. All fields in CSL-JSON. ✓
5. **Loom use:** **Yes** — the test CV exercises Loom in at least one section, preferably the Cover (counts and totals) or Publications (filter expressions). Demonstrates the docusite pattern composes cleanly with Loom upstream. ✓
6. **Options form placement:** **Popover from the Download button** (default); the panel is also exposed as a reusable component for foundations that want to place it elsewhere. ✓
7. **Downloaded file name:** **Computed** from personal name and date range. E.g., `charles-darwin-1859-1881.docx`. ✓
8. **`press/docs/projects/`** folder: **keep**. First file under this category; future forward-looking specs that aren't Press architectural designs land here too. ✓

Slice 0 — Press P1 changes — starts next.
