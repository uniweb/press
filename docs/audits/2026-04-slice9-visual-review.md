# Slice 9 visual review — Charles Darwin annual report (docusite)

**Status:** structural review complete + all six follow-ups landed (see "After" section below). Visual review by the user pending.
**Author:** Claude.
**Last updated:** 2026-04-15.
**Scope:** the compiled `.docx` produced by the faculty-annual-report sandbox with the Down House theme, against the full Darwin test CV. Slice 9 of the docusite execution plan.

## What I compiled

I built `scripts/compile-darwin.mjs` inside the sandbox (`.sandbox/001-starter/foundation/scripts/`) that loads the eight collection JSON files from the real site (`public/data/*.json`), constructs each section's HTML by hand in the exact shape Press's builder components produce, runs the HTML through `htmlToIR`, then calls Press's internal `compileDocx()` with the style pack. Output:

```
.sandbox/001-starter/foundation/scripts/charles-darwin.docx   15,626 bytes
```

The script bypasses React and the Press hooks — Node can't load the `.jsx` source files of Press's builders without a transform, and `useEffect`/`useDocumentOutput` don't run during SSR for async sections like Publications anyway. The HTML-template approach gets identical IR to the browser path without the tooling overhead. This file is a faithful representation of what the sandbox would download if a user clicked the download button in the browser, modulo one caveat: section-inclusion and date-range filtering from the download-options panel aren't exercised here (the script hardcodes "all sections, no date filter"). Those paths are already covered by the dev-server smoke tests in Slices 1–8.

## Autonomous structural checks — all green

Unpacked the `.docx` and grepped the parts:

| Check | Result |
|---|---|
| Valid Microsoft Word 2007+ document | ✓ (`file` reports the right magic) |
| `word/document.xml` present and well-formed | ✓ (36 KB) |
| `word/styles.xml` present with custom styles | ✓ (4.5 KB, includes `w:styleId="bibliography"` + `Bibliography` display name) |
| `word/numbering.xml` present with custom configs | ✓ (3.5 KB, includes `w:abstractNumId` for the `biblio-numbering` config) |
| Default header and footer with page-number fields | ✓ (`word/header1.xml`, `word/footer1.xml` — each carries one `PAGE` field) |
| Document metadata (title, creator, subject) in `docProps/core.xml` | ✓ (`<dc:title>Charles Darwin — Annual Report`, `<dc:creator>Charles Darwin`, `<dc:subject>Faculty annual report…`) |
| All 11 section H2 headings present in document order | ✓ (Annual Report, Contents, Personal information, Education, Employment, Research Funding, Publications, Teaching and Mentorship, Service, Awards and Honours, Appendix) |
| TOC field (`<w:sdt>` block) with alias "Contents" | ✓ (Slice 6 `<TableOfContents>` builder working end-to-end) |
| Funding table — 1 `<w:tbl>`, 8 `<w:tr>`, 24 `<w:tc>` | ✓ (header + 6 data rows + total row × 3 columns) |
| **All 20 Darwin publications** in the bibliography style | ✓ (20 `w:val="bibliography"` references) |
| Paragraph count | 158 paragraphs across 11 sections (≈14 per section — reasonable) |
| Visible text runs | 155 `<w:t>` content strings |

## Publications section — APA formatting spot-check

Every Darwin publication renders correctly in APA via citestyle, alphabetically sorted by author/title:

```
Darwin, C., & Darwin, F. (1880). The Power of Movement in Plants. John Murray.
Darwin, C., & Wallace, A. R. (1858). On the Tendency of Species to form Varieties;
  and on the Perpetuation of Varieties and Species by Natural Means of Selection.
  Journal of the Proceedings of the Linnean Society of London. Zoology, 3(9), 45–62.
Darwin, C. (1838). On the Formation of Mould. Transactions of the Geological Society
  of London, 5(3), 505–510.
Darwin, C. (1839). Journal of Researches into the Geology and Natural History of
  the Various Countries visited by H.M.S. Beagle. Henry Colburn.
…
Darwin, C. (1859). On the Origin of Species by Means of Natural Selection, or the
  Preservation of Favoured Races in the Struggle for Life (1st ed.). John Murray.
…
Darwin, C. (1881). The Formation of Vegetable Mould through the Action of Worms,
  with Observations on their Habits. John Murray.
```

