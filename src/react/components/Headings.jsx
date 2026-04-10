/**
 * Heading components (H1–H4). Each renders the corresponding HTML heading
 * element with data-type="paragraph" and data-heading="HEADING_N".
 *
 * Maps to the `paragraph` IR node type with a `heading` property → docx
 * Paragraph with HeadingLevel.
 */

function Heading({ level, children, ...props }) {
    const Tag = `h${level}`
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
