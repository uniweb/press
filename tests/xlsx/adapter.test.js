/**
 * Tests for the xlsx adapter.
 *
 * Every assertion reads the compiled file back (./_read.js): a wrong workbook
 * compiles without complaint, so what counts is what the file says. Several of
 * these guard the difference between a file Excel opens and one it offers to
 * repair, which the header of src/adapters/xlsx.js lists.
 */
import { describe, it, expect } from 'vitest'
import { compileXlsx } from '../../src/adapters/xlsx.js'
import { readXlsx } from './_read.js'

const compile = async (input, options) => readXlsx(await compileXlsx(input, options))
const oneSheet = async (spec, options) => (await compile({ sections: [{ title: 'S', ...spec }] }, options)).sheets[0]

describe('compileXlsx: end-to-end Blob', () => {
    it('produces an xlsx Blob with PK magic bytes', async () => {
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
        const { bytes } = await readXlsx(blob)
        expect(bytes[0]).toBe(0x50)
        expect(bytes[1]).toBe(0x4b)
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    })

    it('produces a workbook even with no registered sections', async () => {
        const { sheets, bytes } = await compile({ sections: [] })
        expect(bytes[0]).toBe(0x50)
        expect(sheets.map((s) => s.name)).toEqual(['Sheet1'])
    })
})

