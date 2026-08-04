import {
    useDocumentTheme,
    resolveThemeColor,
    resolveThemeFont,
} from '../ThemeContext.js'

/**
 * Stage 6.1 safety net. If a Date object reaches a TextRun as a
 * child, coerce it to ISO YYYY-MM-DD before React's default
 * stringification produces "Sat Feb 28 2026 19:00:00 GMT-0500 …".
 *
 * The right way to render a date is via `<DateText value={…} format="…"/>`
 * from @uniweb/press/format, which gives the foundation control over
 * locale and format. This safety net is the floor: a careless
 * `<TextRun>{date}</TextRun>` produces a readable date instead of a
 * garbage timezone string — and avoids the React 19 "Objects are not
 * valid as a React child (found: Invalid Date)" runtime error.
 *
 * Walks one level of direct children. We can't use React.Children.map
 * here because it rejects Date objects upfront (only plain objects
 * are special-cased; Date counts as "object").
 */
function coerceDate(child) {
    if (!(child instanceof Date)) return child
    if (Number.isNaN(child.getTime())) return ''
    const y = child.getUTCFullYear()
    const m = String(child.getUTCMonth() + 1).padStart(2, '0')
    const d = String(child.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function coerceDateChildren(children) {
    if (children == null) return children
    if (Array.isArray(children)) return children.map(coerceDate)
    return coerceDate(children)
}

/**
 * Inline text span. Renders <span data-type="text"> with optional
 * bold/italic/underline + color/size/font via data attributes.
 *
 * Maps to the `text` IR node type → docx TextRun.
 *
 * @param {Object} props
 * @param {boolean} [props.bold]
 * @param {boolean} [props.subscript] - Render below the baseline (docx vertAlign).
 * @param {boolean} [props.superscript] - Render above the baseline (docx vertAlign).
 * @param {boolean} [props.italics]
 * @param {boolean} [props.underline]
 * @param {string} [props.color] - Hex color (with or without '#') or a
 *   theme key ('accent', 'body', 'muted', 'softBorder'). Theme keys
 *   resolve via the active <DocumentProvider theme={…}>; literals
 *   pass through after stripping any leading '#'.
 * @param {number} [props.size] - Font size in half-points (so 28pt = 56).
 *   Use the convertPointsToHalfPoints helper to keep the doubling
 *   intent visible in foundation code.
 * @param {string} [props.font] - Font family name (e.g. 'Calibri') or a
 *   theme key ('body', 'heading', 'mono').
 * @param {string} [props.style] - Named character/paragraph style.
 */
export default function TextRun({
    children,
    bold,
    italics,
    underline,
    color,
    size,
    font,
    smallCaps,
    allCaps,
    strike,
    subscript,
    superscript,
    style,
    role,
    ...props
}) {
    const theme = useDocumentTheme()
    const resolvedColor = resolveThemeColor(color, theme)
    const resolvedFont = resolveThemeFont(font, theme)
    // Stage 6.0: `role="Label"` references a named OOXML character
    // style. Maps to `data-style` (the existing run-style channel).
    // Inline overrides (color, size, bold, …) win over the style.
    const resolvedStyle = style ?? role
    const dataProps = { 'data-type': 'text' }
    if (bold) dataProps['data-bold'] = 'true'
    if (italics) dataProps['data-italics'] = 'true'
    if (underline) dataProps['data-underline'] = 'true'
    if (resolvedColor) dataProps['data-color'] = resolvedColor
    if (size != null) dataProps['data-size'] = size
    if (resolvedFont) dataProps['data-font'] = resolvedFont
    if (smallCaps) dataProps['data-smallcaps'] = 'true'
    if (allCaps) dataProps['data-allcaps'] = 'true'
    if (strike) dataProps['data-strike'] = 'true'
    if (subscript) dataProps['data-subscript'] = 'true'
    if (superscript) dataProps['data-superscript'] = 'true'
    if (resolvedStyle) dataProps['data-style'] = resolvedStyle

    return (
        <span {...dataProps} {...props}>
            {coerceDateChildren(children)}
        </span>
    )
}
