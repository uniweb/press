/**
 * Renders a `link` part from parseStyledString. INTERNAL helper — not in the
 * barrel, same as parseStyledString itself.
 *
 * A link's label is one or more styled runs rather than a string, because a
 * mark composes with an <a> from either side (`<strong><a>…</a></strong>`,
 * `<a><strong>…</strong></a>`) and a label can mix runs.
 *
 * The docx lane has its own copy: the two emit different `data-type` values
 * and their TextRuns accept different marks (this one takes `code`; the docx
 * one takes sub/superscript and a Hyperlink style). Parameterising one shared
 * component over those differences would need more knobs than either version
 * has lines.
 */
import TextRun from './TextRun.jsx'

/** `parts` is absent only for a hand-built part; fall back to the label. */
export function labelRuns(part) {
    return part.parts?.length ? part.parts : [{ content: part.content }]
}

export default function LinkPart({ part }) {
    return (
        <a data-type="link" data-href={part.href} href={part.href}>
            {labelRuns(part).map((run, i) => (
                <TextRun
                    key={i}
                    bold={run.bold}
                    italics={run.italics}
                    underline={!!run.underline}
                    code={run.code}
                >
                    {run.content}
                </TextRun>
            ))}
        </a>
    )
}
