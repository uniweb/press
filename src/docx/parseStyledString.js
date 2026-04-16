/**
 * Parses a styled string with inline HTML marks (<strong>, <em>, <u>, <a>)
 * into an array of text/link part objects with style flags.
 *
 * Ported from legacy report-sdk/src/utils.js:116-186, extended to support
 * <a href="..."> hyperlinks so paragraphs with auto-linked emails and URLs
 * produce real hyperlinks in the docx output.
 *
 * @param {string} inputString - HTML string with inline marks.
 * @returns {Array<{type: string, content: string, bold?: boolean, italics?: boolean, underline?: object, href?: string}>}
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
 */
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
                const hrefMatch = attrs.match(/href="([^"]*)"/)
                const href = hrefMatch?.[1]
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

            const newStyles = { ...styles }
            if (tag === 'strong' || tag === 'b') newStyles.bold = true
            if (tag === 'em' || tag === 'i') newStyles.italics = true
            if (tag === 'u') newStyles.underline = {}

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