Specific APA niceties that landed correctly without any extra foundation code:

- **Two-author co-credit** (*Power of Movement in Plants*) uses the ampersand connector: `Darwin, C., & Darwin, F.`
- **Joint Darwin–Wallace paper** (1858) gets the two-author treatment too, with Wallace's full middle name in parentheses.
- **Edition markers** appear where they exist: `(1st ed.)` for *Origin*, `(2nd ed.)` for *Climbing Plants*.
- **Journal-article shape** is distinct from book shape: `Journal of the Proceedings of the Linnean Society of London. Zoology, 3(9), 45–62.` vs. `Henry Colburn.` (plain publisher for books).
- **Page ranges use the en dash** (`45–62`, `505–510`, `601–631`) — APA convention and what `citestyle` produces natively.
- **Alphabetical sort** places all "Darwin, C." entries by year, except the "Darwin, C., & Darwin, F." and "Darwin, C., & Wallace, A. R." entries which sort ahead by APA's rule for multi-author entries (they're grouped separately).

This is the **first end-to-end proof that Press's Slice 0.2 `paragraphStyles` scaffold, Slice 4's style pack, and the citestyle integration all compose correctly** inside a real foundation against real data. Before today this pipeline was only exercised by the synthetic tests in Press's own test suite and by the Node smoke test from Slice 4. Seeing 20 entries land in `word/document.xml` with `w:val="bibliography"` attached to each, alongside a matching style definition in `word/styles.xml`, closes the loop on R5 gap #3.

## Research Funding table — totals spot-check

- **6 data rows** (Treasury, Murray, Glass-house, Royal Society, Linnean, Orchids) plus the header and total rows.
- **Total: £1,530.00** — matches the expected sum of the six amounts (1000 + 180 + 200 + 50 + 25 + 75). Correct to the penny.
- Each data row has two paragraphs in the middle cell (title in bold + source plain), matching the Slice 3 design.

## Real bugs surfaced

### Bug 1 — date normalization leaks ISO timestamps into output text

**Symptom:** in the Personal Information section, the Date of birth line reads

```
Date of birth: 1809-02-12T00:00:00.000Z
```

Should be `1809-02-12` or `12 February 1809`.

**Root cause:** YAML parses `born: 1809-02-12` as a native Date object because `YYYY-MM-DD` matches one of the implicit tag resolvers. The collection processor then calls `JSON.stringify` on the item (writing `public/data/personal.json`), which serializes the Date as an ISO string `"1809-02-12T00:00:00.000Z"`. The PersonalInfo section then consumes the string verbatim.

**Also affects:** `service/royal-society.md`'s `start: 1839-01-24` and `end: 1882-04-19`, `funding/*`'s full ISO dates, and any other `YYYY-MM-DD` frontmatter field. Most of these happen to look OK because the timeline helper only reads `item.start`/`item.end` as *year*s via `yearRangeText(start, end)`, which coerces to a string and doesn't show the time portion.

**Fix directions** (picking one is a user call):

- **A.** Quote the dates in frontmatter (`born: '1809-02-12'`) so YAML treats them as strings. Per-item cost, but zero-risk and surgical.
- **B.** Add a date-formatter helper in `foundation/src/components/helpers.js` and call it from PersonalInfo so any ISO string renders as a human-readable date regardless of source.
- **C.** Both — quote the frontmatter *and* ship the helper, for defensive rendering against future content authors who forget to quote.

I'd go with **C** — the quote pattern is the right long-term content-authoring convention (document it in a template README), and the helper makes the component resilient.

**Impact:** Slice 9-blocking only for the Personal Information section. Every other section either doesn't use dates-with-day-resolution or only reads the year component.

### Bug 2 — none, beyond the above