// A reader finds a part through [Content_Types].xml and the relationships. A
// part they name that is missing, or one with no type, is a damaged package.
describe('the package', () => {
    const input = {
        sections: [
            { title: 'One', headers: ['A'], data: [['x']] },
            { title: 'Two', headers: ['B'], data: [[1]] },
        ],
    }

    it('starts with its content types and holds no folder entries', async () => {
        const { paths } = await compile(input)
        expect(paths[0]).toBe('[Content_Types].xml')
        expect(paths.filter((p) => p.endsWith('/'))).toEqual([])
    })

    it('declares a type for every part, and every declared part exists', async () => {
        const { paths, doc } = await compile(input)
        const types = [...doc('[Content_Types].xml').documentElement.children]
        const overrides = types.filter((t) => t.localName === 'Override').map((t) => t.getAttribute('PartName').slice(1))
        const defaults = types.filter((t) => t.localName === 'Default').map((t) => t.getAttribute('Extension'))
        for (const part of overrides) expect(paths).toContain(part)
        for (const path of paths) {
            if (path === '[Content_Types].xml') continue
            expect(overrides.includes(path) || defaults.includes(path.split('.').pop())).toBe(true)
        }
    })

    it('points every relationship at a part that exists', async () => {
        const { paths, doc } = await compile(input)
        const targets = (path, base) =>
            [...doc(path).documentElement.children].map((r) => `${base}${r.getAttribute('Target')}`)
        for (const target of [...targets('_rels/.rels', ''), ...targets('xl/_rels/workbook.xml.rels', 'xl/')]) {
            expect(paths).toContain(target)
        }
    })

    it('writes elements in schema order', async () => {
        const inOrder = (root, order) => {
            const names = [...root.children].map((c) => c.localName)
            for (const name of names) expect(order).toContain(name)
            const positions = names.map((name) => order.indexOf(name))
            expect(positions).toEqual([...positions].sort((a, b) => a - b))
        }
        const { sheets, stylesRoot, doc } = await compile(
            {
                sections: [
                    {
                        title: 'S',
                        headers: ['A', 'B'],
                        data: [['x', 1]],
                        numberFormats: ['text', '"£"#,##0.00'],
                        totals: ['Total', 'sum'],
                    },
                ],
            },
            { paper: 'a4' },
        )
        inOrder(sheets[0].root, ['dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'pageMargins', 'pageSetup'])
        expect(sheets[0].root.children).toHaveLength(7)
        inOrder(stylesRoot, ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles'])
        expect(stylesRoot.children).toHaveLength(7)
        inOrder(doc('xl/workbook.xml').documentElement, ['bookViews', 'sheets', 'calcPr'])
    })

    it('leaves an empty container out rather than writing it empty', async () => {
        const { sheets, stylesRoot } = await compile({ sections: [{ title: 'S', headers: [] }] })
        expect([...sheets[0].root.children].map((c) => c.localName)).not.toContain('cols')
        expect([...stylesRoot.children].map((c) => c.localName)).not.toContain('numFmts')
    })

    it('keeps the two fills Excel reserves first', async () => {
        const { fills, readFill } = await compile({ sections: [{ title: 'S', headers: ['A'], data: [] }] })
        expect(readFill(fills[0]).pattern).toBe('none')
        expect(readFill(fills[1]).pattern).toBe('gray125')
    })

    it('selects the first sheet only', async () => {
        const { sheets } = await compile(input)
        expect(sheets.map((s) => s.selected)).toEqual([true, false])
    })

    it('asks Excel to calculate on load', async () => {
        const { xml } = await compile(input)
        expect(xml('xl/workbook.xml')).toMatch(/<calcPr fullCalcOnLoad="1"\/>/)
    })
})

describe('sheet structure', () => {
    it('creates one worksheet per section', async () => {
        const { sheets } = await compile({
            sections: [
                { title: 'Members', headers: ['Name'], data: [['Alice']] },
                { title: 'Funding', headers: ['Grant'], data: [['NSF']] },
                { title: 'Publications', headers: ['Title'], data: [['Origin']] },
            ],
        })
        expect(sheets.map((s) => s.name)).toEqual(['Members', 'Funding', 'Publications'])
    })

    it('writes headers to row 1 and data to rows 2+', async () => {
        const sheet = await oneSheet({
            headers: ['Name', 'Count'],
            data: [
                ['Alice', 3],
                ['Bob', 5],
            ],
        })
        expect(sheet.cell('A1').value).toBe('Name')
        expect(sheet.cell('B1').value).toBe('Count')
        expect(sheet.cell('A2').value).toBe('Alice')
        expect(sheet.cell('B2').value).toBe(3)
        expect(sheet.cell('A3').value).toBe('Bob')
        expect(sheet.cell('B3').value).toBe(5)
    })

    it('states the sheet dimension, counting a row wider than the headers', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['x', 'y', 'z']], totals: ['Total'] })
        expect(sheet.root.querySelector('dimension').getAttribute('ref')).toBe('A1:C3')
    })

    it('falls back to one empty sheet when no sections register', async () => {
        const { sheets } = await compile({ sections: [] })
        expect(sheets).toHaveLength(1)
        expect(sheets[0].name).toBe('Sheet1')
    })

    it('skips sections with no headers array', async () => {
        const { sheets } = await compile({
            sections: [{ title: 'Valid', headers: ['A'], data: [[1]] }, { title: 'NoHeaders' }, null],
        })
        expect(sheets.map((s) => s.name)).toEqual(['Valid'])
    })

    it('stores each distinct string once', async () => {
        const { strings, xml } = await compile({
            sections: [{ title: 'S', headers: ['A'], data: [['same'], ['same'], ['same']] }],
        })
        expect(strings.filter((s) => s === 'same')).toHaveLength(1)
        expect(xml('xl/sharedStrings.xml')).toMatch(/count="4" uniqueCount="2"/)
    })

    it('adds a style once however many cells use it', async () => {
        const data = Array.from({ length: 2000 }, (_, i) => [`row ${i}`, i, new Date(Date.UTC(2025, 0, 1))])
        const { styleCounts } = await compile({
            sections: [{ title: 'S', headers: ['A', 'B', 'C'], data, numberFormats: ['text', 'currency', 'date'] }],
        })
        expect(styleCounts.xfs).toBeLessThan(10)
    })
})

