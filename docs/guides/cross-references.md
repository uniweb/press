# Cross-references — bookmarks, internal hyperlinks, and footnotes

How to build a Word document that navigates itself: jump from one place to another, and surface supporting text at page bottoms. This guide covers three primitives that work together — `Bookmark` (via `data-bookmark` on `<Paragraph>`), the existing `<Link>` with an internal `href`, and `<FootnoteReference>` — plus the `<WebOnly>` escape hatch for when the browser and Word need different affordances for the same payload.

## Why this matters

A CV, a monograph, a long report — anything beyond a flyer — is more useful when the reader can navigate it. "See the bibliography entry" only means something if clicking it takes you there. "As argued earlier" is more convincing when the earlier argument is a Ctrl-click away. Word has built-in machinery for all of this: bookmarks, internal hyperlinks, and footnotes. Press's job is to expose that machinery as JSX primitives that behave sensibly on the web too, so one tree feeds both outputs.

## The building blocks

| Primitive | What it does | Use when |
|---|---|---|
| `<Paragraph data-bookmark="id">` | Emits a Word bookmark named `id` around the paragraph's inline children. No visible effect on the browser. | You want this paragraph to be a jump target. |
| `<Link data={{ href: '#id' }}>` | Emits a Word internal hyperlink pointing at bookmark `id`. Renders as an `<a>` in the browser. | You want readers to navigate here from elsewhere. |
| `<FootnoteReference>` | Emits a superscript reference in Word; the children become the footnote body typeset at the bottom of whichever page the reference lands on. Hidden in the browser by default. | You want a page-bottom note in Word but a different affordance (or none) on the web. |
| `<WebOnly>` | Wraps a subtree that renders in the browser and is dropped from the docx walker. | The web and docx channels need different content for the same intent. |

## Recipe 1 — a linked short bibliography

A block inset that lists three selected publications; each entry is a link that jumps to the matching entry in the full bibliography section. Web uses an in-page anchor; Word uses an internal hyperlink resolving to a bookmark.

**Publications section** — tag each entry with a bookmark so other components can link to it.

```jsx
import { Paragraph } from '@uniweb/press/docx'

// Inside Publications — one <li> per formatted entry.
<Paragraph
  data={entry.text}
  data-style="bibliography"
  data-bookmark={`ref-${entry.id}`}
/>
```

**KeyWorks inset** — each entry is a link.

```jsx
import { Paragraph, Link } from '@uniweb/press/docx'

// Inside KeyWorks — one <Paragraph> per picked publication.
<Paragraph data-style="bibliography">
  <Link data={{ label: entry.text, href: `#ref-${entry.id}` }} />
</Paragraph>
```

**In the browser**, the matching web-side render uses an ordinary `<a href="#ref-…">`; each bibliography `<li>` carries `id="ref-…"` so the anchor resolves. Nothing special needed on the Press side — the web render is plain JSX, and `data-bookmark` / the internal hyperlink only surface in the compiled docx.

## Recipe 2 — footnote for scholarly prose

Inside a paragraph of narrative prose, drop a `<FootnoteReference>` at the exact point where Word should place the superscript marker. The children become the footnote body.

```jsx
import { Paragraph, TextRun, FootnoteReference } from '@uniweb/press/docx'

<Paragraph>
  <TextRun>As argued in earlier work</TextRun>
  <FootnoteReference>
    <Paragraph data="Smith, J. (2024). A study of references. Journal of Examples, 12(3), 45–67." />
  </FootnoteReference>
  <TextRun>, this pattern is well-established.</TextRun>
</Paragraph>
```

On the browser, the `<FootnoteReference>` element renders with `display: none` — readers see the inline prose without the superscript. In the compiled docx, Word typesets the citation body at the bottom of whichever page the reference marker lands on.

### Things to know about FootnoteReference

- **Body children must be paragraphs.** Word's footnote part expects `Paragraph[]` only. If you pass raw `<TextRun>` or other inline content, Press wraps it for you, but the cleanest code supplies one or more `<Paragraph>` explicitly.
- **Ids are assigned automatically** and are document-level. Two references to the same authority become two separate footnotes; Press doesn't deduplicate. If you want shared footnotes for repeated references, do that in your component by re-using the same formatted body string.
- **Nothing surfaces in the browser by default.** If you want a web-side affordance for the same reference (a clickable superscript that jumps to a footnotes list, say), pair the `<FootnoteReference>` with a `<WebOnly>`-wrapped anchor — see Recipe 3.
- **Page placement is Word's call.** The marker is placed at the reference point; the body appears on whichever page Word paginates that marker onto. You don't choose the page.

## Recipe 3 — channel-asymmetric citations

When the best web experience and the best Word experience don't match, pair `<WebOnly>` with a docx-only primitive. Example: a CV where the web shows an inline linked citation but Word shows a proper footnote.

```jsx
import { Paragraph, TextRun, FootnoteReference, WebOnly } from '@uniweb/press/docx'

function Cite({ shortText, fullText, anchorId }) {
  return (
    <>
      <WebOnly>
        <a href={`#ref-${anchorId}`}>{shortText}</a>
      </WebOnly>
      <FootnoteReference>
        <Paragraph data={fullText} />
      </FootnoteReference>
    </>
  )
}
```

- **Web** renders the `<WebOnly>` subtree normally (`<span data-type="webOnly">` is just a span in the browser); the `<FootnoteReference>` is hidden via `display: none`. The reader sees `(Smith, 2024)` and can click through.
- **Docx** drops the `<WebOnly>` subtree entirely (the adapter special-cases `data-type="webOnly"`); the `<FootnoteReference>` emits a real Word footnote.

`<WebOnly>` works both inline and at block level — the adapter drops it in both `irToInlineChildren` and `irToSectionChildrenAsync`.

## Small limitations to know

- **No `<EndnoteReference>` yet.** Word endnotes are a distinct mechanism from footnotes; Press has not wired them. If you need endnotes, open an issue.
- **Bookmark names must be unique.** Word's loader tolerates duplicates inconsistently. Use stable ids (a kebab-case slug, a hash, a `crypto.randomUUID()`) — not indexes that could collide across sections.
- **Internal hyperlinks silently fail if the target bookmark is missing.** The compiled docx still opens, but the link in Word goes nowhere. When wiring up internal navigation, assert both sides exist in the same render pass.

## Where to read next

- Each primitive has a file-header docstring in `src/docx/` with usage examples.
- `tests/docx/index.test.js` has roundtrip tests (bookmark start/end emitted, footnotes part populated, `webOnly` subtree dropped) that are also reference examples for what the compiled XML looks like.
- For the full bibliography pattern that links to itself, the `cv-loom` template in the monorepo templates package wires Publications + KeyWorks end-to-end.
