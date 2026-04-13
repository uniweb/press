/**
 * Parses a styled string with inline HTML marks (<strong>, <em>, <u>, etc.)
 * into an array of text part objects with style flags.
 *
 * Ported from legacy report-sdk/src/utils.js:116-186.
 *
 * @param {string} inputString - HTML string with inline marks.
 * @returns {Array<{type: string, content: string, bold?: boolean, italics?: boolean, underline?: object}>}
 *
 * @example
 * parseStyledString('Hello <strong>World</strong>')
 * // => [
 * //   { type: 'text', content: 'Hello ' },
 * //   { type: 'text', content: 'World', bold: true }
 * // ]
 */
export function parseStyledString(inputString) {
    const createTextPart = (content, styles) => ({
        type: 'text',
        content,
        ...styles,
    })

    const processSegments = (string, styles = {}) => {
        const regexp = /<(\w+)>(.*?)<\/\1>/gs
        let result = []
        let lastIndex = 0

        if (!string) return [createTextPart('', styles)]

        string.replace(regexp, (match, tag, innerText, offset) => {
            const plainText = string.slice(lastIndex, offset)
            if (plainText) {
                result.push(createTextPart(plainText, styles))
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