describe('cell values', () => {
    it('keeps numbers as numbers', async () => {
        const sheet = await oneSheet({ headers: ['N'], data: [[42], [3.14], [-0.5], [0]] })
        expect(sheet.cell('A2').value).toBe(42)
        expect(sheet.cell('A3').value).toBe(3.14)
        expect(sheet.cell('A4').value).toBe(-0.5)
        expect(sheet.cell('A5').value).toBe(0)
        expect(sheet.cell('A2').type).toBeUndefined()
    })

    it('writes a date as its serial number, with a date format', async () => {
        const sheet = await oneSheet({ headers: ['D'], data: [[new Date('2025-06-15T00:00:00Z')]] })
        expect(sheet.cell('A2').value).toBe(45823)
        expect(sheet.cell('A2').numFmt).toBe('mm-dd-yy')
    })

    it('keeps the time of day in the serial', async () => {
        const sheet = await oneSheet({ headers: ['D'], data: [[new Date('2025-06-15T12:00:00Z')]], numberFormats: ['datetime'] })
        expect(sheet.cell('A2').value).toBe(45823.5)
        expect(sheet.cell('A2').numFmt).toBe('yyyy-mm-dd hh:mm')
    })

    it('writes booleans as booleans', async () => {
        const sheet = await oneSheet({ headers: ['B'], data: [[true], [false]] })
        expect(sheet.cell('A2').value).toBe(true)
        expect(sheet.cell('A3').value).toBe(false)
    })

    it('leaves null and undefined empty', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B'], data: [[null, undefined]] })
        expect(sheet.cell('A2').absent).toBe(true)
        expect(sheet.cell('B2').absent).toBe(true)
    })

    it('keeps an empty string a string', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['']] })
        expect(sheet.cell('A2').value).toBe('')
    })

    it('leaves a row that is not an array blank, without losing its place', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['x'], 'not a row', ['y']] })
        expect(sheet.cell('A2').value).toBe('x')
        expect(sheet.cell('A3').absent).toBe(true)
        expect(sheet.cell('A4').value).toBe('y')
    })

    it('writes an explicit formula, with its result and without a leading =', async () => {
        const sheet = await oneSheet({
            headers: ['A'],
            data: [[{ formula: 'SUM(B1:B2)', result: 7 }], [{ formula: '=1+1' }], [{ formula: 'A1&"x"', result: 'yx' }]],
        })
        expect(sheet.cell('A2').formula).toBe('SUM(B1:B2)')
        expect(sheet.cell('A2').value).toBe(7)
        expect(sheet.cell('A3').formula).toBe('1+1')
        expect(sheet.cell('A3').value).toBeNull()
        expect(sheet.cell('A4').formula).toBe('A1&"x"')
        expect(sheet.cell('A4').value).toBe('yx')
    })

    it('refuses any other kind of cell, naming it', async () => {
        await expect(oneSheet({ headers: ['A'], data: [[{ richText: [] }]] })).rejects.toThrow(/cell A2 holds .*richText/)
        await expect(oneSheet({ headers: ['A'], data: [[{ text: 'x', hyperlink: 'https://e.com' }]] })).rejects.toThrow(
            /cell A2 .*\{ formula, result\? \}/,
        )
        await expect(oneSheet({ headers: ['A'], data: [[() => 1]] })).rejects.toThrow(/cell A2 holds/)
    })
})