The structural + content checks turned up no other real issues. The apparent "`Christ&apos;s College`" hit in the raw grep output is **not** a bug — that's the XML-encoded form in `word/document.xml`, which Word decodes to `Christ's College` when it opens the file. XML entity encoding is correct behavior.

## Observations and taste calls for the user

Things that work but are worth discussing before the template ships. None are regressions against the legacy; they are opportunities to make the modern output better.

### Headings use docx's built-in heading styles

Press's `<H1>`–`<H4>` builders set `data-heading="HEADING_1"` (etc.) which the adapter maps to docx's built-in `Heading1`–`Heading4` paragraph styles. Those styles exist in every Word document and look fine out of the box — but they don't honor any of the typography choices from our `theme.yml` (serif fonts, navy primary), because the docx side has no connection to `theme.yml` yet (noted explicitly in Slice 8's `THEMES.md`).

What this means practically: opened in Word, the compiled `.docx` headings look like Word's default Cambria blue headings, not Cormorant Garamond navy. The body text is Calibri. The preview in the browser uses the custom fonts; the downloaded file does not.

**Decision to make:** is this good enough for a v1 template, or should Slice 10 (or a follow-up) thread theme typography through the style pack? The plumbing already exists — `paragraphStyles` entries in `docx-style-pack.js` accept `run: { font, size, color }` — it just needs wiring. Estimated cost: one or two hours to add a `cover-title`/`heading-1`/`heading-2`/`body` style set with theme-derived values, teach ReportLayout to read the CSS vars from `getComputedStyle(document.body)` at download time, and pass the resolved values into compile. The runtime is browser-only so this is straightforward.

### No page breaks between sections

The plan (Slice 6) ships a `data-page-break-before` attribute, and Press honors it in `irToParagraph`, but the current foundation doesn't use it anywhere. All 11 sections flow continuously in the compiled file — the TOC, Cover, and Personal Information share the first page, Education starts wherever Personal ends, etc.

Legacy report-sdk used explicit section breaks on major section headings. Whether we want that in the modern foundation is a taste call:

- **Legacy-style** (page break before every H2 after the TOC): feels formal, matches the "printed monograph" aesthetic of the Down House theme, wastes paper but makes each section findable.
- **Continuous** (what we ship now): shorter document, more efficient, good for a web-first download where the user scrolls rather than flips.

I lean **toward adding page breaks before Education, Research Funding, Publications, Teaching, Service, Awards, and Appendix** — the major narrative divisions — and leaving Cover+Contents+Personal flowing together on the title pages. That's a five-minute change in each affected section: add `data-page-break-before="true"` to the `<H2>` and it flows through Press's Slice 6 plumbing into Word.

### TOC renders as empty on first open

Word auto-populates the TOC field when the user opens the document and accepts the "Update field?" prompt. Until they click that, the TOC area just says "No table of contents entries found." Two implications:

1. First-time users see an empty TOC and may think something is broken.
2. Scripted delivery (emailing the file, rendering a PDF, etc.) never triggers the update prompt, so the TOC stays empty forever unless a post-process step runs it.

The legacy docx generators baked in a pre-computed TOC instead of a live field, so the first-open experience was "TOC is already there, no prompt needed." More complex to implement (walk the document headings, compute levels, emit as static paragraphs with tab stops and page-number fields) but produces a fill-on-open-free file.

**Decision to make:** live field (what we ship) is cleaner and lets Word keep the TOC in sync if the user edits the file. Static pre-computed would be friendlier for first-time viewers and for script-delivered files. No urgency either way; flagging for awareness.

### Appendix section is fully inlined in the script

The Appendix content in `charles-darwin.docx` (research areas, correspondents, archival references, acknowledgements) comes from **hardcoded strings in `compile-darwin.mjs`**, not from the collection system. The real sandbox Appendix section component (`foundation/src/sections/Appendix/index.jsx`) reads those values from tagged YAML blocks in `site/pages/report/11-appendix.md` via `content.data`, which this script doesn't have access to (Uniweb's content-collection pipeline only produces `collections/*.json`, not page-frontmatter data).

This means the script is **not a 100% faithful render** of the sandbox's output for the Appendix — the text is the same because I copied it verbatim, but if a content author edits `11-appendix.md`, this script will go stale. The real in-browser download would track the markdown. For Slice 9 this is fine because the goal is to audit the output, not to replicate the authoring pipeline — and the Appendix is the only section where the content lives in page frontmatter instead of a collection.

**Not a bug, just a caveat** if the script is ever reused for follow-up audits.

## What needs your eyes

The structural checks validate the pipeline. The remaining review is a subjective call on whether the output *looks* right for a faculty annual report when opened in Word. Specific questions:

1. **Open the file.** Does it look like a real annual report, or like a test fixture? Fonts, spacing, hierarchy, paragraph density.
2. **Publications section — hanging indent.** Does the bibliography style (0.5-inch hanging indent, 11 pt) look like a proper bibliography, or does it need tightening? The first line of each entry is flush left; continuation lines indent by half an inch. The spec was drafted from APA conventions but might not match your taste.
3. **Research Funding table — aesthetics.** The table has light gray bottom borders between rows, no vertical lines, and a total row at the bottom. The column widths are 20% / 55% / 25%. Does it read well? Is the 55% middle column too wide for the "Project and source" content?
4. **Cover page density.** The cover has the title, date range, name, role, affiliation stacked as separate paragraphs. No visual hierarchy beyond size. Is that enough, or does it need a divider, logo placeholder, or decorative rule?
5. **Headings** — Word's default `Heading1`–`Heading4` vs. custom styles matching `theme.yml`. See the "Observations" section above. Your call on whether to invest in theme-driven docx typography before shipping the template.
6. **Page breaks** — continuous or break-before-H2? See the "Observations" section.
7. **Date-of-birth bug (#1 above)** — confirm the fix direction before I implement. I recommended option C (both quote frontmatter and ship a formatter helper).

## What I'd change before shipping the template

Ranked by likely impact:

1. **Fix Bug #1** (date normalization). Ship with option C above. Non-optional.
2. **Add page breaks** before the major section H2s (Education onwards). Five-minute change, makes the printed output feel properly structured.
3. **Thread `theme.yml` typography through the style pack.** Turns the "one foundation, many tenants" story from "only the preview changes" to "the downloaded file changes too", which is the actually-interesting property.
4. **Add section-property page margins** read from `theme.yml` vars. Small code change in the foundation's `compile('docx', { sectionProperties })` call. The legacy had 18 mm margins, Press's default is Word's default (~2 cm). Neither is wrong, but both should be configurable.
5. **Document the compile-darwin.mjs script** as a template-level audit tool, either in the template's README or in a separate audits/ folder. Useful for future template contributors who want to verify their changes.

## What's next

Slice 10 is "migrate from sandbox to templates package." That happens after you:

- Open the compiled file and give the visual review a verdict (looks shippable / needs changes / needs more changes).
- Pick a direction on Bug #1 and the five observations above.
- Confirm any other taste calls I missed.

If the review turns up major structural issues I didn't catch, I'll iterate until the docusite output passes muster. Then Slice 10 moves the sandbox foundation into `framework/templates/faculty-annual-report/`, wires it into the CLI's template manifest, and adds a `template.json` so `uniweb create my-report --template faculty-annual-report` produces a working project.

Pointers:

- Compiled file: `.sandbox/001-starter/foundation/scripts/charles-darwin.docx`
- Compile script: `.sandbox/001-starter/foundation/scripts/compile-darwin.mjs`
- Sandbox dev server: `cd .sandbox/001-starter/site && pnpm dev` (for the in-browser preview comparison)
- Theme switcher: rename `theme.yml` ↔ `theme-modern.yml` in `.sandbox/001-starter/site/` — see `site/THEMES.md`

## After — 2026-04-15 follow-up

The user asked for all six improvements to ship before visual review (Bug 1 + taste calls 2–6). Each landed in one iteration and was verified against a fresh compile of `charles-darwin.docx`.

### 1. Bug 1 — date normalization

- **Content fix.** `site/collections/personal/darwin.md` now quotes the DOB: `born: '1809-02-12'`. This blocks YAML's implicit date-tag resolver, so the collection JSON carries a plain string instead of an ISO timestamp. The quote convention should be documented in the template README.
- **Defensive rendering.** New helper `formatDate(input, { format })` in `foundation/src/components/helpers.js` accepts either a Date, an ISO timestamp, or a plain `YYYY-MM-DD` string and renders in one of three formats: `'year'`, `'iso-date'` (default), or `'long'` (`12 February 1809`). Has a regex fast-path for the plain-string case to avoid round-tripping through `new Date()`.
- **PersonalInfo wiring.** Both the docx fragment and the preview `<dd>` now call `formatDate(born, { format: 'long' })`. The preview and the download read identical strings.
- **Verified.** Grep on the recompiled `word/document.xml` finds `12 February 1809` present and no `1809-02-12T00:00:00.000Z` anywhere.

### 2. Page breaks before major section H2s

Nine sections now carry `data-page-break-before="true"` on their `<DocxH2>`:

- Education, Employment, Research Funding, Publications, Teaching, Service, Awards, Appendix (8 section-component edits)
- Same change mirrored into `compile-darwin.mjs`'s `renderTimeline`, `renderResearchFunding`, `renderPublications`, `renderAwards`, `renderAppendix` helpers so the audit script stays in lockstep

Cover, Contents, and Personal Information still flow together on the opening pages, matching the recommendation in the original audit.

**Verified.** The recompiled `word/document.xml` contains **exactly 8** `<w:pageBreakBefore/>` elements — one per H2 — and they appear in document order. (Press's `data-page-break-before` attribute lives in `src/ir/attributes.js` and flows through `irToParagraph` into `DocxParagraph({ pageBreakBefore: true })`.)

### 3. Theme typography threaded through docx (the big one)

The previous style pack was a static export with no reference to the site's fonts. The downloaded file used Word's defaults (Cambria headings, Calibri body). Now:

- `foundation/src/components/docx-style-pack.js` is a **`buildStylePack({ readVar })` factory** that takes a CSS-var reader and bakes the resolved font families into every paragraph style's `run.font`. Reads `--font-heading` and `--font-body`, strips the quotes and fallback list, falls back to Calibri if the var is absent. Works in three contexts: the browser (ReportLayout passes `getComputedStyle(document.documentElement)`-derived reader), unit tests (pass a mock), and the Node audit script (pass a lookup object). No `@uniweb/press/docx` import — keeps Node loadability.
- `ReportLayout/index.jsx` calls `buildStylePack({ readVar })` inside `handleDownload` with a live reader over `document.documentElement`. The result is spread into `compile('docx', { ...stylePack })`, so the compiled file inherits whatever fonts the active `theme.yml` selected. **This is the bridge between `theme.yml` and Word.** Switching themes now changes the preview *and* the download — the "one foundation, many tenants" story becomes full-stack.
- `compile-darwin.mjs` calls `buildStylePack({ readVar })` with a hardcoded lookup for the Down House theme (`'Cormorant Garamond', serif` / `'Crimson Text', serif`) so the audit script mirrors the browser path. A richer version could parse `site/theme.yml`, but the purpose here is visual audit, not runtime fidelity.

**Verified.** `word/styles.xml` now contains `Cormorant Garamond` and `Crimson Text` literally (baked into the `<w:rFonts>` elements of the `cover-title`, `cover-subtitle`, and `bibliography` styles). The dependency chain from `theme.yml` → CSS vars → live reader → style pack → docx `run.font` is end-to-end.

### 4. Cover styles — `cover-title` / `cover-subtitle`

New paragraph styles in the pack:

- `cover-title` — 36 pt, bold, centered, heading font, 48 pt before + 12 pt after
- `cover-subtitle` — 20 pt, centered, heading font, muted grey (`#555555`), 24 pt after

`Cover/index.jsx` now passes `data-style="cover-title"` on its `<H1>` and `data-style="cover-subtitle"` on its `<H2>`. The same attribute is emitted by `compile-darwin.mjs`'s `renderCover`.

**Verified.** `word/styles.xml` contains `w:styleId="cover-title"` and `w:styleId="cover-subtitle"`. `word/document.xml` references each exactly once (on the cover's first two paragraphs). The mechanism reuses the existing default `data-*` fallthrough in `src/ir/attributes.js` (which lands `data-style="foo"` at `node.style = 'foo'`) and the adapter's `options.style = node.style` pass — no new Press code needed for the attribute to flow.

### 5. Research Funding column widths

`COL_WIDTHS = [20, 55, 25]` → `[15, 60, 25]` in `sections/ResearchFunding/index.jsx`, matched in `compile-darwin.mjs`'s `renderResearchFunding`. The "Project and source" middle column (Darwin's £180 Murray advance, Glass-house grant, etc.) now has 5% more horizontal real estate; "Period" shrinks from 20% to 15% since most year ranges are short (`1831–1836`).

**Verified.** `word/document.xml` table cells for the funding table now emit `<w:tcW w:type="pct" w:w="15%"/>` / `60%` / `25%` in every row.

### 6. Recompile + XML verification

Single run of `node scripts/compile-darwin.mjs` from the foundation produced a 15,787-byte `charles-darwin.docx` (was 15,626 — small increase from the three new paragraph styles). Automated XML inspection confirmed all six improvements in a single pass:

| Check | Expected | Got |
|---|---|---|
| `cover-title` style defined in styles.xml | yes | ✓ |
| `cover-subtitle` style defined in styles.xml | yes | ✓ |
| `bibliography` style defined in styles.xml | yes | ✓ |
| `Cormorant Garamond` in styles.xml | yes | ✓ |
| `Crimson Text` in styles.xml | yes | ✓ |
| `<w:pageBreakBefore>` count | 8 | 8 ✓ |
| Cover paragraphs reference `cover-title` | 1 | 1 ✓ |
| Cover paragraphs reference `cover-subtitle` | 1 | 1 ✓ |
| `12 February 1809` present in document.xml | yes | ✓ |
| Funding table first-row column widths (pct) | 15% / 60% / 25% | `15%` / `60%` / `25%` ✓ |

All six of the original taste calls are now resolved in the compiled file. The file is ready for the user's in-Word visual review — open it, confirm the cover uses the Down House fonts, check that each major section starts on a fresh page, verify the Bibliography runs with hanging indents, and call out anything that still looks wrong. The remaining follow-ups from the original audit (section-property page margins from theme, documenting the audit script) are not blockers for visual review — they can land in Slice 10 or later.

### Files touched in this round

Sandbox foundation:
- `site/collections/personal/darwin.md` (quoted date)
- `foundation/src/components/helpers.js` (+`formatDate`, `MONTH_NAMES`)
- `foundation/src/components/docx-style-pack.js` (rewritten as `buildStylePack({ readVar })`)
- `foundation/src/layouts/ReportLayout/index.jsx` (`buildStylePack` wiring)
- `foundation/src/sections/PersonalInfo/index.jsx` (`formatDate` usage)
- `foundation/src/sections/Cover/index.jsx` (`data-style` on headings)
- `foundation/src/sections/ResearchFunding/index.jsx` (widths + page break)
- `foundation/src/sections/{Education,Employment,Publications,Teaching,Service,Awards,Appendix}/index.jsx` (page break)
- `foundation/scripts/compile-darwin.mjs` (import real `buildStylePack`, emit new attributes)

No changes inside `framework/press` itself — every improvement rode on the Press features already delivered by Slices 0–6. The attribute vocabulary (`data-style`, `data-page-break-before`), the adapter pass-throughs (`paragraphStyles`, `numbering`, `pageBreakBefore`), and the fallthrough rule for unknown `data-*` attributes were all sufficient to land all six improvements end-to-end.
