/**
 * Internal xlsx format adapter.
 *
 * Takes the output of the compile pipeline (src/ir/compile.js) —
 * { sections: [{ title, headers, data, ...hints }, ...] } — and produces an
 * .xlsx Blob. An .xlsx is a zip of XML parts, so this writes the parts it needs
 * and zips them with jszip, the way the epub adapter writes its package.
 *
 * This module is internal. It is NOT listed in package.json's exports field;
 * consumers reach it only via the dynamic import in adapters/dispatch.js.
 *
 * Entry point: compileXlsx(compiledInput, options) → Promise<Blob>
 *
 * One registered block = one sheet. The `title` becomes the sheet tab name
 * (adjusted to Excel's rules). Optional per-sheet hints (columnWidths,
 * numberFormats, headerStyle, totals) let a foundation control the polish. The
 * shape is documented in docs/api/xlsx.md.
 *
 * A cell is a string, number, boolean, Date, null, or { formula, result? }. A
 * string is always text: `=1+1` in the data stays those four characters, and
 * only `totals` and an explicit { formula } make a formula.
 *
 * Invariants for a file Excel opens without a repair prompt. It reports any of
 * these only as "we found a problem with some content", so they are easy to
 * confuse, and nothing here throws when one is broken:
 *
 *   1. Elements come in schema order: in a sheet, sheetViews, sheetFormatPr,
 *      cols, sheetData, pageMargins, pageSetup; in styles, numFmts, fonts,
 *      fills, borders, cellStyleXfs, cellXfs, cellStyles.
 *   2. An empty container is left out, not written empty (`<cols/>` is refused).
 *   3. fills[0] is `none` and fills[1] is `gray125`; Excel reserves both.
 *   4. Text is valid XML 1.0 (no control characters, no lone surrogates) and at
 *      most 32,767 characters. A number is finite: `<v>NaN</v>` is refused.
 *   5. Sheet names are unique ignoring case, at most 31 characters, free of
 *      \ / ? * [ ] :, neither start nor end with an apostrophe, and are not
 *      `History`, which Excel reserves.
 *   6. Style values come from the format's own lists, so they are checked here
 *      rather than written and discovered there. A column is at most 255 wide.
 */

import JSZip from 'jszip'

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

// ============================================================================
// Public API
// ============================================================================

/**
 * Compile walker output into an .xlsx Blob ready for browser download.
 *
 * @param {Object} input - Output of compileOutputs(store, 'xlsx').
 * @param {Array<SheetSpec>} input.sections - One spec per registered block.
 * @param {Object} [options] - Workbook-level metadata and cross-sheet defaults.
 * @param {string} [options.title]
 * @param {string} [options.subject]
 * @param {string} [options.creator]
 * @param {string} [options.company]
 * @param {string} [options.description]
 * @param {string[]} [options.keywords]
 * @param {'a4'|'letter'} [options.paper] - The paper each sheet prints on. Unnamed,
 *   the file states none and the printer decides.
 * @returns {Promise<Blob>}
 */
export async function compileXlsx(input, options = {}) {
    const zip = new JSZip()
    for (const [path, xml] of Object.entries(buildParts(input, options))) {
        zip.file(path, xml, { createFolders: false })
    }
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return new Blob([bytes], { type: MIME })
}

/** The workbook's parts, path → XML, in the order they go in the zip. */
function buildParts(input, options) {
    const { sections = [] } = input
    const paper = paperSizeCode(options.paper)
    const styles = new Styles()
    const strings = new SharedStrings()

    const usedNames = new Set(RESERVED_SHEET_NAMES)
    const sheets = []
    sections.forEach((spec, i) => {
        if (!spec || !Array.isArray(spec.headers)) return
        const name = uniqueSheetName(spec.title, usedNames, i)
        usedNames.add(name.toLowerCase())
        sheets.push({ name, xml: sheetXml(spec, { styles, strings, paper, selected: sheets.length === 0 }) })
    })

    // An empty workbook is invalid. Emit one empty sheet so the file opens
    // cleanly even if no sections registered anything.
    if (sheets.length === 0) {
        sheets.push({ name: 'Sheet1', xml: sheetXml({ headers: [] }, { styles, strings, paper, selected: true }) })
    }

    const parts = {
        '[Content_Types].xml': contentTypesXml(sheets),
        '_rels/.rels': rootRelsXml(),
        'docProps/core.xml': corePropsXml(options),
        'docProps/app.xml': appPropsXml(options),
        'xl/workbook.xml': workbookXml(sheets),
        'xl/_rels/workbook.xml.rels': workbookRelsXml(sheets),
        'xl/styles.xml': styles.toXml(),
        'xl/sharedStrings.xml': strings.toXml(),
    }
    sheets.forEach((sheet, i) => {
        parts[`xl/worksheets/sheet${i + 1}.xml`] = sheet.xml
    })
    return parts
}