// The inputs that make a careless writer produce a file Excel offers to repair.
describe('what Excel would refuse', () => {
    it('leaves NaN, Infinity and an invalid date empty', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B', 'C'], data: [[NaN, Infinity, new Date('nope')]] })
        expect(sheet.cell('A2').absent).toBe(true)
        expect(sheet.cell('B2').absent).toBe(true)
        expect(sheet.cell('C2').absent).toBe(true)
        expect(sheet.xml).not.toMatch(/NaN|Infinity/)
    })

    it('drops control characters and lone surrogates, keeping tabs and line breaks', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['a\u0001b\u0008c\uD800d￾e'], ['tab\tline\nend']] })
        expect(sheet.cell('A2').value).toBe('abcde')
        expect(sheet.cell('A3').value).toBe('tab\tline\nend')
    })

    it('keeps characters beyond the basic plane', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['😀 日本語 العربية é']] })
        expect(sheet.cell('A2').value).toBe('😀 日本語 العربية é')
    })

    it('clips text to the 32,767 characters a cell can hold', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['x'.repeat(40000)]] })
        expect(sheet.cell('A2').value).toHaveLength(32767)
    })

    it('does not leave half a character where it clips', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['x'.repeat(32766) + '😀😀']] })
        expect(sheet.cell('A2').value).toBe('x'.repeat(32766))
    })

    it('escapes XML in text, formulas, formats, names and metadata', async () => {
        const { sheets, properties, xml } = await compile(
            {
                sections: [
                    {
                        title: 'R&D <Team> "x"',
                        headers: [`& < > " '`],
                        data: [[{ formula: 'IF(A1<1,"a&b",1)' }]],
                        numberFormats: ['"<£>"#,##0.00'],
                    },
                ],
            },
            { title: 'R&D <Report>', company: 'A & B', creator: '<me>' },
        )
        expect(sheets[0].name).toBe('R&D <Team> "x"')
        expect(sheets[0].cell('A1').value).toBe(`& < > " '`)
        expect(sheets[0].cell('A2').formula).toBe('IF(A1<1,"a&b",1)')
        expect(sheets[0].cell('A1').numFmt).toBe('"<£>"#,##0.00')
        expect(properties.title).toBe('R&D <Report>')
        expect(properties.company).toBe('A & B')
        expect(properties.creator).toBe('<me>')
        expect(xml('xl/workbook.xml')).toContain('R&amp;D &lt;Team&gt; &quot;x&quot;')
    })

    it('keeps text that looks like a formula as text', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['=1+1']] })
        expect(sheet.cell('A2').value).toBe('=1+1')
        expect(sheet.cell('A2').formula).toBeUndefined()
        expect(sheet.cell('A2').type).toBe('s')
    })

    it('keeps a literal _x0041_, which Excel would read as an escape', async () => {
        const { xml, sheets } = await compile({
            sections: [{ title: 'S', headers: ['A'], data: [['_x0041_ and _xABCD_ but not _x41_']] }],
        })
        expect(xml('xl/sharedStrings.xml')).toContain('_x005F_x0041_ and _x005F_xABCD_ but not _x41_')
        expect(sheets[0].cell('A2').value).toBe('_x005F_x0041_ and _x005F_xABCD_ but not _x41_')
    })

    it('preserves spaces at the ends of a string', async () => {
        const { xml } = await compile({ sections: [{ title: 'S', headers: ['A'], data: [['  spaced  ']] }] })
        expect(xml('xl/sharedStrings.xml')).toContain('<t xml:space="preserve">  spaced  </t>')
    })
})

describe('sheet names', () => {
    const names = async (...titles) =>
        (await compile({ sections: titles.map((title) => ({ title, headers: ['A'], data: [] })) })).sheets.map((s) => s.name)

    it('replaces forbidden characters', async () => {
        expect(await names('Q1/2025: [draft]')).toEqual(['Q1_2025_ _draft_'])
    })

    it('truncates names longer than 31 chars', async () => {
        const [name] = await names('A very long title that exceeds the 31 character limit')
        expect(name.length).toBeLessThanOrEqual(31)
    })

    it('deduplicates repeated names with a (n) suffix', async () => {
        expect(await names('Stats', 'Stats', 'Stats')).toEqual(['Stats', 'Stats (2)', 'Stats (3)'])
    })

    it('treats names differing only in case as the same name', async () => {
        expect(await names('Stats', 'stats', 'STATS')).toEqual(['Stats', 'stats (2)', 'STATS (3)'])
    })

    it('keeps a suffixed name within 31 chars', async () => {
        const long = 'x'.repeat(40)
        const result = await names(long, long)
        expect(result[1]).toBe(`${'x'.repeat(27)} (2)`)
    })

    it('strips apostrophes from the ends only', async () => {
        expect(await names(`'quoted'`, `it's`)).toEqual(['quoted', `it's`])
    })

    it('does not use the name Excel reserves', async () => {
        expect(await names('History', 'history')).toEqual(['History (2)', 'history (3)'])
    })

    it('falls back to SheetN for a missing or unusable title', async () => {
        expect(await names(undefined, `''`, '   ')).toEqual(['Sheet1', 'Sheet2', 'Sheet3'])
    })

    it('does not let a fallback collide with a real title', async () => {
        expect(await names('Sheet2', undefined)).toEqual(['Sheet2', 'Sheet2 (2)'])
    })
})

