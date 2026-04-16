/**
 * Heading components (H1–H4). Each renders the corresponding HTML heading
 * element with data-type="paragraph" and data-heading="HEADING_N".
 *
 * Supports the `data` prop for styled string parsing (same as Paragraph).
 *
 * Maps to the `paragraph` IR node type with a `heading` property → docx
 * Paragraph with HeadingLevel.
 */
import { parseStyledString } from './parseStyledString.js'
import TextRun from './TextRun.jsx'

function Heading({ level, data, children, ...props }) {
    const Tag = `h${level}`

    if (data) {
        const parts = parseStyledString(data)

        return (
            <Tag data-type="paragraph" data-heading={`HEADING_${level}`} {...props}>
                {parts.map((part, i) =>
                    part.type === 'link' ? (
                        <a
                            key={i}
                            data-type="externalHyperlink"
                            data-link={part.href}
                            href={part.href}
                        >
                            <span data-type="text" data-style="Hyperlink">
                                {part.content}
                            </span>
                        </a>
                    ) : (
                        <TextRun
                            key={i}
                            bold={part.bold}
                            italics={part.italics}
                            underline={!!part.underline}
                        >
                            {part.content}
                        </TextRun>
                    )
                )}
            </Tag>
        )
    }

    return (
        <Tag data-type="paragraph" data-heading={`HEADING_${level}`} {...props}>
            {children}
        </Tag>
    )
}

export function H1(props) {
    return <Heading level={1} {...props} />
}
export function H2(props) {
    return <Heading level={2} {...props} />
}
export function H3(props) {
    return <Heading level={3} {...props} />
}
export function H4(props) {
    return <Heading level={4} {...props} />
}
