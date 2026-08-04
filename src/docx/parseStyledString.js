/**
 * Parses a styled string with inline HTML marks (<strong>, <em>, <u>, <a>,
 * <span data-type="math">) into an array of text / link / math part
 * objects with style flags.
 *
 * Ported from legacy report-sdk/src/utils.js:116-186, extended to support
 * <a href="..."> hyperlinks so paragraphs with auto-linked emails and URLs
 * produce real hyperlinks in the docx output, and <span data-type="math">
 * so inline math reaches the print adapters as a structured atom rather
 * than being walked as opaque DOM (which turns MathML into raw operator
 * text).
 *
 * @param {string} inputString - HTML string with inline marks.
 * @returns {Array<{type: string, content?: string, bold?: boolean, italics?: boolean, underline?: object, href?: string, latex?: string, display?: boolean}>}
 *
 * @example
 * parseStyledString('Hello <strong>World</strong>')
 * // => [
 * //   { type: 'text', content: 'Hello ' },
 * //   { type: 'text', content: 'World', bold: true }
 * // ]
 *
 * @example
 * parseStyledString('Visit <a href="https://example.com">Example</a>')
 * // => [
 * //   { type: 'text', content: 'Visit ' },
 * //   { type: 'link', content: 'Example', href: 'https://example.com' }
 * // ]
 *
 * @example
 * parseStyledString('Let $G$ be a graph')   // after semantic-parser wrapping
 * // input: 'Let <span data-type="math" data-latex="G" data-display="false">…mathml…</span> be a graph'
 * // => [
 * //   { type: 'text', content: 'Let ' },
 * //   { type: 'math', latex: 'G', display: false },
 * //   { type: 'text', content: ' be a graph' }
 * // ]
 */

// Decode HTML-attribute entities written by sequence.js's escapeAttr().
// Inverse of the four replacements there. `&amp;` last so a literal
// `&amp;quot;` round-trips correctly.
function decodeAttr(s) {
    return String(s)
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
}

function readAttr(attrs, name) {
    const re = new RegExp(`${name}="([^"]*)"`)
    const m = attrs.match(re)
    return m ? decodeAttr(m[1]) : null
}

export function parseStyledString(inputString) {
    const createTextPart = (content, styles) => ({
        type: 'text',
        content,
        ...styles,
    })

    const processSegments = (string, styles = {}) => {
        // Match both simple tags (<strong>...</strong>) and tags with
        // attributes (<a href="...">...</a>). The attribute capture is
        // optional so simple tags still work.
        const regexp = /<(\w+)(\s[^>]*)?>(.+?)<\/\1>/gs
        let result = []
        let lastIndex = 0

        if (!string) return [createTextPart('', styles)]

        string.replace(regexp, (match, tag, attrs, innerText, offset) => {
            const plainText = string.slice(lastIndex, offset)
            if (plainText) {
                result.push(createTextPart(plainText, styles))
            }

            // Handle <a> tags as links
            if (tag === 'a' && attrs) {
                const href = readAttr(attrs, 'href')
                if (href) {
                    result.push({
                        type: 'link',
                        content: innerText,
                        href,
                    })
                    lastIndex = offset + match.length
                    return
                }
            }

            // Handle <span data-type="math"> as an inline atom. The inner
            // text is the pre-compiled MathML — discarded here because
            // print adapters consume the LaTeX source instead. Browser-
            // side renderers don't go through parseStyledString; they use
            // dangerouslySetInnerHTML on the original paragraph HTML where
            // the MathML survives intact.
            if (tag === 'span' && attrs) {
                const dataType = readAttr(attrs, 'data-type')
                if (dataType === 'math') {
                    const latex = readAttr(attrs, 'data-latex') || ''
                    const display = readAttr(attrs, 'data-display') === 'true'
                    const id = readAttr(attrs, 'data-id')
                    result.push({
                        type: 'math',
                        latex,
                        display,
                        ...(id ? { id } : {}),
                    })
                    lastIndex = offset + match.length
                    return
                }
            }

            const newStyles = { ...styles }
            if (tag === 'strong' || tag === 'b') newStyles.bold = true
            if (tag === 'em' || tag === 'i') newStyles.italics = true
            if (tag === 'u') newStyles.underline = {}
            if (tag === 'sub') newStyles.subscript = true
            if (tag === 'sup') newStyles.superscript = true

            result = result.concat(processSegments(innerText, newStyles))
            lastIndex = offset + match.length
        })

        const remainingText = string.slice(lastIndex)
        if (remainingText) {
            result.push(createTextPart(remainingText, styles))
        }

        return result
    }

    if (typeof inputString !== 'string') {
        inputString = String(inputString ?? '')
    }

    return processSegments(inputString)
}
