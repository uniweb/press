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
 * contract: it takes `{ label, href }`, detects internal-vs-external, and
 * adds target/rel. This one takes a parsed part and always emits an external
 * hyperlink, matching what the builders did inline before.
 */
import TextRun from './TextRun.jsx'

/** `parts` is absent only for a hand-built part; fall back to the label. */
export function labelRuns(part) {
    return part.parts?.length ? part.parts : [{ content: part.content }]
}

export default function LinkPart({ part }) {
    return (
        <a data-type="externalHyperlink" data-link={part.href} href={part.href}>
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