// The spreadsheet format's own codes for a paper (`ST_PaperSize`).
const PAPER_SIZES = { letter: 1, a4: 9 }

function paperSizeCode(paper) {
    if (paper === undefined || paper === null) return undefined
    const code = PAPER_SIZES[paper]
    if (code === undefined) {
        throw new Error(
            `compileXlsx: unknown paper "${paper}". Available: ${Object.keys(PAPER_SIZES).sort().join(', ')}`,
        )
    }
    return code
}

// ============================================================================
// A sheet
// ============================================================================

const DEFAULT_HEADER_STYLE = {
    font: { bold: true },
    fill: { fgColor: { argb: 'FFEEEEEE' } },
    border: { bottom: { style: 'medium', color: { argb: 'FF808080' } } },
    alignment: { vertical: 'middle' },
}

const TOTALS_STYLE = {
    font: { bold: true },
    border: { top: { style: 'thin', color: { argb: 'FF808080' } } },
}

const HEADER_ROW_HEIGHT = 20

function sheetXml(spec, { styles, strings, paper, selected }) {
    const { headers, data = [], columnWidths, numberFormats, headerStyle = true, totals } = spec
    const formats = headers.map((_, c) =>
        Array.isArray(numberFormats) ? resolveNumberFormat(numberFormats[c]) : undefined,
    )
    const totalsValues = totals ? totalsRow(headers, data, totals) : null

    const rows = []
    const addRow = (values, style, attrs = '') => {
        const r = rows.length + 1
        const cells = values
            .map((value, c) => cellXml(value, `${columnLetter(c + 1)}${r}`, style, formats[c], styles, strings))
            .join('')
        rows.push(`<row r="${r}"${attrs}>${cells}</row>`)
    }

    if (headerStyle === false || headers.length === 0) {
        addRow(headers)
    } else {
        const style = typeof headerStyle === 'object' ? { ...DEFAULT_HEADER_STYLE, ...headerStyle } : DEFAULT_HEADER_STYLE
        addRow(headers, style, ` ht="${HEADER_ROW_HEIGHT}" customHeight="1"`)
    }
    for (const row of data) addRow(Array.isArray(row) ? row : [])
    if (totalsValues) addRow(totalsValues, TOTALS_STYLE)

    const cols = headers.map((header, c) => {
        const n = c + 1
        const explicit = Array.isArray(columnWidths) ? columnWidths[c] : undefined
        const width =
            typeof explicit === 'number' && explicit >= 0
                ? Math.min(COLUMN_WIDTH_MAX, explicit)
                : computeAutoWidth(c, header, data, totalsValues, formats[c])
        const style = formats[c] ? ` style="${styles.add({ numFmt: formats[c] })}"` : ''
        return `<col min="${n}" max="${n}" width="${width}" customWidth="1"${style}/>`
    })

    const widest = Math.max(headers.length, ...data.map((row) => (Array.isArray(row) ? row.length : 0)))
    const dimension = widest > 0 ? `A1:${columnLetter(widest)}${rows.length}` : 'A1'

    return (
        `${XML_DECL}<worksheet xmlns="${MAIN_NS}">` +
        `<dimension ref="${dimension}"/>` +
        `<sheetViews><sheetView${selected ? ' tabSelected="1"' : ''} workbookViewId="0"/></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        (cols.length > 0 ? `<cols>${cols.join('')}</cols>` : '') +
        `<sheetData>${rows.join('')}</sheetData>` +
        `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
        (paper !== undefined ? `<pageSetup paperSize="${paper}"/>` : '') +
        `</worksheet>`
    )
}

