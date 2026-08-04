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
 * Coerce a numeric attribute value to an integer.
 *
 * HTML attributes are always strings; numeric docx-library options that
 * flow through IR (e.g. EMU offsets on floating anchors) must be numbers,
 * or the library's type guards silently fall back to a different code
 * path — floating positioning, for example, treats a string `offset` as
 * missing and reverts to `align` instead. Unparseable values pass through
 * unchanged so non-numeric strings still reach the adapter's own
 * conversion layer.
 */
const toInt = (v) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : v
}

/**
 * Parse a comma-separated list of integers (whitespace tolerant).
 * Used by `data-table-column-widths`, where the attribute encodes an
 * array of twip values like "8504,2268,851,2268". Empty / non-numeric
 * tokens are dropped — downstream callers treat an empty array the
 * same as "no column widths declared".
 */
const parseIntList = (v) => {
    if (typeof v !== 'string') return v
    return v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n))
}

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
    'data-spacing-line': { path: ['spacing', 'line'] },
    'data-spacing-line-rule': { path: ['spacing', 'lineRule'] },

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

    // ------------------------------------------------------------------
    // Table-cell additions (Stage 1 of the press-professional-docx plan)
    // ------------------------------------------------------------------

    // Cell shading. `data-shading-fill` is the load-bearing attribute
    // (the solid background color). `data-shading-type` defaults to
    // 'clear' in the adapter so a plain fill JSX prop produces a solid
    // background without callers having to remember the OOXML idiom.
    'data-shading-fill': { path: ['shading', 'fill'] },
    'data-shading-color': { path: ['shading', 'color'] },
    'data-shading-type': { path: ['shading', 'type'] },

    // Vertical alignment of the cell's content. `top` | `center` | `bottom`.
    // Maps to docx's VerticalAlignTable enum at the adapter layer.
    'data-valign': { path: ['verticalAlign'] },

    // Cell column merge: how many adjacent columns this cell spans.
    'data-grid-span': { path: ['columnSpan'], transform: toInt },

    // Cell row merge: how many rows this cell spans (vertical merge).
    // The adapter uses docx's `rowSpan` shorthand, which expects only
    // the *starting* cell to declare a count; library handles the
    // merge-continue rows internally.
    'data-row-span': { path: ['rowSpan'], transform: toInt },

    // ------------------------------------------------------------------
    // Stage 3 — paragraph polish
    // ------------------------------------------------------------------

    // Paragraph indentation. All values are twips. `firstLine` and
    // `hanging` are positive; `left` and `right` may be negative.
    'data-indent-left': { path: ['indent', 'left'], transform: toInt },
    'data-indent-right': { path: ['indent', 'right'], transform: toInt },
    'data-indent-firstline': { path: ['indent', 'firstLine'], transform: toInt },
    'data-indent-hanging': { path: ['indent', 'hanging'], transform: toInt },

    // Paragraph tab stops. JSON-encoded array of TabStopDefinition objects:
    //   [{ position: 6804, type: 'right', leader: 'dot' }, …]
    // Position is in twips; type is left/right/center/decimal/etc;
    // leader is none/dot/hyphen/underscore/middleDot. Foundations
    // typically construct these via the <Paragraph tabStops=…> prop
    // and the unit helpers (cm, mm, inch, pt).
    // Paragraph-level named style ('Title', 'Heading1', 'Body', …).
    // Maps to `<w:pStyle w:val="…"/>` in the docx adapter. Distinct
    // from the run-level `data-style` (default fallthrough), which
    // emits `<w:rStyle>`.
    'data-paragraph-style': { path: ['paragraphStyle'] },

    // Paragraph bookmark target: when set, the docx adapter wraps the
    // paragraph's inline children in a Word Bookmark with this id, so
    // <Link href="..."> (InternalHyperlink) elsewhere in the document
    // can jump here. The adapter already handles `node.bookmark` (see
    // src/adapters/docx.js, irToParagraph); this entry is the missing
    // IR attribute mapping that wires React-side props through to it.
    'data-bookmark': { path: ['bookmark'] },

    'data-tab-stops': {
        path: ['tabStops'],
        transform: (v) => {
            if (typeof v !== 'string') return v
            try {
                const parsed = JSON.parse(v)
                return Array.isArray(parsed) ? parsed : v
            } catch {
                return v
            }
        },
    },

    // TextRun toggles — explicit map entries route the lower-case
    // HTML attribute names to camelCase IR fields the adapter reads.
    'data-smallcaps': { path: ['smallCaps'], transform: asTrue },
    'data-allcaps': { path: ['allCaps'], transform: asTrue },
    'data-strike': { path: ['strike'], transform: asTrue },
    'data-subscript': { path: ['subScript'], transform: asTrue },
    'data-superscript': { path: ['superScript'], transform: asTrue },

    // Row-level: whether the row repeats as a header on each new page
    // when the table breaks. Presence-only — any truthy value counts.
    'data-row-header': { path: ['tableHeader'], transform: asTrue },

    // ------------------------------------------------------------------
    // Table-level options (Stage 1)
    //
    // Stored under the prefixed `tableXxx` namespace so they don't
    // collide with the cell-level `width` / `borders` properties that
    // existed before. `irToTable` reads these on table-typed nodes.
    // ------------------------------------------------------------------

    // Column widths in twips. Emitted as a comma-separated string on
    // the `<table>` element by Table.jsx; parsed back to an int array
    // here. Used with `tableLayout: 'fixed'` to lock columns; without
    // a fixed layout, Word redistributes columns to fit content.
    'data-table-column-widths': {
        path: ['tableColumnWidths'],
        transform: parseIntList,
    },

    // 'fixed' | 'autofit'. Default in the adapter is 'fixed' when
    // tableColumnWidths is set, undefined otherwise (Word's default).
    'data-table-layout': { path: ['tableLayout'] },

    // Whole-table width. Distinct from per-cell width. Same { size, type }
    // shape (pct/dxa/auto) as cell widths.
    'data-table-width-size': { path: ['tableWidth', 'size'] },
    'data-table-width-type': { path: ['tableWidth', 'type'] },

    // Table-level default borders. Per-cell borders still win (and
    // already exist via `data-borders-*`); these set the table grid.
    'data-table-borders-top-style': { path: ['tableBorders', 'top', 'style'] },
    'data-table-borders-top-size': { path: ['tableBorders', 'top', 'size'] },
    'data-table-borders-top-color': { path: ['tableBorders', 'top', 'color'] },
    'data-table-borders-bottom-style': { path: ['tableBorders', 'bottom', 'style'] },
    'data-table-borders-bottom-size': { path: ['tableBorders', 'bottom', 'size'] },
    'data-table-borders-bottom-color': { path: ['tableBorders', 'bottom', 'color'] },
    'data-table-borders-left-style': { path: ['tableBorders', 'left', 'style'] },
    'data-table-borders-left-size': { path: ['tableBorders', 'left', 'size'] },
    'data-table-borders-left-color': { path: ['tableBorders', 'left', 'color'] },
    'data-table-borders-right-style': { path: ['tableBorders', 'right', 'style'] },
    'data-table-borders-right-size': { path: ['tableBorders', 'right', 'size'] },
    'data-table-borders-right-color': { path: ['tableBorders', 'right', 'color'] },
    'data-table-borders-insideh-style': { path: ['tableBorders', 'insideHorizontal', 'style'] },
    'data-table-borders-insideh-size': { path: ['tableBorders', 'insideHorizontal', 'size'] },
    'data-table-borders-insideh-color': { path: ['tableBorders', 'insideHorizontal', 'color'] },
    'data-table-borders-insidev-style': { path: ['tableBorders', 'insideVertical', 'style'] },
    'data-table-borders-insidev-size': { path: ['tableBorders', 'insideVertical', 'size'] },
    'data-table-borders-insidev-color': { path: ['tableBorders', 'insideVertical', 'color'] },

    'data-image-type': { path: ['imageType'] },

    'data-floating-horizontalposition-relative': {
        path: ['floating', 'horizontalPosition', 'relative'],
    },
    'data-floating-horizontalposition-align': {
        path: ['floating', 'horizontalPosition', 'align'],
    },
    'data-floating-horizontalposition-offset': {
        path: ['floating', 'horizontalPosition', 'offset'],
        transform: toInt,
    },
    'data-floating-verticalposition-relative': {
        path: ['floating', 'verticalPosition', 'relative'],
    },
    'data-floating-verticalposition-align': {
        path: ['floating', 'verticalPosition', 'align'],
    },
    'data-floating-verticalposition-offset': {
        path: ['floating', 'verticalPosition', 'offset'],
        transform: toInt,
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