describe('header styling', () => {
    it('applies bold font, fill, bottom border and height by default', async () => {
        const sheet = await oneSheet({ headers: ['Name', 'Count'], data: [['a', 1]] })
        const cell = sheet.cell('A1')
        expect(cell.font.bold).toBe(true)
        expect(cell.fill).toEqual({ pattern: 'solid', color: 'FFEEEEEE' })
        expect(cell.border.bottom).toEqual({ style: 'medium', color: 'FF808080' })
        expect(cell.alignment.vertical).toBe('center')
        expect(sheet.row(1).height).toBe(20)
    })

    it('leaves data rows plain', async () => {
        const sheet = await oneSheet({ headers: ['Name'], data: [['a']] })
        expect(sheet.cell('A2').font.bold).toBe(false)
        expect(sheet.cell('A2').fill.pattern).toBe('none')
        expect(sheet.row(2).height).toBeUndefined()
    })

    it('skips header styling when headerStyle is false', async () => {
        const sheet = await oneSheet({ headers: ['Name'], data: [['a']], headerStyle: false })
        expect(sheet.cell('A1').font.bold).toBe(false)
        expect(sheet.row(1).height).toBeUndefined()
    })

    it('merges an object headerStyle over the defaults', async () => {
        const sheet = await oneSheet({
            headers: ['N'],
            data: [['a']],
            headerStyle: { font: { bold: true, color: { argb: 'FFFF0000' } } },
        })
        const cell = sheet.cell('A1')
        expect(cell.font.bold).toBe(true)
        expect(cell.font.color).toBe('FFFF0000')
        expect(cell.fill.color).toBe('FFEEEEEE')
    })

    it('honours the rest of the style vocabulary', async () => {
        const sheet = await oneSheet({
            headers: ['N'],
            headerStyle: {
                font: { italic: true, underline: true, strike: true, size: 14, name: 'Arial' },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF112233' } },
                border: { top: { style: 'thick' }, left: { style: 'dashed', color: { argb: 'FF000000' } } },
                alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
            },
        })
        const cell = sheet.cell('A1')
        expect(cell.font).toMatchObject({ italic: true, underline: true, strike: true, size: 14, name: 'Arial', bold: false })
        expect(cell.fill).toEqual({ pattern: 'solid', color: 'FF112233' })
        expect(cell.border).toEqual({
            top: { style: 'thick', color: undefined },
            left: { style: 'dashed', color: 'FF000000' },
        })
        expect(cell.alignment).toEqual({ horizontal: 'center', vertical: 'top', wrapText: true })
    })

    it.each([
        ['an unknown style key', { protection: {} }, /a style has no "protection"/],
        ['an unknown font key', { font: { outline: true } }, /a font has no "outline"/],
        ['a color that is not ARGB', { font: { color: { argb: 'red' } } }, /a color is \{ argb/],
        ['a font size out of range', { font: { size: 500 } }, /a font size is a number/],
        ['a gradient fill', { fill: { type: 'gradient', fgColor: { argb: 'FF000000' } } }, /a fill type cannot be "gradient"/],
        ['a patterned fill', { fill: { pattern: 'darkGrid', fgColor: { argb: 'FF000000' } } }, /a fill pattern cannot be "darkGrid"/],
        ['a fill with no color', { fill: { pattern: 'solid' } }, /a color is \{ argb/],
        ['a diagonal border', { border: { diagonal: { style: 'thin' } } }, /a border has no "diagonal"/],
        ['a border style Excel lacks', { border: { top: { style: 'wavy' } } }, /a border style cannot be "wavy"/],
        ['an unknown alignment key', { alignment: { indent: 1 } }, /an alignment has no "indent"/],
        ['a vertical alignment Excel lacks', { alignment: { vertical: 'baseline' } }, /a vertical alignment cannot be "baseline"/],
        ['a horizontal alignment Excel lacks', { alignment: { horizontal: 'start' } }, /a horizontal alignment cannot be "start"/],
    ])('refuses %s', async (_label, headerStyle, message) => {
        await expect(oneSheet({ headers: ['A'], headerStyle })).rejects.toThrow(message)
    })
})

describe('column widths', () => {
    it('applies explicit columnWidths', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B', 'C'], data: [], columnWidths: [10, 25, 40] })
        expect(sheet.column(1).width).toBe(10)
        expect(sheet.column(2).width).toBe(25)
        expect(sheet.column(3).width).toBe(40)
    })

    it('caps an explicit width at the 255 a column can be', async () => {
        const sheet = await oneSheet({ headers: ['A'], columnWidths: [900] })
        expect(sheet.column(1).width).toBe(255)
    })

    it('falls back to auto-fit for an unusable width', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B', 'C'], data: [], columnWidths: [null, 'wide', -1] })
        expect(sheet.column(1).width).toBe(8)
        expect(sheet.column(2).width).toBe(8)
        expect(sheet.column(3).width).toBe(8)
    })

    it('auto-fits from the longest content plus padding', async () => {
        const sheet = await oneSheet({
            headers: ['Name', 'Publication Title'],
            data: [
                ['Al', 'Short'],
                ['Beatrice', 'A Much Longer Title'],
            ],
        })
        expect(sheet.column(1).width).toBe(10)
        expect(sheet.column(2).width).toBe('A Much Longer Title'.length + 2)
    })

    it('caps auto-fit at a maximum width', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['x'.repeat(200)]] })
        expect(sheet.column(1).width).toBe(60)
    })

    // Too narrow, and Excel shows ##### in place of the value.
    it('sizes a number as its format shows it', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B', 'C'], data: [[1234567.5, 0.25, 100]], numberFormats: ['currency', 'percent', '"CAD "#,##0.00'] })
        expect(sheet.column(1).width).toBe('1,234,567.50'.length + 2)
        expect(sheet.column(2).width).toBe(8)
        expect(sheet.column(3).width).toBe('CAD 100.00'.length + 2)
    })

    it('sizes a date as its format shows it', async () => {
        const when = new Date(Date.UTC(2025, 0, 1))
        const sheet = await oneSheet({ headers: ['A', 'B', 'C'], data: [[when, when, when]], numberFormats: ['datetime', 'date', undefined] })
        expect(sheet.column(1).width).toBe('yyyy-mm-dd hh:mm'.length + 2)
        expect(sheet.column(2).width).toBe(12)
        expect(sheet.column(3).width).toBe(12)
    })

    it('leaves room for a total longer than any row', async () => {
        const sheet = await oneSheet({
            headers: ['N'],
            data: [[999999.5], [999999.5], [999999.5]],
            numberFormats: ['currency'],
            totals: ['sum'],
        })
        expect(sheet.column(1).width).toBe('2,999,998.50'.length + 2)
    })
})