function cellXml(value, ref, style, numFmt, styles, strings) {
    if (value === null || value === undefined) return ''

    const s = (extra) => {
        const id = styles.add({ ...style, ...(numFmt ? { numFmt } : {}), ...extra })
        return id ? ` s="${id}"` : ''
    }

    if (typeof value === 'string') return `<c r="${ref}"${s()} t="s"><v>${strings.add(value)}</v></c>`
    if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s()}><v>${value}</v></c>` : ''
    if (typeof value === 'boolean') return `<c r="${ref}"${s()} t="b"><v>${value ? 1 : 0}</v></c>`
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return ''
        // A date is a number with a date format; unnamed, Excel's locale-aware short date.
        return `<c r="${ref}"${s(numFmt ? {} : { numFmt: DEFAULT_DATE_FORMAT })}><v>${excelSerial(value)}</v></c>`
    }
    if (typeof value === 'object' && typeof value.formula === 'string') {
        return formulaCellXml(value, ref, s(value.numFmt ? { numFmt: value.numFmt } : {}))
    }

    const held = typeof value === 'object' ? JSON.stringify(value) : String(value)
    throw new Error(
        `compileXlsx: cell ${ref} holds ${held}. A cell is a string, number, boolean, Date, null, or { formula, result? }.`,
    )
}

// The cached result is what a reader that does not calculate shows: a preview
// pane, a phone, a mail client. Excel recalculates on load (see workbookXml).
function formulaCellXml({ formula, result }, ref, s) {
    const f = `<f>${escapeXml(cleanText(formula.replace(/^=/, '')))}</f>`
    if (typeof result === 'number' && Number.isFinite(result)) return `<c r="${ref}"${s}>${f}<v>${result}</v></c>`
    if (typeof result === 'boolean') return `<c r="${ref}"${s} t="b">${f}<v>${result ? 1 : 0}</v></c>`
    if (typeof result === 'string' && result.startsWith('#')) return `<c r="${ref}"${s} t="e">${f}<v>${escapeXml(result)}</v></c>`
    if (typeof result === 'string') return `<c r="${ref}"${s} t="str">${f}<v>${escapeXml(cleanText(result))}</v></c>`
    return `<c r="${ref}"${s}>${f}</c>`
}

// Days since 1899-12-30, the epoch that absorbs Excel's phantom 1900-02-29.
function excelSerial(date) {
    return 25569 + date.getTime() / 86400000
}

// ============================================================================
// Column widths
// ============================================================================

const COLUMN_WIDTH_MAX = 255

function computeAutoWidth(colIndex, header, data, totalsValues, format) {
    const MIN = 8
    const MAX = 60
    const PADDING = 2

    let longest = String(header ?? '').length
    for (const row of data) {
        if (Array.isArray(row)) longest = Math.max(longest, displayLength(row[colIndex], format))
    }
    if (totalsValues) longest = Math.max(longest, displayLength(totalsValues[colIndex], format))
    return Math.min(MAX, Math.max(MIN, longest + PADDING))
}

// How wide a value reads, near enough to size a column. Too narrow, and Excel
// shows ##### in place of a number or a date.
function displayLength(value, format) {
    if (value == null) return 0
    if (value instanceof Date) return format ? format.length : 10
    if (typeof value === 'number') return numberDisplayLength(value, format)
    if (typeof value === 'boolean') return value ? 4 : 5
    if (typeof value === 'object') return displayLength(value.result, format)
    return String(value).length
}

function numberDisplayLength(value, format) {
    const shape = format ? numberShape(format) : null
    if (!shape?.formatter) return String(value).length
    return shape.formatter.format(shape.percent ? value * 100 : value).length + shape.extra
}

// What a format does to a number's width. Kept per format because a sheet asks
// once per cell, and building a formatter each time is most of the cost of a
// large sheet.
const NUMBER_SHAPES = new Map()

function numberShape(format) {
    let shape = NUMBER_SHAPES.get(format)
    if (shape) return shape

    const section = format.split(';')[0]
    const percent = section.includes('%')
    const decimals = section.match(/\.(0+)/)?.[1].length ?? 0
    const literals = (section.match(/"[^"]*"/g) ?? []).join('').replace(/"/g, '')
    shape = {
        percent,
        extra: literals.length + (percent ? 1 : 0),
        formatter: /[0#]/.test(section)
            ? new Intl.NumberFormat('en-US', {
                  useGrouping: section.includes(','),
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
              })
            : null,
    }
    NUMBER_SHAPES.set(format, shape)
    return shape
}

// ============================================================================
// Totals row
// ============================================================================

function totalsRow(headers, data, totals) {
    const firstDataRow = 2
    const lastDataRow = firstDataRow + data.length - 1

    // `totals: true` → auto totals: SUM on every numeric-looking column, empty
    // elsewhere. A column is "numeric-looking" if every non-nullish cell in it
    // is a number.
    const spec = totals === true ? autoTotalsSpec(headers, data) : totals
    if (!Array.isArray(spec)) return null

    return headers.map((_, c) => {
        const instruction = spec[c]
        if (instruction == null) return null
        if (typeof instruction !== 'string') return instruction
        const lower = instruction.toLowerCase()
        if (lower !== 'sum' && lower !== 'avg' && lower !== 'count') return instruction
        if (lastDataRow < firstDataRow) return 0
        const col = columnLetter(c + 1)
        const fn = lower === 'avg' ? 'AVERAGE' : lower === 'count' ? 'COUNT' : 'SUM'
        return {
            formula: `${fn}(${col}${firstDataRow}:${col}${lastDataRow})`,
            result: aggregate(fn, data, c),
            // A count is a count, whatever its column holds: in a date column
            // the column's format would show three rows as 1900-01-03.
            ...(fn === 'COUNT' ? { numFmt: '0' } : {}),
        }
    })
}

// What the formula evaluates to. Excel's ranges count numbers and dates, and
// skip text, booleans and blanks.
function aggregate(fn, data, c) {
    const numbers = []
    for (const row of data) {
        const v = Array.isArray(row) ? row[c] : undefined
        if (typeof v === 'number' && Number.isFinite(v)) numbers.push(v)
        else if (v instanceof Date && !Number.isNaN(v.getTime())) numbers.push(excelSerial(v))
        else if (typeof v?.result === 'number' && Number.isFinite(v.result)) numbers.push(v.result)
    }
    if (fn === 'COUNT') return numbers.length
    const sum = numbers.reduce((total, n) => total + n, 0)
    if (fn === 'SUM') return sum
    return numbers.length > 0 ? sum / numbers.length : '#DIV/0!'
}

function autoTotalsSpec(headers, data) {
    const spec = new Array(headers.length).fill(null)
    for (let c = 0; c < headers.length; c++) {
        let allNumeric = true
        let sawAny = false
        for (const row of data) {
            if (!Array.isArray(row)) continue
            const v = row[c]
            if (v == null) continue
            sawAny = true
            if (typeof v !== 'number') {
                allNumeric = false
                break
            }
        }
        if (sawAny && allNumeric) spec[c] = 'sum'
    }
    if (spec[0] == null) spec[0] = 'Total'
    return spec
}

// ============================================================================
// Styles
// ============================================================================

const NUMBER_FORMAT_KEYWORDS = {
    text: '@',
    number: '#,##0',
    integer: '#,##0',
    decimal: '#,##0.00',
    currency: '#,##0.00',
    percent: '0.0%',
    date: 'yyyy-mm-dd',
    datetime: 'yyyy-mm-dd hh:mm',
}

function resolveNumberFormat(hint) {
    if (typeof hint !== 'string' || !hint) return undefined
    return NUMBER_FORMAT_KEYWORDS[hint.toLowerCase()] || hint
}

const DEFAULT_DATE_FORMAT = 'mm-dd-yy'

// The ids every reader knows without being told. Others are declared from 164.
const BUILT_IN_FORMATS = {
    0: 1,
    '0.00': 2,
    '#,##0': 3,
    '#,##0.00': 4,
    '0%': 9,
    '0.00%': 10,
    [DEFAULT_DATE_FORMAT]: 14,
    '@': 49,
}
const FIRST_CUSTOM_FORMAT = 164

const STYLE_KEYS = ['font', 'fill', 'border', 'alignment', 'numFmt']
const FONT_KEYS = ['bold', 'italic', 'underline', 'strike', 'size', 'name', 'color']
const FILL_KEYS = ['type', 'pattern', 'fgColor', 'bgColor']
const BORDER_SIDES = ['left', 'right', 'top', 'bottom']
const BORDER_STYLES = [
    'thin', 'medium', 'thick', 'hair', 'dotted', 'dashed', 'dashDot', 'dashDotDot', 'double',
    'mediumDashed', 'mediumDashDot', 'mediumDashDotDot', 'slantDashDot',
]
const ALIGNMENT_KEYS = ['vertical', 'horizontal', 'wrapText']
const VERTICAL_ALIGNMENTS = ['top', 'middle', 'center', 'bottom', 'justify', 'distributed']
const HORIZONTAL_ALIGNMENTS = ['left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed']

function refuseUnknownKeys(what, value, known) {
    for (const key of Object.keys(value)) {
        if (!known.includes(key)) {
            throw new Error(`compileXlsx: ${what} has no "${key}". Available: ${known.join(', ')}`)
        }
    }
}

function refuseUnlessOneOf(what, value, allowed) {
    if (!allowed.includes(value)) {
        throw new Error(`compileXlsx: ${what} cannot be "${value}". Available: ${allowed.join(', ')}`)
    }
}

function argbOf(color) {
    if (!/^[0-9A-Fa-f]{8}$/.test(color?.argb ?? '')) {
        throw new Error(`compileXlsx: a color is { argb: 'AARRGGBB' }, not ${JSON.stringify(color)}`)
    }
    return color.argb
}

function fontXml(font = {}) {
    refuseUnknownKeys('a font', font, FONT_KEYS)
    const { bold, italic, underline, strike, size = 11, name = 'Calibri', color } = font
    if (typeof size !== 'number' || size < 1 || size > 409) {
        throw new Error(`compileXlsx: a font size is a number from 1 to 409, not ${JSON.stringify(size)}`)
    }
    return (
        `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}${strike ? '<strike/>' : ''}${underline ? '<u/>' : ''}` +
        `<sz val="${size}"/>${color ? `<color rgb="${argbOf(color)}"/>` : ''}` +
        `<name val="${escapeXml(cleanText(String(name)))}"/><family val="2"/></font>`
    )
}

function fillXml(fill) {
    refuseUnknownKeys('a fill', fill, FILL_KEYS)
    const { type = 'pattern', pattern = 'solid', fgColor } = fill
    refuseUnlessOneOf('a fill type', type, ['pattern'])
    refuseUnlessOneOf('a fill pattern', pattern, ['solid'])
    return `<fill><patternFill patternType="solid"><fgColor rgb="${argbOf(fgColor)}"/><bgColor indexed="64"/></patternFill></fill>`
}

function borderXml(border = {}) {
    refuseUnknownKeys('a border', border, BORDER_SIDES)
    const sides = BORDER_SIDES.map((side) => {
        const edge = border[side]
        if (!edge) return `<${side}/>`
        refuseUnlessOneOf('a border style', edge.style, BORDER_STYLES)
        return `<${side} style="${edge.style}">${edge.color ? `<color rgb="${argbOf(edge.color)}"/>` : ''}</${side}>`
    })
    return `<border>${sides.join('')}<diagonal/></border>`
}

function alignmentXml(alignment) {
    refuseUnknownKeys('an alignment', alignment, ALIGNMENT_KEYS)
    const { vertical, horizontal, wrapText } = alignment
    if (vertical) refuseUnlessOneOf('a vertical alignment', vertical, VERTICAL_ALIGNMENTS)
    if (horizontal) refuseUnlessOneOf('a horizontal alignment', horizontal, HORIZONTAL_ALIGNMENTS)
    const attrs = [
        horizontal ? `horizontal="${horizontal}"` : '',
        // `middle` is what people call it; the format calls it `center`.
        vertical ? `vertical="${vertical === 'middle' ? 'center' : vertical}"` : '',
        wrapText ? 'wrapText="1"' : '',
    ].filter(Boolean)
    return `<alignment ${attrs.join(' ')}/>`
}

function indexIn(list, item) {
    const at = list.indexOf(item)
    return at !== -1 ? at : list.push(item) - 1
}

class Styles {
    constructor() {
        this.fonts = [fontXml()]
        this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
        this.borders = [borderXml()]
        this.numFmts = []
        this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
        this.known = new Map([['{}', 0]])
    }

    /** The cellXfs index of a style, adding it the first time it is seen. */
    add(style = {}) {
        const key = JSON.stringify(style)
        const known = this.known.get(key)
        if (known !== undefined) return known

        refuseUnknownKeys('a style', style, STYLE_KEYS)
        const { font, fill, border, alignment, numFmt } = style
        const attrs =
            `numFmtId="${numFmt ? this.numFmtId(numFmt) : 0}"` +
            ` fontId="${font ? indexIn(this.fonts, fontXml(font)) : 0}"` +
            ` fillId="${fill ? indexIn(this.fills, fillXml(fill)) : 0}"` +
            ` borderId="${border ? indexIn(this.borders, borderXml(border)) : 0}"` +
            ` xfId="0"` +
            (numFmt ? ' applyNumberFormat="1"' : '') +
            (font ? ' applyFont="1"' : '') +
            (fill ? ' applyFill="1"' : '') +
            (border ? ' applyBorder="1"' : '') +
            (alignment ? ' applyAlignment="1"' : '')
        const id = indexIn(this.xfs, alignment ? `<xf ${attrs}>${alignmentXml(alignment)}</xf>` : `<xf ${attrs}/>`)
        this.known.set(key, id)
        return id
    }

    numFmtId(code) {
        if (BUILT_IN_FORMATS[code] !== undefined) return BUILT_IN_FORMATS[code]
        return FIRST_CUSTOM_FORMAT + indexIn(this.numFmts, code)
    }

    toXml() {
        const list = (tag, items) => `<${tag} count="${items.length}">${items.join('')}</${tag}>`
        const numFmts = this.numFmts.map(
            (code, i) => `<numFmt numFmtId="${FIRST_CUSTOM_FORMAT + i}" formatCode="${escapeXml(cleanText(code))}"/>`,
        )
        return (
            `${XML_DECL}<styleSheet xmlns="${MAIN_NS}">` +
            (numFmts.length > 0 ? list('numFmts', numFmts) : '') +
            list('fonts', this.fonts) +
            list('fills', this.fills) +
            list('borders', this.borders) +
            `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
            list('cellXfs', this.xfs) +
            `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
            `</styleSheet>`
        )
    }
}

// ============================================================================
// Shared strings
// ============================================================================

const CELL_TEXT_MAX = 32767

// Excel reads `_x0041_` in a string as an escape for "A", so a literal one is
// escaped in turn, or the reader sees a different string from the one written.
function cellText(text) {
    return cleanText(text.slice(0, CELL_TEXT_MAX)).replace(/_x[0-9A-Fa-f]{4}_/g, (m) => `_x005F${m}`)
}

class SharedStrings {
    constructor() {
        this.index = new Map()
        this.count = 0
    }

    add(text) {
        this.count++
        const known = this.index.get(text)
        if (known !== undefined) return known
        const id = this.index.size
        this.index.set(text, id)
        return id
    }

    toXml() {
        const items = [...this.index.keys()].map((text) => `<si><t xml:space="preserve">${escapeXml(cellText(text))}</t></si>`)
        return `${XML_DECL}<sst xmlns="${MAIN_NS}" count="${this.count}" uniqueCount="${items.length}">${items.join('')}</sst>`
    }
}

// ============================================================================
// Workbook parts
// ============================================================================

function contentTypesXml(sheets) {
    const part = (path, type) => `<Override PartName="/${path}" ContentType="${type}"/>`
    const spreadsheet = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
    return (
        `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        part('xl/workbook.xml', `${spreadsheet}.sheet.main+xml`) +
        sheets.map((_, i) => part(`xl/worksheets/sheet${i + 1}.xml`, `${spreadsheet}.worksheet+xml`)).join('') +
        part('xl/styles.xml', `${spreadsheet}.styles+xml`) +
        part('xl/sharedStrings.xml', `${spreadsheet}.sharedStrings+xml`) +
        part('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
        part('docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml') +
        `</Types>`
    )
}

