/**
 * Tests for the xlsx adapter.
 *
 * Covers the end-to-end compileXlsx(input, options) -> Blob contract plus
 * the buildWorkbook internal state-inspection path used for per-feature
 * assertions (column widths, header styling, number formats, totals).
 */
import { describe, it, expect } from 'vitest'
import { buildWorkbook, compileXlsx } from '../../src/adapters/xlsx.js'

async function blobToUint8(blob) {
    // jsdom's Blob doesn't implement arrayBuffer(); FileReader is the
    // reliable path. Mirrors the pattern in tests/core/useDocumentCompile.
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(blob)
    })
}

describe('compileXlsx: end-to-end Blob', () => {
    it('produces a valid xlsx Blob with PK magic bytes', async () => {
        const blob = await compileXlsx({
            sections: [
                {
                    title: 'Summary',
                    headers: ['Name', 'Count'],
                    data: [
                        ['Alice', 3],
                        ['Bob', 5],
                    ],
                },
            ],
        })
        const buf = await blobToUint8(blob)
        expect(buf[0]).toBe(0x50)
        expect(buf[1]).toBe(0x4b)
        expect(buf.length).toBeGreaterThan(100)
        expect(blob.type).toBe(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
    })

    it('produces a valid xlsx even with no registered sections', async () => {
        const blob = await compileXlsx({ sections: [] })
        const buf = await blobToUint8(blob)
        expect(buf[0]).toBe(0x50)
        expect(buf[1]).toBe(0x4b)
    })
})

describe('buildWorkbook: structure', () => {
    it('creates one worksheet per section', async () => {
        const wb = await buildWorkbook({
            sections: [
                { title: 'Members', headers: ['Name'], data: [['Alice']] },
                { title: 'Funding', headers: ['Grant'], data: [['NSF']] },
                { title: 'Publications', headers: ['Title'], data: [['Origin']] },
            ],
        })
        expect(wb.worksheets).toHaveLength(3)
        expect(wb.worksheets.map((s) => s.name)).toEqual([
            'Members',
            'Funding',
            'Publications',
        ])
    })

    it('writes headers to row 1 and data to rows 2+', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name', 'Count'],
                    data: [
                        ['Alice', 3],
                        ['Bob', 5],
                    ],
                },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(sheet.getCell('A1').value).toBe('Name')
        expect(sheet.getCell('B1').value).toBe('Count')
        expect(sheet.getCell('A2').value).toBe('Alice')
        expect(sheet.getCell('B2').value).toBe(3)
        expect(sheet.getCell('A3').value).toBe('Bob')
        expect(sheet.getCell('B3').value).toBe(5)
    })

    it('preserves numeric cell types (not stringified)', async () => {
        const wb = await buildWorkbook({
            sections: [
                { title: 'S', headers: ['N'], data: [[42], [3.14]] },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(typeof sheet.getCell('A2').value).toBe('number')
        expect(sheet.getCell('A2').value).toBe(42)
        expect(sheet.getCell('A3').value).toBe(3.14)
    })

    it('preserves Date cell types', async () => {
        const date = new Date('2025-06-15T00:00:00Z')
        const wb = await buildWorkbook({
            sections: [
                { title: 'S', headers: ['D'], data: [[date]] },
            ],
        })
        const val = wb.worksheets[0].getCell('A2').value
        expect(val).toBeInstanceOf(Date)
        expect(val.toISOString()).toBe(date.toISOString())
    })

    it('falls back to one empty sheet when no sections register', async () => {
        const wb = await buildWorkbook({ sections: [] })
        expect(wb.worksheets).toHaveLength(1)
        expect(wb.worksheets[0].name).toBe('Sheet1')
    })

    it('skips sections with no headers array', async () => {
        const wb = await buildWorkbook({
            sections: [
                { title: 'Valid', headers: ['A'], data: [[1]] },
                { title: 'NoHeaders' },
                null,
            ],
        })
        expect(wb.worksheets).toHaveLength(1)
        expect(wb.worksheets[0].name).toBe('Valid')
    })
})

describe('buildWorkbook: sheet names', () => {
    it('sanitizes forbidden characters', async () => {
        const wb = await buildWorkbook({
            sections: [
                { title: 'Q1/2025: [draft]', headers: ['A'], data: [] },
            ],
        })
        expect(wb.worksheets[0].name).toBe('Q1_2025_ _draft_')
    })

    it('truncates names longer than 31 chars', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'A very long title that exceeds the 31 character limit',
                    headers: ['A'],
                    data: [],
                },
            ],
        })
        expect(wb.worksheets[0].name.length).toBeLessThanOrEqual(31)
    })

    it('deduplicates repeated names with a (n) suffix', async () => {
        const wb = await buildWorkbook({
            sections: [
                { title: 'Stats', headers: ['A'], data: [] },
                { title: 'Stats', headers: ['B'], data: [] },
                { title: 'Stats', headers: ['C'], data: [] },
            ],
        })
        expect(wb.worksheets.map((s) => s.name)).toEqual([
            'Stats',
            'Stats (2)',
            'Stats (3)',
        ])
    })

    it('falls back to SheetN for missing titles', async () => {
        const wb = await buildWorkbook({
            sections: [{ headers: ['A'], data: [] }],
        })
        expect(wb.worksheets[0].name).toBe('Sheet1')
    })
})

