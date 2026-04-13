/**
 * Utility functions for document generation foundations.
 *
 * Ported from legacy report-sdk/src/utils.js.
 */

/**
 * Format a number as a US currency string.
 *
 * @param {string|number} text - The value to format.
 * @param {boolean} [withSymbol=true] - Include the $ symbol.
 * @returns {string}
 */
export function makeCurrency(text, withSymbol = true) {
    try {
        const number = parseFloat(String(text).replace(/,/g, ''))

        if (!isNaN(number)) {
            const formatter = new Intl.NumberFormat('en-US', {
                style: 'decimal',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
            return withSymbol ? `$${formatter.format(number)}` : formatter.format(number)
        }
        return withSymbol ? `$${text}` : String(text)
    } catch {
        return withSymbol ? `$${text}` : String(text)
    }
}

/**
 * Wrap text in parentheses. Returns empty string if falsy.
 */
export function makeParentheses(text) {
    return text ? `(${text})` : ''
}

/**
 * Create a range string "start - end". Falls back to single value.
 */
export function makeRange(start, end) {
    if (start && end) return `${start} - ${end}`
    return start || end || ''
}

/**
 * Join array elements with a separator.
 */
export function join(array, separator = ' ') {
    return array.filter(Boolean).join(separator)
}