function relationshipsXml(relationships) {
    const items = relationships.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    return `${XML_DECL}<Relationships xmlns="${PKG_REL_NS}">${items.join('')}</Relationships>`
}

function rootRelsXml() {
    return relationshipsXml([
        ['rId1', `${REL_NS}/officeDocument`, 'xl/workbook.xml'],
        ['rId2', `${PKG_REL_NS}/metadata/core-properties`, 'docProps/core.xml'],
        ['rId3', `${REL_NS}/extended-properties`, 'docProps/app.xml'],
    ])
}

function workbookRelsXml(sheets) {
    return relationshipsXml([
        ...sheets.map((_, i) => [`rId${i + 1}`, `${REL_NS}/worksheet`, `worksheets/sheet${i + 1}.xml`]),
        [`rId${sheets.length + 1}`, `${REL_NS}/styles`, 'styles.xml'],
        [`rId${sheets.length + 2}`, `${REL_NS}/sharedStrings`, 'sharedStrings.xml'],
    ])
}

function workbookXml(sheets) {
    const items = sheets.map(
        (sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    return (
        `${XML_DECL}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        `<bookViews><workbookView/></bookViews>` +
        `<sheets>${items.join('')}</sheets>` +
        `<calcPr fullCalcOnLoad="1"/>` +
        `</workbook>`
    )
}

function corePropsXml({ title, subject, creator, keywords, description }) {
    const tag = (name, value) => (value ? `<${name}>${escapeXml(cleanText(String(value)))}</${name}>` : '')
    const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    return (
        `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"` +
        ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"` +
        ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        tag('dc:title', title) +
        tag('dc:subject', subject) +
        tag('dc:creator', creator) +
        tag('cp:keywords', Array.isArray(keywords) ? keywords.join(', ') : undefined) +
        tag('dc:description', description) +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
        `</cp:coreProperties>`
    )
}

function appPropsXml({ company }) {
    const companyXml = company ? `<Company>${escapeXml(cleanText(String(company)))}</Company>` : ''
    return (
        `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
        `<Application>Uniweb Press</Application>${companyXml}</Properties>`
    )
}

// ============================================================================
// Sheet names
// ============================================================================

const SHEET_NAME_MAX = 31
const SHEET_NAME_FORBIDDEN = /[\\/?*[\]:]/g
const RESERVED_SHEET_NAMES = ['history']

function sanitizeSheetName(raw) {
    if (raw == null) return ''
    return cleanText(String(raw))
        .replace(SHEET_NAME_FORBIDDEN, '_')
        .trim()
        .slice(0, SHEET_NAME_MAX)
        .replace(/^'+|'+$/g, '')
}

function uniqueSheetName(raw, used, fallbackIndex) {
    let name = sanitizeSheetName(raw)
    if (!name) name = `Sheet${fallbackIndex + 1}`
    if (!used.has(name.toLowerCase())) return name

    // Append " (n)" until unique, trimming the base to fit.
    for (let n = 2; n < 1000; n++) {
        const suffix = ` (${n})`
        const candidate = name.slice(0, SHEET_NAME_MAX - suffix.length) + suffix
        if (!used.has(candidate.toLowerCase())) return candidate
    }
    return `Sheet${fallbackIndex + 1}`
}

// ============================================================================
// XML and cell references
// ============================================================================

// XML 1.0 has no way to write these, and a lone surrogate is not a character.
function cleanText(text) {
    return text.replace(/[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu, '')
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function columnLetter(n) {
    let s = ''
    while (n > 0) {
        const rem = (n - 1) % 26
        s = String.fromCharCode(65 + rem) + s
        n = Math.floor((n - 1) / 26)
    }
    return s
}
