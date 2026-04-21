/**
 * Blockquote. Emits <blockquote data-type="blockQuote"> with children.
 * The adapter emits a Typst `#quote(block: true)[...]`.
 */
export default function BlockQuote({ children, ...props }) {
    return (
        <blockquote data-type="blockQuote" {...props}>
            {children}
        </blockquote>
    )
}
