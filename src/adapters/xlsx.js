/**
 * Internal xlsx format adapter.
 *
 * Takes the output of the compile pipeline (src/ir/compile.js) —
 * { sections: [{ title, headers, data, ...hints }, ...] } — and produces
 * an .xlsx Blob via the `exceljs` library.
 *
 * This module is internal. It is NOT listed in package.json's exports
 * field; consumers reach it only via the dynamic import inside
 * useDocumentCompile, which keeps the exceljs library out of the main
 * bundle.
 *
 * Entry point: compileXlsx(compiledInput, options) → Promise<Blob>
 *
 * One registered block = one sheet. The `title` field becomes the sheet
 * tab name (sanitized to Excel's rules). Optional per-sheet hints
 * (columnWidths, numberFormats, headerStyle, totals) let a foundation
 * control the visual polish without leaving the registration surface.
 *
 * Workbook-level metadata (title, creator, company, subject, …) comes
 * from the options argument to compile('xlsx', …).
 */

import ExcelJS from 'exceljs'

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
 * @returns {Promise<Blob>}
 */
export async function compileXlsx(input, options = {}) {
    const workbook = await buildWorkbook(input, options)
    const buffer = await workbook.xlsx.writeBuffer()
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
}

/**
 * Build the ExcelJS Workbook object without packing. Exported for testing
 * and for callers that want to inspect or further modify the workbook
 * before serialization.
 *
 * @param {Object} input
 * @param {Object} [options]
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function buildWorkbook(input, options = {}) {
    const { sections = [] } = input

    const workbook = new ExcelJS.Workbook()

    if (options.creator) workbook.creator = options.creator
    if (options.company) workbook.company = options.company
    if (options.description) workbook.description = options.description
    if (options.title) workbook.title = options.title
    if (options.subject) workbook.subject = options.subject
    if (Array.isArray(options.keywords)) workbook.keywords = options.keywords.join(', ')
    workbook.created = new Date()

    const usedNames = new Set()
    sections.forEach((spec, i) => {
        if (!spec || !Array.isArray(spec.headers)) return
        const name = uniqueSheetName(spec.title, usedNames, i)
        usedNames.add(name)
        const sheet = workbook.addWorksheet(name)
        populateSheet(sheet, spec)
    })

    if (workbook.worksheets.length === 0) {
        // An empty workbook is invalid. Emit one empty sheet so the file
        // opens cleanly even if no sections registered anything.
        workbook.addWorksheet('Sheet1')
    }

    return workbook
}

// ============================================================================
// Sheet population
// ============================================================================

function populateSheet(sheet, spec) {
    const {
        headers,
        data = [],
        columnWidths,
        numberFormats,
        headerStyle = true,
        totals,
    } = spec

    const headerRow = sheet.addRow(headers)
    applyHeaderStyle(headerRow, headerStyle)
    headerRow.commit?.()

    for (const row of data) {
        sheet.addRow(Array.isArray(row) ? row : [])
    }

    if (totals) {
        appendTotalsRow(sheet, headers, data, totals)
    }

    applyColumnFormats(sheet, headers, data, columnWidths, numberFormats)
}

function applyHeaderStyle(row, headerStyle) {
    if (headerStyle === false) return

    const defaults = {
        font: { bold: true },
        fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEEEEEE' },
        },
        border: {
            bottom: { style: 'medium', color: { argb: 'FF808080' } },
        },
        alignment: { vertical: 'middle' },
    }

    const style = typeof headerStyle === 'object' ? { ...defaults, ...headerStyle } : defaults

    row.eachCell((cell) => {
        if (style.font) cell.font = style.font
        if (style.fill) cell.fill = style.fill
        if (style.border) cell.border = style.border
        if (style.alignment) cell.alignment = style.alignment
    })
    row.height = 20
}

function applyColumnFormats(sheet, headers, data, columnWidths, numberFormats) {
    const colCount = headers.length
    for (let c = 0; c < colCount; c++) {
        const column = sheet.getColumn(c + 1)

        if (Array.isArray(columnWidths) && columnWidths[c] != null) {
            column.width = columnWidths[c]
        } else {
            column.width = computeAutoWidth(headers[c], data, c)
        }

        if (Array.isArray(numberFormats) && numberFormats[c]) {
            column.numFmt = resolveNumberFormat(numberFormats[c])
        }
    }
}

function computeAutoWidth(header, data, colIndex) {
    const MIN = 8
    const MAX = 60
    const PADDING = 2

    let longest = String(header ?? '').length
    for (const row of data) {
        if (!Array.isArray(row)) continue
        const cell = row[colIndex]
        const len = cellDisplayLength(cell)
        if (len > longest) longest = len
    }
    return Math.min(MAX, Math.max(MIN, longest + PADDING))
}

function cellDisplayLength(value) {
    if (value == null) return 0
    if (value instanceof Date) return 10
    if (typeof value === 'number') return String(value).length
    if (typeof value === 'boolean') return value ? 4 : 5
    return String(value).length
}

// ============================================================================
// Totals row
// ============================================================================

function appendTotalsRow(sheet, headers, data, totals) {
    const colCount = headers.length
    const firstDataRow = 2
    const lastDataRow = firstDataRow + data.length - 1

    // `totals: true` → auto totals: SUM on every numeric-looking column,
    // empty elsewhere. A column is "numeric-looking" if every non-nullish
    // cell in it is a number.
    const spec = totals === true ? autoTotalsSpec(headers, data) : totals
    if (!Array.isArray(spec)) return

    const row = []
    for (let c = 0; c < colCount; c++) {
        const instruction = spec[c]
        if (instruction == null) {
            row.push(null)
            continue
        }
        if (typeof instruction !== 'string') {
            row.push(instruction)
            continue
        }
        const lower = instruction.toLowerCase()
        if (lower === 'sum' || lower === 'avg' || lower === 'count') {
            if (lastDataRow < firstDataRow) {
                row.push(0)
                continue
            }
            const col = columnLetter(c + 1)
            const fn = lower === 'avg' ? 'AVERAGE' : lower === 'count' ? 'COUNT' : 'SUM'
            row.push({
                formula: `${fn}(${col}${firstDataRow}:${col}${lastDataRow})`,
            })
            continue
        }
        row.push(instruction)
    }

    const totalsRow = sheet.addRow(row)
    totalsRow.eachCell((cell) => {
        cell.font = { bold: true }
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF808080' } },
        }
    })
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
// Formatting helpers
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
    if (typeof hint !== 'string') return undefined
    return NUMBER_FORMAT_KEYWORDS[hint.toLowerCase()] || hint
}

// ============================================================================
// Sheet names
// ============================================================================

const SHEET_NAME_MAX = 31
const SHEET_NAME_FORBIDDEN = /[\\/?*[\]:]/g

function sanitizeSheetName(raw) {
    if (raw == null) return ''
    return String(raw).replace(SHEET_NAME_FORBIDDEN, '_').trim().slice(0, SHEET_NAME_MAX)
}

function uniqueSheetName(raw, used, fallbackIndex) {
    let name = sanitizeSheetName(raw)
    if (!name) name = `Sheet${fallbackIndex + 1}`
    if (!used.has(name)) return name

    // Append " (n)" until unique, trimming the base to fit.
    for (let n = 2; n < 1000; n++) {
        const suffix = ` (${n})`
        const base = name.slice(0, SHEET_NAME_MAX - suffix.length)
        const candidate = base + suffix
        if (!used.has(candidate)) return candidate
    }
    return `Sheet${fallbackIndex + 1}`
}

// ============================================================================
// Column letter (A, B, ..., Z, AA, AB, ...)
// ============================================================================

function columnLetter(n) {
    let s = ''
    while (n > 0) {
        const rem = (n - 1) % 26
        s = String.fromCharCode(65 + rem) + s
        n = Math.floor((n - 1) / 26)
    }
    return s
}
