/**
 * Block-level text container with optional styled string parsing.
 *
 * - Without `data`: renders children directly with data-type="paragraph".
 * - With `data`: parses the HTML string for inline marks (<strong>, <em>,
 *   <u>) and hyperlinks (<a href="...">) and renders as styled children.
 *
 * The `as` prop changes the rendered HTML element (default: <p>).
 *
 * Maps to the `paragraph` IR node type → docx Paragraph.
 */
import { parseStyledString } from './parseStyledString.js'
import TextRun from './TextRun.jsx'
import Math from './Math.jsx'

/**
 * Build the data-* attribute pairs for paragraph-level Stage-3 props.
 * Returns a plain object that gets spread onto the rendered element.
 */
function paragraphPolishProps({ tabStops, indent, role }) {
    const out = {}
    if (Array.isArray(tabStops) && tabStops.length) {
        out['data-tab-stops'] = JSON.stringify(tabStops)
    }
    if (indent && typeof indent === 'object') {
        // Lower-cased data-* keys to match the IR attribute map.
        if (indent.left != null) out['data-indent-left'] = indent.left
        if (indent.right != null) out['data-indent-right'] = indent.right
        if (indent.firstLine != null) out['data-indent-firstline'] = indent.firstLine
        if (indent.hanging != null) out['data-indent-hanging'] = indent.hanging
    }
    // Stage 6.0: <Paragraph role="Title"> attaches a named OOXML
    // paragraph style. Resolution to actual font/size/color happens
    // through theme.typography at compile time.
    if (typeof role === 'string' && role.length) {
        out['data-paragraph-style'] = role
    }
    return out
}

/**
 * Block-level text container with optional styled string parsing.
 *
 * - Without `data`: renders children directly with data-type="paragraph".
 * - With `data`: parses the HTML string for inline marks (<strong>, <em>,
 *   <u>) and hyperlinks (<a href="...">) and renders as styled children.
 *
 * @param {Object} props
 * @param {React.ElementType} [props.as='p'] - Element to render.
 * @param {string} [props.data] - HTML string with inline marks.
 * @param {Array<{position:number, type?:string, leader?:string}>} [props.tabStops]
 *   Stage 3: paragraph-level tab stops. Position is in twips; type defaults
 *   to 'left'; leader is 'none' (default), 'dot', 'hyphen', 'underscore',
 *   'middleDot'. Combine with `<Tab/>` (or `{'\t'}`) inside the paragraph
 *   children to align text on the stops.
 * @param {{left?:number,right?:number,firstLine?:number,hanging?:number}} [props.indent]
 *   Stage 3: paragraph indentation, in twips.
 */
export default function Paragraph({
    as: Tag = 'p',
    data,
    tabStops,
    indent,
    role,
    children,
    ...props
}) {
    const polish = paragraphPolishProps({ tabStops, indent, role })

    if (data) {
        const parts = parseStyledString(data)

        return (
            <Tag data-type="paragraph" {...polish} {...props}>
                {parts.map((part, i) => {
                    if (part.type === 'link') {
                        return (
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
                            subscript={part.subscript}
                            superscript={part.superscript}
                        >
                            {part.content}
                        </TextRun>
                    )
                })}
            </Tag>
        )
    }

    return (
        <Tag data-type="paragraph" {...polish} {...props}>
            {children}
        </Tag>
    )
}

/**
 * Inline tab marker. Emits a docx Tab element that interacts with the
 * parent paragraph's tabStops. JSX-friendly alternative to writing
 * `{'\t'}` literally (which React's whitespace handling can swallow).
 */
export function Tab(props) {
    return <span data-type="tab" {...props} />
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
