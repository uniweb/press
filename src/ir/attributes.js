/**
 * Declarative mapping from semantic `data-*` attributes on HTML elements
 * to properties on IR nodes.
 *
 * Replaces the legacy switch statement at report-sdk/src/utils.js:223-410.
 *
 * Design:
 *
 * Each entry maps an attribute name to a descriptor:
 *
 *   { path: ['nested', 'path'], transform?: (value: string) => any }
 *
 * `path` is an array describing where the value lands in the properties
 * object. Intermediate objects are created on demand. `transform` is an
 * optional coercion applied to the raw string value — default is identity.
 *
 * Unknown `data-xxx` attributes fall through to a default rule that strips
 * the `data-` prefix and stores the raw value at the top level. This
 * preserves legacy behavior for `data-bold`, `data-italics`, `data-link`,
 * `data-anchor`, `data-heading`, and any other undocumented attributes
 * foundation code might emit.
 *
 * `data-type` is NOT in the map — it is consumed by the parser to determine
 * the IR node type and should never become a property on the node itself.
 */

/** Transform used by presence-only attributes like data-underline. */
const asEmptyObject = () => ({})

/** Transform used by boolean presence attributes like data-page-break-before. */
const asTrue = () => true

/**
 * Explicit attribute → IR path mapping. Entries are listed in the same
 * order as the legacy switch for ease of cross-reference.
 */
export const attributeMap = {
    'data-underline': { path: ['underline'], transform: asEmptyObject },

    'data-positionaltab-alignment': { path: ['positionalTab', 'alignment'] },
    'data-positionaltab-leader': { path: ['positionalTab', 'leader'] },
    'data-positionaltab-relativeto': { path: ['positionalTab', 'relativeTo'] },

    'data-spacing-before': { path: ['spacing', 'before'] },
    'data-spacing-after': { path: ['spacing', 'after'] },

    'data-transformation-width': { path: ['transformation', 'width'] },
    'data-transformation-height': { path: ['transformation', 'height'] },

    'data-bullet-level': { path: ['bullet', 'level'] },

    'data-numbering-reference': { path: ['numbering', 'reference'] },
    'data-numbering-level': { path: ['numbering', 'level'] },
    'data-numbering-instance': { path: ['numbering', 'instance'] },

    'data-alttext-title': { path: ['altText', 'title'] },
    'data-alttext-description': { path: ['altText', 'description'] },
    'data-alttext-name': { path: ['altText', 'name'] },

    'data-width-size': { path: ['width', 'size'] },
    'data-width-type': { path: ['width', 'type'] },

    'data-margins-top': { path: ['margins', 'top'] },
    'data-margins-bottom': { path: ['margins', 'bottom'] },
    'data-margins-left': { path: ['margins', 'left'] },
    'data-margins-right': { path: ['margins', 'right'] },

    'data-borders-top-style': { path: ['borders', 'top', 'style'] },
    'data-borders-top-size': { path: ['borders', 'top', 'size'] },
    'data-borders-top-color': { path: ['borders', 'top', 'color'] },
    'data-borders-bottom-style': { path: ['borders', 'bottom', 'style'] },
    'data-borders-bottom-size': { path: ['borders', 'bottom', 'size'] },
    'data-borders-bottom-color': { path: ['borders', 'bottom', 'color'] },
    'data-borders-left-style': { path: ['borders', 'left', 'style'] },
    'data-borders-left-size': { path: ['borders', 'left', 'size'] },
    'data-borders-left-color': { path: ['borders', 'left', 'color'] },
    'data-borders-right-style': { path: ['borders', 'right', 'style'] },
    'data-borders-right-size': { path: ['borders', 'right', 'size'] },
    'data-borders-right-color': { path: ['borders', 'right', 'color'] },

    'data-image-type': { path: ['imageType'] },

    'data-floating-horizontalposition-relative': {
        path: ['floating', 'horizontalPosition', 'relative'],
    },
    'data-floating-horizontalposition-align': {
        path: ['floating', 'horizontalPosition', 'align'],
    },
    'data-floating-horizontalposition-offset': {
        path: ['floating', 'horizontalPosition', 'offset'],
    },
    'data-floating-verticalposition-relative': {
        path: ['floating', 'verticalPosition', 'relative'],
    },
    'data-floating-verticalposition-align': {
        path: ['floating', 'verticalPosition', 'align'],
    },
    'data-floating-verticalposition-offset': {
        path: ['floating', 'verticalPosition', 'offset'],
    },

    // Page breaks — maps to DocxParagraph({ pageBreakBefore: true })
    // in the adapter. Presence attribute: any truthy value counts.
    'data-page-break-before': { path: ['pageBreakBefore'], transform: asTrue },

    // Table of contents options — consumed by the tableOfContents node
    // type in the adapter (src/adapters/docx.js). See docx library's
    // ITableOfContentsOptions for the full shape; these are the three
    // useful ones and any additional data-toc-* attribute falls through
    // to the default rule below.
    'data-toc-title': { path: ['toc', 'title'] },
    'data-toc-hyperlink': { path: ['toc', 'hyperlink'] },
    'data-toc-heading-range': { path: ['toc', 'headingRange'] },
}

/**
 * Set a nested path on an object, creating intermediate objects as needed.
 * Mirrors the legacy `obj = obj || {}` pattern.
 *
 * @param {Object} target - The object to mutate.
 * @param {string[]} path - Sequence of keys; last one receives the value.
 * @param {any} value - The value to set at the end of the path.
 */
export function setPath(target, path, value) {
    let cursor = target
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i]
        if (!cursor[key] || typeof cursor[key] !== 'object') {
            cursor[key] = {}
        }
        cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = value
}

/**
 * Apply the attribute map to a list of parsed attributes, producing a
 * properties object suitable for spreading onto an IR node.
 *
 * Skips `data-type` (consumed separately to determine node type) and any
 * non-`data-*` attribute. Unknown `data-*` attributes fall through to a
 * default rule (strip prefix, flat top-level property).
 *
 * @param {Array<{name: string, value: string}>} attributes
 * @returns {Object} Properties to merge into an IR node.
 *
 * @example
 * attributesToProperties([
 *   { name: 'data-type', value: 'tableCell' },
 *   { name: 'data-margins-top', value: '100' },
 *   { name: 'data-margins-bottom', value: '50' },
 *   { name: 'data-borders-top-style', value: 'single' },
 *   { name: 'class', value: 'pl-8' },
 * ])
 * // =>
 * // {
 * //   margins: { top: '100', bottom: '50' },
 * //   borders: { top: { style: 'single' } },
 * // }
 */
export function attributesToProperties(attributes) {
    const properties = {}

    for (const { name, value } of attributes) {
        if (!name.startsWith('data-') || name === 'data-type') continue

        const rule = attributeMap[name]
        if (rule) {
            const resolved = rule.transform ? rule.transform(value) : value
            setPath(properties, rule.path, resolved)
        } else {
            // Default fallthrough: strip `data-` prefix, flat top-level.
            // Preserves legacy behavior for data-bold, data-italics,
            // data-link, data-anchor, data-heading, etc.
            const key = name.slice('data-'.length)
            properties[key] = value
        }
    }

    return properties
}