describe('number formats', () => {
    it('resolves keyword formats', async () => {
        const sheet = await oneSheet({
            headers: ['Text', 'Count', 'Amount', 'Pct', 'Date', 'When', 'Decimal', 'Integer'],
            data: [['x', 5, 1234.5, 0.25, new Date('2025-01-01'), new Date('2025-01-01'), 1.5, 2]],
            numberFormats: ['text', 'number', 'currency', 'percent', 'date', 'datetime', 'decimal', 'integer'],
        })
        expect(sheet.column(1).numFmt).toBe('@')
        expect(sheet.column(2).numFmt).toBe('#,##0')
        expect(sheet.column(3).numFmt).toBe('#,##0.00')
        expect(sheet.column(4).numFmt).toBe('0.0%')
        expect(sheet.column(5).numFmt).toBe('yyyy-mm-dd')
        expect(sheet.column(6).numFmt).toBe('yyyy-mm-dd hh:mm')
        expect(sheet.column(7).numFmt).toBe('#,##0.00')
        expect(sheet.column(8).numFmt).toBe('#,##0')
    })

    it('applies a column format to its cells, header and totals included', async () => {
        const sheet = await oneSheet({ headers: ['N'], data: [[1]], numberFormats: ['currency'], totals: ['sum'] })
        expect(sheet.cell('A2').numFmt).toBe('#,##0.00')
        expect(sheet.cell('A1').numFmt).toBe('#,##0.00')
        expect(sheet.cell('A3').numFmt).toBe('#,##0.00')
    })

    it('passes through raw format strings, declared from id 164', async () => {
        const sheet = await oneSheet({ headers: ['Amount'], data: [[100]], numberFormats: ['"£"#,##0.00'] })
        expect(sheet.column(1).numFmt).toBe('"£"#,##0.00')
        expect(sheet.cell('A2').numFmtId).toBe(164)
    })

    it('uses the ids every reader already knows', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B', 'C', 'D'], data: [['x', 1, 1, 1]], numberFormats: ['text', 'number', 'currency', '0%'] })
        expect(sheet.cell('A2').numFmtId).toBe(49)
        expect(sheet.cell('B2').numFmtId).toBe(3)
        expect(sheet.cell('C2').numFmtId).toBe(4)
        expect(sheet.cell('D2').numFmtId).toBe(9)
    })

    it('ignores a hint that is not a string', async () => {
        const sheet = await oneSheet({ headers: ['A', 'B'], data: [[1, 2]], numberFormats: [undefined, 5] })
        expect(sheet.column(1).numFmt).toBeUndefined()
        expect(sheet.column(2).numFmt).toBeUndefined()
    })
})

