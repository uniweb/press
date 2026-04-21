/**
 * Heading component. Renders <hN> with data-type="heading" and
 * data-level="N" so the Typst IR walker can emit the corresponding
 * number of `=` characters (Typst headings: `= Level 1`, `== Level 2`, …).
 *
 * Supports the `data` prop for styled string parsing.
 */
import { parseStyledString } from '../docx/parseStyledString.js'
import TextRun from './TextRun.jsx'

export default function Heading({ level = 1, data, children, ...props }) {
    const clamped = Math.min(Math.max(level, 1), 6)
    const Tag = `h${clamped}`

    if (data) {
        const parts = parseStyledString(data)

        return (
            <Tag data-type="heading" data-level={clamped} {...props}>
                {parts.map((part, i) =>
                    part.type === 'link' ? (
                        <a
                            key={i}
                            data-type="link"
                            data-href={part.href}
                            href={part.href}
                        >
                            <span data-type="text">{part.content}</span>
                        </a>
                    ) : (
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
                )}
            </Tag>
        )
    }

    return (
        <Tag data-type="heading" data-level={clamped} {...props}>
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
export function H5(props) {
    return <Heading level={5} {...props} />
}
export function H6(props) {
    return <Heading level={6} {...props} />
}
