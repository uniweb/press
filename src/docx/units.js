/**
 * Unit conversions for docx authoring.
 *
 * docx expresses distances in twips — twentieths of a point, where
 * 1440 twips = 1 inch = 25.4 mm. This module exposes thin conversion
 * helpers so foundation code can write
 *
 *   data-margins-top={convertMillimetersToTwip(3)}
 *
 * instead of guessing magic numbers.
 *
 * These functions are local implementations — **not** re-exports
 * from the `docx` npm package. Re-exporting from `docx` would pull
 * the ~3.4 MB library into any bundle that imports `@uniweb/press/docx`,
 * defeating the lazy-loading contract. These are pure math — matching
 * the docx library's own formulas exactly — so consumers get bitwise
 * compatible values without the import cost.
 *
 * Formulas are frozen to match `docx@9.x`. If the docx library ever
 * revises its rounding rules, update these to match.
 */

/**
 * Convert millimeters to docx twips.
 *
 * Matches `docx`'s `convertMillimetersToTwip`: `Math.floor(mm / 25.4 * 1440)`.
 *
 * @param {number} millimeters
 * @returns {number}
 */
export function convertMillimetersToTwip(millimeters) {
    return Math.floor((millimeters / 25.4) * 1440)
}

/**
 * Convert inches to docx twips.
 *
 * Matches `docx`'s `convertInchesToTwip`: `Math.floor(inches * 1440)`.
 *
 * @param {number} inches
 * @returns {number}
 */
export function convertInchesToTwip(inches) {
    return Math.floor(inches * 1440)
}

/**
 * Convert centimeters to docx twips.
 *
 * Derived from `convertMillimetersToTwip`: 1 cm = 10 mm. docx itself
 * does not ship a centimeter helper, so this is Press-native.
 *
 * @param {number} centimeters
 * @returns {number}
 */
export function convertCentimetersToTwip(centimeters) {
    return convertMillimetersToTwip(centimeters * 10)
}

/**
 * Convert points to docx half-points.
 *
 * docx expresses font sizes in half-points (so 11 pt = 22). This helper
 * is a convenience so foundation code can write
 *
 *   run: { size: convertPointsToHalfPoints(11) }
 *
 * instead of remembering the doubling.
 *
 * @param {number} points
 * @returns {number}
 */
export function convertPointsToHalfPoints(points) {
    return Math.round(points * 2)
}
