/**
 * Parses a styled string with inline HTML marks (<strong>/<b>, <em>/<i>, <u>,
 * <sub>, <sup>, <a>, <span data-type="math">) into an array of text / link /
 * math part objects with style flags.
 *
 * Ported from legacy report-sdk/src/utils.js:116-186, extended to support
 * <a href="..."> hyperlinks so paragraphs with auto-linked emails and URLs
 * produce real hyperlinks in the docx output, and <span data-type="math">
 * so inline math reaches the print adapters as a structured atom rather
 * than being walked as opaque DOM (which turns MathML into raw operator
 * text).
 *
 * A `link` part carries `parts` — the styled runs making up its label — because
 * a mark composes with an <a> from either side (`<strong><a>…</a></strong>` or
 * `<a><strong>…</strong></a>`) and a label can mix runs (`x<sup>2</sup>`).
 * `content` remains the flat plain-text label for callers that only want a
 * string.
 *
 * @param {string} inputString - HTML string with inline marks.
 * @returns {Array<{type: string, content?: string, bold?: boolean, italics?: boolean, underline?: object, subscript?: boolean, superscript?: boolean, href?: string, parts?: Array<object>, latex?: string, display?: boolean}>}
 *
 * @example
 * parseStyledString('Hello <strong>World</strong>')
 * // => [
 * //   { type: 'text', content: 'Hello ' },
 * //   { type: 'text', content: 'World', bold: true }
 * // ]
 *
 * @example
 * parseStyledString('Visit <a href="https://example.com"><strong>Example</strong></a>')
 * // => [
 * //   { type: 'text', content: 'Visit ' },
 * //   {
 * //     type: 'link',
 * //     content: 'Example',
 * //     href: 'https://example.com',
 * //     parts: [{ type: 'text', content: 'Example', bold: true }]
 * //   }
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

            // Handle <a> tags as links.
            //
            // Marks compose with a link from both directions and both used to
            // be lost here, because this branch returned without consulting
            // the accumulated styles OR walking the body:
            //
            //   <strong><a href=…>x</a></strong>   outer mark -> dropped
            //   <a href=…><strong>x</strong></a>   inner mark -> survived as a
            //                                      LITERAL '<strong>x</strong>'
            //                                      string, which React escapes
            //                                      and Word then shows as
            //                                      visible tag text.
            //
            // Parsing the body with the accumulated styles fixes both: an
            // outer mark rides in via `styles`, an inner one is found by the
            // recursion, and a link can now carry mixed runs (`x<sup>2</sup>`).
            // `content` stays the flat plain-text label for callers that only
            // want a string; `parts` carries the styled runs.
            if (tag === 'a' && attrs) {
                const href = readAttr(attrs, 'href')
                if (href) {
                    // Text runs only. A link wrapping a non-text atom (inline
                    // math) is exotic, and neither builder can place one inside
                    // an <a> today; dropping it yields a clean text label
                    // rather than the raw markup that used to leak through.
                    const parts = processSegments(innerText, styles).filter(
                        (p) => p.type === 'text',
                    )

                    result.push({
                        type: 'link',
                        content: parts.map((p) => p.content).join(''),
                        href,
                        parts,
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