describe('buildWorkbook: header styling', () => {
    it('applies bold font + fill + bottom border by default', async () => {
        const wb = await buildWorkbook({
            sections: [
                { title: 'S', headers: ['Name', 'Count'], data: [['a', 1]] },
            ],
        })
        const sheet = wb.worksheets[0]
        const cell = sheet.getCell('A1')
        expect(cell.font?.bold).toBe(true)
        expect(cell.fill?.type).toBe('pattern')
        expect(cell.border?.bottom).toBeDefined()
    })

    it('skips header styling when headerStyle is false', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name'],
                    data: [['a']],
                    headerStyle: false,
                },
            ],
        })
        const cell = wb.worksheets[0].getCell('A1')
        expect(cell.font?.bold).toBeFalsy()
    })

    it('merges object headerStyle with defaults', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['N'],
                    data: [['a']],
                    headerStyle: { font: { bold: true, color: { argb: 'FFFF0000' } } },
                },
            ],
        })
        const cell = wb.worksheets[0].getCell('A1')
        expect(cell.font?.bold).toBe(true)
        expect(cell.font?.color?.argb).toBe('FFFF0000')
    })
})

describe('buildWorkbook: column widths', () => {
    it('applies explicit columnWidths', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['A', 'B', 'C'],
                    data: [],
                    columnWidths: [10, 25, 40],
                },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(sheet.getColumn(1).width).toBe(10)
        expect(sheet.getColumn(2).width).toBe(25)
        expect(sheet.getColumn(3).width).toBe(40)
    })

    it('auto-fits column width from longest content + padding', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name', 'Publication Title'],
                    data: [
                        ['Al', 'Short'],
                        ['Beatrice', 'A Much Longer Title'],
                    ],
                },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(8)
        expect(sheet.getColumn(2).width).toBeGreaterThanOrEqual(
            'A Much Longer Title'.length,
        )
    })

    it('caps auto-fit at maximum width', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['A'],
                    data: [['x'.repeat(200)]],
                },
            ],
        })
        expect(wb.worksheets[0].getColumn(1).width).toBeLessThanOrEqual(60)
    })
})

describe('buildWorkbook: number formats', () => {
    it('resolves keyword formats', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Text', 'Count', 'Amount', 'Pct', 'Date'],
                    data: [['x', 5, 1234.5, 0.25, new Date('2025-01-01')]],
                    numberFormats: ['text', 'number', 'currency', 'percent', 'date'],
                },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(sheet.getColumn(1).numFmt).toBe('@')
        expect(sheet.getColumn(2).numFmt).toBe('#,##0')
        expect(sheet.getColumn(3).numFmt).toBe('#,##0.00')
        expect(sheet.getColumn(4).numFmt).toBe('0.0%')
        expect(sheet.getColumn(5).numFmt).toBe('yyyy-mm-dd')
    })

    it('passes through raw numFmt strings', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Amount'],
                    data: [[100]],
                    numberFormats: ['"£"#,##0.00'],
                },
            ],
        })
        expect(wb.worksheets[0].getColumn(1).numFmt).toBe('"£"#,##0.00')
    })
})

describe('buildWorkbook: totals row', () => {
    it('adds explicit totals with formulas for sum/avg/count', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name', 'Count', 'Amount'],
                    data: [
                        ['Alice', 3, 100],
                        ['Bob', 5, 200],
                    ],
                    totals: ['Total', 'sum', 'avg'],
                },
            ],
        })
        const sheet = wb.worksheets[0]
        // Row 4 is the totals row (headers at 1, data at 2-3).
        expect(sheet.getCell('A4').value).toBe('Total')
        const countCell = sheet.getCell('B4').value
        const amountCell = sheet.getCell('C4').value
        expect(countCell).toMatchObject({ formula: 'SUM(B2:B3)' })
        expect(amountCell).toMatchObject({ formula: 'AVERAGE(C2:C3)' })
    })

    it('renders totals row in bold with top border', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name', 'Count'],
                    data: [['a', 1]],
                    totals: ['Total', 'sum'],
                },
            ],
        })
        const cell = wb.worksheets[0].getCell('B3')
        expect(cell.font?.bold).toBe(true)
        expect(cell.border?.top).toBeDefined()
    })

    it('auto-generates totals for numeric columns when totals: true', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name', 'Count', 'Notes'],
                    data: [
                        ['Alice', 3, 'a'],
                        ['Bob', 5, 'b'],
                    ],
                    totals: true,
                },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(sheet.getCell('A4').value).toBe('Total')
        expect(sheet.getCell('B4').value).toMatchObject({ formula: 'SUM(B2:B3)' })
        expect(sheet.getCell('C4').value).toBeNull()
    })

    it('accepts literal values in totals spec', async () => {
        const wb = await buildWorkbook({
            sections: [
                {
                    title: 'S',
                    headers: ['Name', 'Count'],
                    data: [['a', 1]],
                    totals: ['Fixed', 999],
                },
            ],
        })
        const sheet = wb.worksheets[0]
        expect(sheet.getCell('A3').value).toBe('Fixed')
        expect(sheet.getCell('B3').value).toBe(999)
    })
})

describe('buildWorkbook: workbook metadata', () => {
    it('applies title, creator, company, subject, description', async () => {
        const wb = await buildWorkbook(
            { sections: [{ title: 'S', headers: ['A'], data: [] }] },
            {
                title: 'Academic Metrics',
                creator: 'Uniweb',
                company: 'Proximify',
                subject: 'Publications report',
                description: 'Q1 2025 metrics',
                keywords: ['publications', 'metrics'],
            },
        )
        expect(wb.title).toBe('Academic Metrics')
        expect(wb.creator).toBe('Uniweb')
        expect(wb.company).toBe('Proximify')
        expect(wb.subject).toBe('Publications report')
        expect(wb.description).toBe('Q1 2025 metrics')
        expect(wb.keywords).toBe('publications, metrics')
    })
})
