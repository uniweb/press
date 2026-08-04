/**
 * Renders a `link` part from parseStyledString. INTERNAL helper — not in the
 * barrel, same as parseStyledString itself.
 *
 * A link's label is one or more styled runs rather than a string, because a
 * mark composes with an <a> from either side (`<strong><a>…</a></strong>`,
 * `<a><strong>…</strong></a>`) and a label can mix runs (`x<sup>2</sup>`).
 * Rendering each run through <TextRun> keeps the Hyperlink character style
 * alongside the mark instead of trading one for the other.
 *
 * Not to be confused with the public <Link> builder, which is a different
 * contract: it takes `{ label, href }` and adds target/rel. Both resolve an
 * in-document anchor the same way (see below).
 */
import TextRun from './TextRun.jsx'

/** `parts` is absent only for a hand-built part; fall back to the label. */
export function labelRuns(part) {
    return part.parts?.length ? part.parts : [{ content: part.content }]
}

export default function LinkPart({ part }) {
    const href = part.href || ''

    // An href starting with '#' is an in-document anchor, not a destination.
    // Emitting it as an external hyperlink produced a relationship to the
    // literal '#id' and no jump at all. The IR's anchor is a BARE bookmark
    // name — `data-bookmark="x"` becomes `<w:bookmarkStart w:name="x"/>` — so
    // the '#' is dropped here rather than shipped into `w:anchor`.
    const anchor = href.startsWith('#') ? href.slice(1) : null
    const linkAttrs = anchor
        ? { 'data-type': 'internalHyperlink', 'data-anchor': anchor }
        : { 'data-type': 'externalHyperlink', 'data-link': href }

    return (
        <a {...linkAttrs} href={href}>
            {labelRuns(part).map((run, i) => (
                <TextRun
                    key={i}
                    style="Hyperlink"
                    bold={run.bold}
                    italics={run.italics}
                    underline={!!run.underline}
                    subscript={run.subscript}
                    superscript={run.superscript}
                >
                    {run.content}
                </TextRun>
            ))}
        </a>
    )
}
