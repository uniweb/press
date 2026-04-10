/**
 * Block-level text container. Renders with data-type="paragraph" and
 * optional spacing, bullet, numbering attributes.
 *
 * The `as` prop lets you change the rendered HTML element (default: <p>).
 * This is useful when the semantic HTML element matters for accessibility
 * or preview styling (e.g., <h1>, <div>).
 *
 * Maps to the `paragraph` IR node type → docx Paragraph.
 */
export default function Paragraph({ as: Tag = 'p', children, ...props }) {
    return (
        <Tag data-type="paragraph" {...props}>
            {children}
        </Tag>
    )
}
