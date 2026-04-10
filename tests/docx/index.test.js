import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import { buildDocument, compileDocx } from '../../src/docx/index.js'
import { htmlToIR } from '../../src/ir/parser.js'

/**
 * Helper: parse HTML, wrap in a single-section walker-output shape,
 * and build a Document.
 */
function buildFromHtml(html) {
    const ir = htmlToIR(html)
    return buildDocument({ sections: [ir] })
}

/**
 * Helper: convert a Document to a Buffer for inspection.
 */
async function toBuffer(doc) {
    return Packer.toBuffer(doc)
}

describe('buildDocument', () => {
    it('creates a Document from minimal IR', async () => {
        const doc = buildDocument({
            sections: [[{ type: 'paragraph', children: [{ type: 'text', content: 'Hello' }] }]],
        })
        expect(doc).toBeDefined()
        // Verify Document was created by checking it's a docx Document instance
        // (internal structure is not publicly exposed — just verify it packs).
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('handles empty sections gracefully', () => {
        const doc = buildDocument({ sections: [] })
        expect(doc).toBeDefined()
    })

    it('flattens multiple block IR arrays into one section', () => {
        const block1 = [{ type: 'paragraph', children: [{ type: 'text', content: 'Block 1' }] }]
        const block2 = [{ type: 'paragraph', children: [{ type: 'text', content: 'Block 2' }] }]
        const doc = buildDocument({ sections: [block1, block2] })
        expect(doc).toBeDefined()
    })
})

describe('end-to-end: HTML → IR → docx buffer', () => {
    it('produces a valid docx buffer from a simple paragraph', async () => {
        const doc = buildFromHtml('<p data-type="paragraph">Hello world</p>')
        const buffer = await toBuffer(doc)
        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.length).toBeGreaterThan(0)
        // docx files are ZIP archives — magic bytes PK (0x50, 0x4B).
        expect(buffer[0]).toBe(0x50)
        expect(buffer[1]).toBe(0x4b)
    })

    it('produces a valid docx from a heading', async () => {
        const doc = buildFromHtml(
            '<h1 data-type="paragraph" data-heading="HEADING_1">Report Title</h1>',
        )
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
        expect(buffer[0]).toBe(0x50)
    })

    it('produces a valid docx from bold/italic/underline text', async () => {
        const html = `
            <p data-type="paragraph">
                <span data-type="text" data-bold="true">Bold</span>
                <span data-type="text" data-italics="true">Italic</span>
                <span data-type="text" data-underline="true">Underlined</span>
            </p>
        `
        const doc = buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('produces a valid docx from a table with cells', async () => {
        const html = `
            <div data-type="table">
                <div data-type="tableRow">
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct"
                         data-margins-top="100" data-margins-bottom="50"
                         data-borders-top-style="single" data-borders-top-size="4" data-borders-top-color="000000">
                        <p data-type="paragraph">Cell A</p>
                    </div>
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">Cell B</p>
                    </div>
                </div>
            </div>
        `
        const doc = buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
        expect(buffer[0]).toBe(0x50)
    })

    it('produces a valid docx from an external hyperlink', async () => {
        const html = `
            <p data-type="paragraph">
                <a data-type="externalHyperlink" data-link="https://example.com">
                    <span data-type="text">Click here</span>
                </a>
            </p>
        `
        const doc = buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('produces a valid docx from a bullet list', async () => {
        const html = `
            <p data-type="paragraph" data-bullet-level="0">First item</p>
            <p data-type="paragraph" data-bullet-level="0">Second item</p>
            <p data-type="paragraph" data-bullet-level="1">Sub-item</p>
        `
        const doc = buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('produces a valid docx from spacing attributes', async () => {
        const html = `
            <p data-type="paragraph" data-spacing-before="200" data-spacing-after="100">
                Spaced paragraph
            </p>
        `
        const doc = buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('handles mixed content: heading + paragraph + table', async () => {
        const html = `
            <h1 data-type="paragraph" data-heading="HEADING_1">Annual Report</h1>
            <p data-type="paragraph">This is the summary.</p>
            <div data-type="table">
                <div data-type="tableRow">
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">
                            <span data-type="text" data-bold="true">Source</span>
                        </p>
                    </div>
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">
                            <span data-type="text" data-bold="true">Amount</span>
                        </p>
                    </div>
                </div>
                <div data-type="tableRow">
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">NSERC</p>
                    </div>
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">$150,000</p>
                    </div>
                </div>
            </div>
        `
        const doc = buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
        expect(buffer[0]).toBe(0x50)
    })
})

describe('header and footer', () => {
    it('includes header when provided', async () => {
        const headerIR = htmlToIR('<p data-type="paragraph">Header text</p>')
        const bodyIR = htmlToIR('<p data-type="paragraph">Body text</p>')
        const doc = buildDocument({
            sections: [bodyIR],
            header: headerIR,
        })
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('includes footer when provided', async () => {
        const footerIR = htmlToIR('<p data-type="paragraph">Page footer</p>')
        const bodyIR = htmlToIR('<p data-type="paragraph">Body text</p>')
        const doc = buildDocument({
            sections: [bodyIR],
            footer: footerIR,
        })
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })
})

describe('compileDocx', () => {
    it('returns a Blob (or Buffer in Node) with valid docx content', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Test</p>')
        const result = await compileDocx({ sections: [ir] })
        // In Node, Packer.toBlob may return a Buffer; in browser, a Blob.
        expect(result).toBeDefined()
        if (result instanceof Buffer) {
            expect(result.length).toBeGreaterThan(0)
            expect(result[0]).toBe(0x50)
        } else {
            // Blob (browser / jsdom)
            expect(result.size).toBeGreaterThan(0)
        }
    })
})
