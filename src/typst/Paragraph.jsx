/**
 * Block-level text container with optional styled string parsing.
 *
 * - Without `data`: renders children directly with data-type="paragraph".
 * - With `data`: parses the HTML string for inline marks (<strong>, <em>,
 *   <u>, <code>) and hyperlinks (<a href="...">) and renders as styled
 *   children.
 *
 * The `as` prop changes the rendered HTML element (default: <p>).
 *
 * Maps to the `paragraph` IR node type → Typst paragraph (emitted as a
 * line of text with inline marks, followed by a blank line).
 */
import { parseStyledString } from '../docx/parseStyledString.js'
import TextRun from './TextRun.jsx'
import Math from './Math.jsx'

export default function Paragraph({ as: Tag = 'p', data, children, ...props }) {
    if (data) {
        const parts = parseStyledString(data)

        return (
            <Tag data-type="paragraph" {...props}>
                {parts.map((part, i) => {
                    if (part.type === 'link') {
                        // A link's label is one or more styled runs, so a mark
                        // on either side of the <a> survives. `parts` is absent
                        // only for a hand-built part; fall back to the label.
                        const runs = part.parts?.length
                            ? part.parts
                            : [{ content: part.content }]

                        return (
                            <a
                                key={i}
                                data-type="link"
                                data-href={part.href}
                                href={part.href}
                            >
                                {runs.map((run, j) => (
                                    <TextRun
                                        key={j}
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
                    if (part.type === 'math') {
                        return (
                            <Math
                                key={i}
                                latex={part.latex}
                                display={part.display}
                                id={part.id}
                            />
                        )
                    }
                    return (
                        <TextRun
                            key={i}
                            bold={part.bold}
                            italics={part.italics}
                            underline={!!part.underline}
                            code={part.code}
                        >
                            {part.content}
                        </TextRun>
                    )
                })}
            </Tag>
        )
    }

    return (
        <Tag data-type="paragraph" {...props}>
            {children}
        </Tag>
    )
}

/**
 * Render an array of paragraph strings.
 */
export function Paragraphs({ data, dataProps = {} }) {
    if (!data || !data.length) return null

    return data.map((paragraph, index) => (
        <Paragraph key={index} data={paragraph} {...dataProps} />
    ))
}
