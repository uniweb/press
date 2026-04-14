/**
 * Inline text span. Renders <span data-type="text"> with optional
 * bold/italic/underline via data attributes.
 *
 * Maps to the `text` IR node type → docx TextRun.
 */
export default function TextRun({ children, bold, italics, underline, style, ...props }) {
    const dataProps = { 'data-type': 'text' }
    if (bold) dataProps['data-bold'] = 'true'
    if (italics) dataProps['data-italics'] = 'true'
    if (underline) dataProps['data-underline'] = 'true'
    if (style) dataProps['data-style'] = style

    return (
        <span {...dataProps} {...props}>
            {children}
        </span>
    )
}