describe('totals row', () => {
    it('adds formulas for sum, avg and count', async () => {
        const sheet = await oneSheet({
            headers: ['Name', 'Count', 'Amount', 'Seen'],
            data: [
                ['Alice', 3, 100, 1],
                ['Bob', 5, 200, 'no'],
            ],
            totals: ['Total', 'sum', 'avg', 'count'],
        })
        expect(sheet.cell('A4').value).toBe('Total')
        expect(sheet.cell('B4').formula).toBe('SUM(B2:B3)')
        expect(sheet.cell('C4').formula).toBe('AVERAGE(C2:C3)')
        expect(sheet.cell('D4').formula).toBe('COUNT(D2:D3)')
    })

    // A reader that does not calculate shows only this: a preview pane, a phone.
    it('stores what each formula evaluates to', async () => {
        const sheet = await oneSheet({
            headers: ['Name', 'Count', 'Amount', 'Seen'],
            data: [
                ['Alice', 3, 100, 1],
                ['Bob', 5, 200, 'no'],
            ],
            totals: ['Total', 'sum', 'avg', 'count'],
        })
        expect(sheet.cell('B4').value).toBe(8)
        expect(sheet.cell('C4').value).toBe(150)
        expect(sheet.cell('D4').value).toBe(1)
    })

    it('stores #DIV/0! where Excel would show it', async () => {
        const sheet = await oneSheet({ headers: ['A'], data: [['text']], totals: ['avg'] })
        expect(sheet.cell('A3').value).toBe('#DIV/0!')
        expect(sheet.cell('A3').type).toBe('e')
    })

    it('counts dates and formula results as Excel does, and skips the rest', async () => {
        const sheet = await oneSheet({
            headers: ['A'],
            data: [[new Date(Date.UTC(2025, 0, 1))], [{ formula: '1+1', result: 2 }], ['x'], [true], [null], [NaN]],
            totals: ['count'],
        })
        expect(sheet.cell('A8').value).toBe(2)
    })

    it('shows a count as a number, whatever format its column has', async () => {
        const sheet = await oneSheet({
            headers: ['When', 'Amount', 'Mean'],
            data: [[new Date(Date.UTC(2025, 0, 1)), 5, 5]],
            numberFormats: ['date', 'currency', 'currency'],
            totals: ['count', 'count', 'avg'],
        })
        expect(sheet.cell('A3').numFmt).toBe('0')
        expect(sheet.cell('B3').numFmt).toBe('0')
        expect(sheet.cell('C3').numFmt).toBe('#,##0.00')
    })

    it('renders the totals row in bold with a top border', async () => {
        const sheet = await oneSheet({ headers: ['Name', 'Count'], data: [['a', 1]], totals: ['Total', 'sum'] })
        const cell = sheet.cell('B3')
        expect(cell.font.bold).toBe(true)
        expect(cell.border.top).toEqual({ style: 'thin', color: 'FF808080' })
    })

    it('auto-generates totals for numeric columns when totals: true', async () => {
        const sheet = await oneSheet({
            headers: ['Name', 'Count', 'Notes'],
            data: [
                ['Alice', 3, 'a'],
                ['Bob', 5, 'b'],
            ],
            totals: true,
        })
        expect(sheet.cell('A4').value).toBe('Total')
        expect(sheet.cell('B4').formula).toBe('SUM(B2:B3)')
        expect(sheet.cell('B4').value).toBe(8)
        expect(sheet.cell('C4').absent).toBe(true)
    })

    it('accepts literal values', async () => {
        const sheet = await oneSheet({ headers: ['Name', 'Count'], data: [['a', 1]], totals: ['Fixed', 999] })
        expect(sheet.cell('A3').value).toBe('Fixed')
        expect(sheet.cell('B3').value).toBe(999)
    })

    it('writes zero, not a broken range, when there are no rows', async () => {
        const sheet = await oneSheet({ headers: ['Label', 'N'], data: [], totals: ['Total', 'sum'] })
        expect(sheet.cell('B2').value).toBe(0)
        expect(sheet.cell('B2').formula).toBeUndefined()
    })

    it('names a column past Z correctly', async () => {
        const headers = Array.from({ length: 28 }, (_, i) => `H${i}`)
        const totals = headers.map(() => null)
        totals[27] = 'sum'
        const sheet = await oneSheet({ headers, data: [new Array(28).fill(1)], totals })
        expect(sheet.cell('AB3').formula).toBe('SUM(AB2:AB2)')
    })
})

