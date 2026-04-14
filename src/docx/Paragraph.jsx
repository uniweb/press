/**
 * Block-level text container with optional styled string parsing.
 *
 * - Without `data`: renders children directly with data-type="paragraph".
 * - With `data`: parses the HTML string for inline marks (<strong>, <em>, <u>)
 *   and renders as styled TextRun children.
 *
 * The `as` prop changes the rendered HTML element (default: <p>).
 *
 * Maps to the `paragraph` IR node type → docx Paragraph.
 */
import { parseStyledString } from './parseStyledString.js'
import TextRun from './TextRun.jsx'

export default function Paragraph({ as: Tag = 'p', data, children, ...props }) {
    if (data) {
        const parts = parseStyledString(data)

        return (
            <Tag data-type="paragraph" {...props}>
                {parts.map((part, i) => (
                    <TextRun
                        key={i}
                        bold={part.bold}
                        italics={part.italics}
                        underline={!!part.underline}
                    >
                        {part.content}
                    </TextRun>
                ))}
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
 * Render an array of paragraph strings. Convenience wrapper used by
 * the default Section component pattern.
 */
export function Paragraphs({ data, dataProps = {} }) {
    if (!data || !data.length) return null

    return data.map((paragraph, index) => (
        <Paragraph key={index} data={paragraph} {...dataProps} />
    ))
}
