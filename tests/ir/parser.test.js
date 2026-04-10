import { describe, it, expect } from 'vitest'
import { htmlToIR } from '../../src/ir/parser.js'

describe('htmlToIR', () => {
    describe('text content', () => {
        it('returns text nodes for non-empty text content', () => {
            const ir = htmlToIR('<p data-type="paragraph">Hello world</p>')
            expect(ir).toEqual([
                {
                    type: 'paragraph',
                    children: [{ type: 'text', content: 'Hello world' }],
                },
            ])
        })

        it('drops whitespace-only text nodes', () => {
            const ir = htmlToIR('<p data-type="paragraph">   \n\t  </p>')
            // No children at all — paragraph stands alone.
            expect(ir).toEqual([{ type: 'paragraph' }])
        })

        it('preserves text nodes that contain meaningful whitespace mixed with content', () => {
            // The text node trim check is on the content as a whole; if it
            // contains anything non-whitespace, the original (untrimmed)
            // content is preserved. This matches legacy behavior.
            const ir = htmlToIR('<p data-type="paragraph">  Hello  </p>')
            expect(ir).toEqual([
                {
                    type: 'paragraph',
                    children: [{ type: 'text', content: '  Hello  ' }],
                },
            ])
        })
    })

    describe('node type resolution', () => {
        it('uses data-type as the IR type when present', () => {
            const ir = htmlToIR('<div data-type="paragraph">x</div>')
            expect(ir[0].type).toBe('paragraph')
        })

        it('falls back to lowercased tag name when data-type is absent', () => {
            const ir = htmlToIR('<section>x</section>')
            expect(ir[0].type).toBe('section')
        })

        it('strips data-type from properties (it is consumed by type resolution)', () => {
            const ir = htmlToIR('<p data-type="paragraph" data-margins-top="100">x</p>')
            expect(ir[0]).not.toHaveProperty('data-type')
            expect(ir[0]).not.toHaveProperty('type-of-element')
            expect(ir[0].type).toBe('paragraph')
            expect(ir[0].margins).toEqual({ top: '100' })
        })
    })

    describe('properties from data-* attributes', () => {
        it('attaches properties via attributesToProperties', () => {
            const ir = htmlToIR(
                '<div data-type="tableCell" data-width-size="50" data-width-type="pct" data-margins-top="100"></div>',
            )
            expect(ir[0]).toEqual({
                type: 'tableCell',
                width: { size: '50', type: 'pct' },
                margins: { top: '100' },
            })
        })

        it('falls through to flat properties for unknown data-* attributes', () => {
            const ir = htmlToIR('<h1 data-type="paragraph" data-heading="HEADING_1">Title</h1>')
            expect(ir[0]).toMatchObject({
                type: 'paragraph',
                heading: 'HEADING_1',
            })
        })

        it('skips non-data attributes (class, id, style)', () => {
            const ir = htmlToIR(
                '<p data-type="paragraph" class="pl-8" id="x" style="color: red">x</p>',
            )
            expect(ir[0]).not.toHaveProperty('class')
            expect(ir[0]).not.toHaveProperty('id')
            expect(ir[0]).not.toHaveProperty('style')
        })
    })

    describe('special node types', () => {
        it('drops emptyLine elements entirely', () => {
            const ir = htmlToIR(
                '<p data-type="paragraph">a</p><span data-type="emptyLine">x</span><p data-type="paragraph">b</p>',
            )
            expect(ir).toHaveLength(2)
            expect(ir[0].children[0].content).toBe('a')
            expect(ir[1].children[0].content).toBe('b')
        })

        it('makes contentWrapper transparent — children spread into parent', () => {
            const ir = htmlToIR(
                '<div data-type="tableCell"><div data-type="contentWrapper"><p data-type="paragraph">a</p><p data-type="paragraph">b</p></div></div>',
            )
            expect(ir[0]).toEqual({
                type: 'tableCell',
                children: [
                    { type: 'paragraph', children: [{ type: 'text', content: 'a' }] },
                    { type: 'paragraph', children: [{ type: 'text', content: 'b' }] },
                ],
            })
        })

        it('handles top-level contentWrapper by spreading into the result array', () => {
            const ir = htmlToIR(
                '<div data-type="contentWrapper"><p data-type="paragraph">a</p><p data-type="paragraph">b</p></div>',
            )
            expect(ir).toHaveLength(2)
            expect(ir[0].type).toBe('paragraph')
            expect(ir[1].type).toBe('paragraph')
        })

        it('builds element-level text nodes by concatenating descendants', () => {
            // <span data-type='text'> with raw text inside should produce
            // a single text node with concatenated content.
            const ir = htmlToIR('<span data-type="text">Hello world</span>')
            expect(ir[0]).toEqual({ type: 'text', content: 'Hello world' })
        })
    })

    describe('nested structures', () => {
        it('parses a full table tree with cells, rows, and properties', () => {
            const html = `
                <div data-type="table">
                    <div data-type="tableRow">
                        <div data-type="tableCell" data-width-size="50" data-width-type="pct" data-margins-top="100" data-borders-top-style="single">
                            <p data-type="paragraph">Cell A</p>
                        </div>
                        <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                            <p data-type="paragraph">Cell B</p>
                        </div>
                    </div>
                </div>
            `
            const ir = htmlToIR(html)
            expect(ir).toHaveLength(1)
            expect(ir[0].type).toBe('table')
            expect(ir[0].children).toHaveLength(1)

            const row = ir[0].children[0]
            expect(row.type).toBe('tableRow')
            expect(row.children).toHaveLength(2)

            const [cellA, cellB] = row.children
            expect(cellA).toMatchObject({
                type: 'tableCell',
                width: { size: '50', type: 'pct' },
                margins: { top: '100' },
                borders: { top: { style: 'single' } },
            })
            expect(cellA.children[0]).toEqual({
                type: 'paragraph',
                children: [{ type: 'text', content: 'Cell A' }],
            })

            expect(cellB).toMatchObject({
                type: 'tableCell',
                width: { size: '50', type: 'pct' },
            })
            expect(cellB.children[0]).toEqual({
                type: 'paragraph',
                children: [{ type: 'text', content: 'Cell B' }],
            })
        })

        it('handles mixed siblings at the top level', () => {
            const html = `
                <h1 data-type="paragraph" data-heading="HEADING_1">Report Title</h1>
                <p data-type="paragraph">Intro paragraph.</p>
                <div data-type="table">
                    <div data-type="tableRow">
                        <div data-type="tableCell"><p data-type="paragraph">x</p></div>
                    </div>
                </div>
            `
            const ir = htmlToIR(html)
            expect(ir).toHaveLength(3)
            expect(ir[0].heading).toBe('HEADING_1')
            expect(ir[1].children[0].content).toBe('Intro paragraph.')
            expect(ir[2].type).toBe('table')
        })
    })

    describe('edge cases', () => {
        it('returns an empty array for empty input', () => {
            expect(htmlToIR('')).toEqual([])
        })

        it('returns an empty array for whitespace-only input', () => {
            expect(htmlToIR('   \n  \t  ')).toEqual([])
        })

        it('handles self-closing-style elements', () => {
            // parse5 normalizes <br /> to <br>; we treat it as an empty
            // element with no children.
            const ir = htmlToIR('<br />')
            expect(ir).toEqual([{ type: 'br' }])
        })

        it('omits the children key when there are no children', () => {
            const ir = htmlToIR('<div data-type="tableCell" data-width-size="50"></div>')
            expect(ir[0]).not.toHaveProperty('children')
        })
    })
})
