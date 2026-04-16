/**
 * Caption — a Paragraph pre-configured with data-style="caption".
 *
 * Pairs with <Figure> for image captions but also stands alone for
 * table captions, map legends, plate descriptions, etc. The host
 * document's style pack should define a "caption" paragraph style —
 * typically italic, slightly smaller than body text, centered.
 *
 * When rendered inside a <Figure>, use `as="figcaption"` so the web
 * preview is semantically correct; the IR walker uses data-type to
 * classify the node, so the HTML tag is purely presentational.
 *
 * @param {Object} props
 * @param {string} [props.as='p'] - HTML element to render (e.g. 'p', 'figcaption').
 * @param {string} [props.data] - Inline-styled string (parses <strong>, <em>, <u>, <a>).
 * @param {React.ReactNode} [props.children] - Alternative to `data`.
 */
import Paragraph from './Paragraph.jsx'

export default function Caption({ as = 'p', data, children, className, ...props }) {
    return (
        <Paragraph
            as={as}
            data-style="caption"
            data={data}
            className={className}
            {...props}
        >
            {children}
        </Paragraph>
    )
}