describe('workbook metadata', () => {
    it('states title, creator, company, subject, description and keywords', async () => {
        const { properties } = await compile(
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
        expect(properties).toMatchObject({
            title: 'Academic Metrics',
            creator: 'Uniweb',
            company: 'Proximify',
            subject: 'Publications report',
            description: 'Q1 2025 metrics',
            keywords: 'publications, metrics',
        })
    })

    it('states what it was not told only as absent', async () => {
        const { properties } = await compile({ sections: [] })
        expect(properties.title).toBeUndefined()
        expect(properties.company).toBeUndefined()
    })

    it('records when it was created, to the second', async () => {
        const { properties } = await compile({ sections: [] })
        expect(properties.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    })
})

describe('the paper a sheet prints on', () => {
    const input = {
        sections: [
            { title: 'One', headers: ['A'], data: [['x']] },
            { title: 'Two', headers: ['B'], data: [['y']] },
        ],
    }

    it('states it on every sheet', async () => {
        const letter = await compile(input, { paper: 'letter' })
        expect(letter.sheets.map((s) => s.paperSize)).toEqual(['1', '1'])
        const a4 = await compile(input, { paper: 'a4' })
        expect(a4.sheets.map((s) => s.paperSize)).toEqual(['9', '9'])
    })

    it('states it on the sheet an empty workbook gets, too', async () => {
        const { sheets } = await compile({ sections: [] }, { paper: 'a4' })
        expect(sheets[0].paperSize).toBe('9')
    })

    it('leaves it to the printer when none is named', async () => {
        const { sheets } = await compile(input)
        expect(sheets[0].paperSize).toBeUndefined()
    })

    it('refuses a paper it cannot state', async () => {
        await expect(compile(input, { paper: 'legal' })).rejects.toThrow(/a4, letter/)
    })
})
